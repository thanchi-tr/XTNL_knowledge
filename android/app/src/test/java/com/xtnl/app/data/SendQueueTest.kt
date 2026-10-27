package com.xtnl.app.data

import com.xtnl.app.core.CheckinLine
import com.xtnl.app.core.SendLine
import com.xtnl.app.core.SetLine
import com.xtnl.app.core.TimeLabels
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.time.Instant
import java.time.LocalDate

/**
 * The offline queue (blueprint P8, decision D34): a tick queued offline before 04:00 and replayed after it books on its
 * original day; a replay with the same clientId writes once; review answers are never queued; a line from an earlier
 * day is kept back, never saved on the wrong day; the server's no sets an item aside, its token holds them all.
 * Health phase 2: a check-in and a set wait too, each with its own clientId and its own instant, and land once.
 */
class SendQueueTest {
    private val src = "https://xtnl.example"

    /** 03:30 on Sun 25 Oct, Sydney (AEDT): still Saturday's life day. */
    private val beforeFour = Instant.parse("2026-10-24T16:30:00Z")
    /** 04:30 the same night: Sunday's life day. */
    private val afterFour = Instant.parse("2026-10-24T17:30:00Z")

    private fun queue(server: FakeServer, store: QueueStore = MemoryQueueStore(), source: () -> String = { src }) =
        SendQueue(store, source = source, api = { server }, clock = { server.now.toEpochMilli() })

    @Test fun aTickQueuedOfflineBeforeFourBooksOnItsOwnDayAfterIt() = runTest {
        val server = FakeServer(beforeFour).apply { reachable = false }
        val q = queue(server)
        val day = q.today()
        assertEquals("the tap's own life day: 03:30 is still Saturday's", "2026-10-24", day)
        assertTrue(q.enqueue(QueuedWrite.tick("c-1", src, day, "Gym legs", "t-gym")))
        assertEquals(SendQueue.Pass.RETRY, q.pass())
        assertEquals("no answer: it still waits", 1, q.state.value.items.size)

        // Back online after the day turned at 04:00.
        server.now = afterFour
        server.reachable = true
        assertEquals("2026-10-25", q.today())
        val landed = async { q.landed.first() }
        yield()
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals("it booked on Saturday, its own day, never Sunday", listOf(Booked("t-gym", LocalDate.parse("2026-10-24"))), server.ticks)
        assertEquals(listOf("2026-10-24"), server.calls.map { it.last() })
        assertTrue(q.state.value.items.isEmpty())
        val l = landed.await() as Landed.Tick
        assertEquals("+8.3 XP · Body · yesterday", l.result.line)
        assertEquals("Sent: Gym legs · +8.3 XP · Body · yesterday", SendLine.sentTick(l.item.label, l.result.line))
    }

    /** The demo books a day key the way the server does: yesterday's on the Yesterday lane, an older one refused. */
    @Test fun theDemoBooksADayKeyAsTheServerDoes() = runTest {
        val demo = DemoApi(clock = { afterFour })
        val y = (demo.completeTask("t-meds", mvv = false, clientId = "d-1", day = "2026-10-24") as Outcome.Ok).value
        assertEquals("+3.6 XP · Care · yesterday", y.line)
        val today = (demo.completeTask("t-gym", mvv = false, clientId = "d-2", day = "2026-10-25") as Outcome.Ok).value
        assertTrue(today.line, today.line!!.startsWith("+") && !today.line!!.contains("yesterday"))
        val old = demo.completeTask("t-stretch", mvv = false, clientId = "d-3", day = "2026-10-23") as Outcome.Err
        assertEquals(409, old.status)
        assertEquals("The board is out of date: that day can no longer be recorded. Refresh and try again.", old.message)
    }

    @Test fun aReplayWithTheSameClientIdWritesOnce() = runTest {
        val server = FakeServer(afterFour)
        val q = queue(server)
        val day = q.today()
        // Check's first try: the tick lands on the server, then its answer is lost (the phone reads no answer).
        server.loseNextAnswer = true
        assertTrue(server.completeTask("t-gym", false, "c-2", null, null, null, false, day) is Outcome.Err)
        // So it waits with the same clientId and the same body, and the queue replays it.
        q.enqueue(QueuedWrite.tick("c-2", src, day, "Gym legs", "t-gym"))
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals("one write", 1, server.ticks.size)
        assertEquals("two requests, the same one", 2, server.calls.size)
        assertEquals(server.calls[0], server.calls[1])

        // The same inside the queue: a pass whose answer is lost, then the next pass.
        server.loseNextAnswer = true
        q.enqueue(QueuedWrite.tick("c-3", src, day, "Stretch", "t-stretch"))
        assertEquals(SendQueue.Pass.RETRY, q.pass())
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals(2, server.ticks.size)
        assertEquals(server.calls[2], server.calls[3])

        // A line: saved once per clientId (its capture key).
        server.loseNextAnswer = true
        q.enqueue(QueuedWrite.log("c-4", src, day, "buy milk", "task"))
        assertEquals(SendQueue.Pass.RETRY, q.pass())
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals(listOf("buy milk"), server.lines)

        // Once per clientId on the phone too: the same id again is the one already waiting.
        server.reachable = false
        assertTrue(q.enqueue(QueuedWrite.tick("c-5", src, day, "Floss", "t-floss")))
        assertTrue(q.enqueue(QueuedWrite.tick("c-5", src, day, "Floss", "t-floss")))
        assertEquals(1, q.state.value.items.size)
    }

    @Test fun reviewAnswersAreNeverQueued() {
        // Re-pinned on purpose for health phase 2: the check-in (CHECKIN) and the set (SET) wait too; a review answer still never does.
        assertEquals(listOf("/tasks/complete", "/log", "/work/done", "/checkin", "/lift/set"), SendLine.Kind.entries.map { it.path })
        assertEquals(listOf("TICK", "LOG", "WORK_DONE", "CHECKIN", "SET"), SendLine.Kind.entries.map { it.name })
        for (path in listOf("/checkin/undo")) assertNull("$path never waits", SendLine.Kind.ofPath(path))
        for (path in listOf("/review/answer", "/review/queue", "/tasks/undo", "/tasks/makeup", "/mall/buy", "/log/undo", "/ideas")) {
            assertNull("$path never waits", SendLine.Kind.ofPath(path))
        }
        // Review's answers go straight to the server: its ViewModel never touches the queue.
        val f = File("src/main/java/com/xtnl/app/ui/review/ReviewViewModel.kt").takeIf { it.exists() } ?: File("app/src/main/java/com/xtnl/app/ui/review/ReviewViewModel.kt")
        val review = f.readText()
        assertTrue(review.contains("graph.api.answer("))
        for (word in listOf("sendQueue", "QueuedWrite", "SendQueue")) assertFalse("$word in ReviewViewModel", review.contains(word))
    }

    @Test fun aLineFromAnEarlierDayIsKeptBackNeverSavedOnTheNewDay() = runTest {
        val server = FakeServer(beforeFour).apply { reachable = false }
        val q = queue(server)
        q.enqueue(QueuedWrite.log("l-1", src, q.today(), "call mum tomorrow", "task"))
        assertEquals(SendQueue.Pass.RETRY, q.pass())
        server.now = afterFour
        server.reachable = true
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertTrue("nothing saved on Sunday", server.lines.isEmpty())
        val note = q.state.value.notSent.single()
        assertTrue(note.keptBack)
        assertEquals("Typed Sat 24 Oct, before 04:00, and it got no answer, so it may already be saved. Look on Today first: sent now, it saves for today.", note.line)
        // The user sends it for today: the same clientId, so a first try that saved a row is answered as that row (one that
        // ticked a row it named wrote none: the line says it may already be saved, and sending is the user's call).
        assertTrue(q.sendForToday("l-1", q.today()))
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals(listOf("call mum tomorrow"), server.lines)
        assertTrue(q.state.value.notSent.isEmpty())
    }

    /** P8 review: a line's day is the tap's, read before the send, so a send that times out across 04:00 is kept back. */
    @Test fun aLineWhoseAnswerIsLostAcrossFourIsKeptBack() = runTest {
        val server = FakeServer(Instant.parse("2026-10-24T16:59:50Z")) // 03:59:50 Sun: Saturday's life day
        val q = queue(server)
        val day = q.today()
        assertEquals("2026-10-24", day)
        // The send times out at 04:00:15; the line waits with the day it was typed on, not the day its failure came.
        server.now = Instant.parse("2026-10-24T17:00:15Z")
        assertTrue(q.enqueue(QueuedWrite.log("t-1", src, day, "x gym 45m", "task")))
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertTrue("never saved on Sunday by itself", server.lines.isEmpty())
        assertTrue(q.state.value.notSent.single().keptBack)
        // LogViewModel reads the day before it sends (and the Done its own before its send, in CheckViewModel).
        fun src(p: String) = (File("src/main/java/com/xtnl/app/$p").takeIf { it.exists() } ?: File("app/src/main/java/com/xtnl/app/$p")).readText()
        val log = src("ui/log/LogViewModel.kt")
        assertTrue(log.indexOf("val day = graph.sendQueue.today()") in 0 until log.indexOf("graph.api.log(text, u.section.wire, clientId)"))
    }

    /** P8 review: a /check that keeps failing holds only the lines (their day needs the server's); a tick behind one lands. */
    @Test fun aCheckThatFailsHoldsTheLinesButNotTheTicks() = runTest {
        val server = FakeServer(afterFour).apply { checkRefuse = Outcome.Err("The server had a problem (502). Try again.", status = 502) }
        val q = queue(server)
        val day = q.today()
        q.enqueue(QueuedWrite.log("k-1", src, day, "buy milk", "task"))
        q.enqueue(QueuedWrite.tick("k-2", src, day, "Gym legs", "t-gym"))
        q.enqueue(QueuedWrite.workDone("k-3", src, day, "Call Jordan back", "w-1"))
        assertEquals("the lines wait for the next pass", SendQueue.Pass.RETRY, q.pass())
        assertEquals("the tick behind the line landed", 1, server.ticks.size)
        assertEquals(listOf("w-1"), server.done)
        assertEquals(listOf("k-1"), q.state.value.items.map { it.clientId })
        assertTrue(server.lines.isEmpty())
        assertTrue("nothing is set aside over /check", q.state.value.notSent.isEmpty())
        server.checkRefuse = null
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals(listOf("buy milk"), server.lines)
        // The token still holds everything, as before.
        server.checkRefuse = Outcome.Err(HttpApi.AUTH_LINE, code = "auth", status = 401)
        q.enqueue(QueuedWrite.log("k-4", src, day, "eggs", "task"))
        q.enqueue(QueuedWrite.tick("k-5", src, day, "Stretch", "t-stretch"))
        assertEquals(SendQueue.Pass.HELD, q.pass())
        assertEquals(2, q.state.value.items.size)
    }

    /** Health phase 2: a check-in made offline at 03:30 and sent after 04:00 keeps its own instant and its day, and lands once. */
    @Test fun aCheckinQueuedOfflineReplaysOnceWithItsOwnInstant() = runTest {
        val server = FakeServer(beforeFour).apply { reachable = false }
        val q = queue(server)
        val body = CheckinLine.bodyOf(CheckinLine.Cell(2, -1), stress = 1, via = "widget", at = beforeFour, tookMs = 3_200)
        assertTrue(q.enqueue(QueuedWrite.checkin("ci-1", src, body)))
        val item = q.state.value.items.single()
        assertEquals(SendLine.Kind.CHECKIN, item.kind)
        assertEquals("its day is its own instant's: 03:30 is still Saturday's", "2026-10-24", item.day)
        assertEquals("its label is the time alone, never a value", "Check-in at 03:30", item.label)
        assertEquals(SendQueue.Pass.RETRY, q.pass())
        // Back online after 04:00; the first try's answer is lost, so the queue sends the same request again.
        server.now = afterFour
        server.reachable = true
        server.loseNextAnswer = true
        assertEquals(SendQueue.Pass.RETRY, q.pass())
        val landed = async { q.landed.first() }
        yield()
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals("one check-in", 1, server.checkins.size)
        assertEquals("the same body on every try", listOf(body, body), server.checkinCalls)
        assertEquals("booked when it was made, not when it landed", "2026-10-24T16:30:00Z", server.checkins.single().at)
        val l = landed.await() as Landed.Checkin
        assertEquals("Logged 03:30", l.result.line)
        assertEquals("Check-in sent · Logged 03:30", CheckinLine.sent(l.result.line))
        assertTrue(q.state.value.items.isEmpty())
    }

    /** Health phase 2: the server keeps a check-in up to a week back; an older one is set aside unsent, one exactly a week old goes. */
    @Test fun aCheckinMoreThanAWeekOldIsSetAsideUnsent() = runTest {
        val server = FakeServer(afterFour)
        val q = queue(server)
        // 09:00 Sat 17 Oct, Sydney: 8 life days before Sunday 25 Oct.
        val old = CheckinLine.bodyOf(CheckinLine.Cell(0, 0), null, "check", Instant.parse("2026-10-16T22:00:00Z"), null)
        q.enqueue(QueuedWrite.checkin("ci-old", src, old))
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertTrue("never sent", server.checkinCalls.isEmpty())
        assertEquals("The check-in from Sat 17 Oct is more than a week old, so it wasn't sent.", q.state.value.notSent.single().line)
        // 09:00 Sun 18 Oct: exactly a week back, still kept by the server.
        val week = CheckinLine.bodyOf(CheckinLine.Cell(0, 0), null, "check", Instant.parse("2026-10-17T22:00:00Z"), null)
        q.enqueue(QueuedWrite.checkin("ci-week", src, week))
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals(listOf(week), server.checkins)
    }

    /** Health phase 2: a set's ✓ with no answer waits, holds the card's next ✓, and lands once with its own instant and no `ord`. */
    @Test fun aSetQueuedOfflineLandsOnce() = runTest {
        val server = FakeServer(afterFour).apply { reachable = false }
        val q = queue(server)
        val next = LiftNext("e-bench", "bench_press", "Bench press", ord = 2, weightKg = 60.0, reps = 8, fromLast = true, setText = "60 kg × 8")
        val lift = OpenLift("lift-1", "Push day", next = next)
        val body = SetLine.bodyOf(lift, next, afterFour.toString())!!
        assertTrue(q.enqueue(QueuedWrite.liftSet("st-1", src, SetLine.label(next), body)))
        assertEquals("the card's ✓ waits for it", 1, SetLine.waiting(lift, q.state.value))
        assertEquals("Bench press 60 kg × 8", q.state.value.items.single().label)
        assertEquals(SendQueue.Pass.RETRY, q.pass())
        server.reachable = true
        server.loseNextAnswer = true
        assertEquals(SendQueue.Pass.RETRY, q.pass())
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals("one set", 1, server.sets.size)
        assertEquals("the same body on every try", listOf(body, body), server.setCalls)
        assertEquals(afterFour.toString(), server.sets.single().doneAt)
        assertFalse("never an ord: the server takes the movement's next place", liftSetJson(body, "st-1").containsKey("ord"))
        assertEquals(0, SetLine.waiting(lift, q.state.value))
    }

    @Test fun aTickTooOldToBookIsSetAsideUnsent() = runTest {
        val server = FakeServer(afterFour)
        val q = queue(server)
        q.enqueue(QueuedWrite.tick("o-1", src, "2026-10-23", "Gym legs", "t-gym"))
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertTrue("never sent", server.calls.isEmpty())
        assertEquals("Gym legs was ticked Fri 23 Oct. Only today and yesterday can still be recorded, so it wasn't sent.", q.state.value.notSent.single().line)
    }

    @Test fun theServersNoSetsItAsideAndItsTokenHoldsThemAll() = runTest {
        val server = FakeServer(afterFour)
        val q = queue(server)
        val day = q.today()
        server.refuse = Outcome.Err("That task no longer exists.", code = "gone", status = 404)
        q.enqueue(QueuedWrite.tick("r-1", src, day, "Gym legs", "t-gym"))
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals("That task no longer exists.", q.state.value.notSent.single().line)

        server.refuse = Outcome.Err(HttpApi.AUTH_LINE, code = "auth", status = 401)
        q.enqueue(QueuedWrite.tick("r-2", src, day, "Stretch", "t-stretch"))
        q.enqueue(QueuedWrite.workDone("r-3", src, day, "Call Jordan back", "w-1"))
        assertEquals(SendQueue.Pass.HELD, q.pass())
        assertEquals("the server's own line says why", HttpApi.AUTH_LINE, q.state.value.held)
        assertEquals("both still wait", 2, q.state.value.items.size)
        assertEquals(1, q.state.value.notSent.size)
        server.refuse = null
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertNull(q.state.value.held)
        assertTrue(q.state.value.items.isEmpty())
    }

    @Test fun aServerFaultIsTriedAgainThenSetAside() = runTest {
        val server = FakeServer(afterFour).apply { refuse = Outcome.Err("The server had a problem (502). Try again.", status = 502) }
        val q = queue(server)
        q.enqueue(QueuedWrite.tick("f-1", src, q.today(), "Gym legs", "t-gym"))
        repeat(SendLine.SERVER_TRIES - 1) { assertEquals(SendQueue.Pass.RETRY, q.pass()) }
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals("The server had a problem (502). Try again.", q.state.value.notSent.single().line)
    }

    @Test fun aDoneGoesWhateverTheDay() = runTest {
        val server = FakeServer(afterFour)
        val q = queue(server)
        q.enqueue(QueuedWrite.workDone("w-1", src, "2026-10-20", "Call Jordan back", "work-1"))
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals(listOf("work-1"), server.done)
    }

    @Test fun anotherServersItemsWaitForIt() = runTest {
        val server = FakeServer(afterFour)
        var source = "https://other.example"
        val q = queue(server, source = { source })
        q.enqueue(QueuedWrite.tick("s-1", src, "2026-10-25", "Gym legs", "t-gym"))
        assertEquals("never sent to another address", SendQueue.Pass.IDLE, q.pass())
        assertTrue(server.calls.isEmpty())
        source = src
        assertEquals(SendQueue.Pass.DONE, q.pass())
        assertEquals(1, server.ticks.size)
    }

    @Test fun demoDataNeverWaits() {
        val q = queue(FakeServer(afterFour))
        assertFalse(q.enqueue(QueuedWrite.tick("d-1", SendQueue.DEMO, "2026-10-25", "Gym legs", "t-gym")))
        assertTrue(q.state.value.items.isEmpty())
    }

    @Test fun undoTakesAWaitingTickOffThePhoneButNotOneOnItsWay() = runTest {
        val server = FakeServer(afterFour)
        val q = queue(server)
        val day = q.today()
        q.enqueue(QueuedWrite.tick("u-1", src, day, "Gym legs", "t-gym"))
        assertTrue(q.cancel("u-1"))
        assertEquals(SendQueue.Pass.IDLE, q.pass())
        assertTrue("nothing sent", server.calls.isEmpty())

        val gate = CompletableDeferred<Unit>()
        server.gate = gate
        q.enqueue(QueuedWrite.tick("u-2", src, day, "Stretch", "t-stretch"))
        val pass = async { q.pass() }
        while ("u-2" !in q.state.value.sending) yield()
        assertFalse("on its way: its Undo waits for the answer", q.cancel("u-2"))
        gate.complete(Unit)
        assertEquals(SendQueue.Pass.DONE, pass.await())
        assertEquals(1, server.ticks.size)
    }

    @Test fun whatWaitsSurvivesARestart() = runTest {
        val dir = Files.createTempDirectory("xtnl-queue").toFile()
        val file = File(dir, "send-queue.json")
        val server = FakeServer(afterFour).apply { reachable = false }
        val first = queue(server, FileQueueStore(file))
        first.enqueue(QueuedWrite.tick("p-1", src, "2026-10-25", "Gym legs", "t-gym", minutes = 45))
        first.enqueue(QueuedWrite.log("p-2", src, "2026-10-25", "buy milk", "task"))
        // Health phase 2: a check-in and a set come back as they were sent the first time.
        val ci = CheckinLine.bodyOf(CheckinLine.Cell(-3, 2), 4, "tile", afterFour, 2_100)
        first.enqueue(QueuedWrite.checkin("p-3", src, ci))
        val set = LiftSetBody("lift-1", "e-1", afterFour.toString(), "DROP", 47.5, 10)
        first.enqueue(QueuedWrite.liftSet("p-4", src, "Bench press 47.5 kg × 10", set))
        val again = queue(server, FileQueueStore(file))
        assertEquals(first.state.value.items, again.state.value.items)
        assertEquals(45, again.state.value.items.first().minutes)
        assertEquals(ci, again.state.value.items[2].checkinBody())
        assertEquals(set, again.state.value.items[3].setBody())
        dir.deleteRecursively()
    }

    /** The cache follows what landed: a tick's row done on the lane its day names, a Done's item gone. */
    @Test fun theCacheFollowsWhatLanded() {
        val data = CheckData(
            day = "2026-10-25",
            tasks = listOf(TaskItem("t-gym", "Gym legs", "MUST", "OPEN", xpHint = 8.3)),
            yesterday = YesterdayLane(day = "2026-10-24", tasks = listOf(TaskItem("t-gym", "Gym legs", "MUST", "OPEN", xpHint = 8.3))),
            work = listOf(WorkItem("w-1", title = "Call Jordan back")),
        )
        val y = CheckCache.followed(data, Landed.Tick(QueuedWrite.tick("c", src, "2026-10-24", "Gym legs", "t-gym", yesterday = true), CompleteResult("i-1", 8.3)))
        assertEquals("OPEN", y.tasks.single().status)
        assertEquals("DONE", y.yesterday!!.tasks.single().status)
        val t = CheckCache.followed(data, Landed.Tick(QueuedWrite.tick("c", src, "2026-10-25", "Gym legs", "t-gym", mvv = true), CompleteResult("i-2", 4.2)))
        assertEquals("DONE_MVV", t.tasks.single().status)
        assertEquals(4.2, t.tasks.single().xpHint!!, 0.0)
        val w = CheckCache.followed(data, Landed.Work(QueuedWrite.workDone("c", src, "2026-10-25", "Call Jordan back", "w-1"), WorkResult("w-1", "2026-10-24T22:00:00Z")))
        assertTrue(w.work.isEmpty())
        // P8 review: a tick made on Check is followed the same way (CheckCache.followTick), so the widget stops listing it.
        val c = CheckCache.ticked(data, "t-gym", "2026-10-25", mvv = false, xp = 8.3)
        assertEquals("DONE", c.tasks.single().status)
        assertEquals("OPEN", c.yesterday!!.tasks.single().status)
        assertEquals("a day the board doesn't show changes nothing", data, CheckCache.ticked(data, "t-gym", "2026-10-20", mvv = false, xp = 8.3))
        assertEquals("no figure keeps the hint", 8.3, CheckCache.ticked(data, "t-gym", "2026-10-24", mvv = false, xp = null).yesterday!!.tasks.single().xpHint!!, 0.0)
    }
}

/** A booked tick: its row and the life day it landed on. */
internal data class Booked(val templateId: String, val day: LocalDate)

/**
 * A server as the mobile routes answer (tasks.ts resolveDay by its own [now]: today or yesterday, an older day refused;
 * a tick paid once per row and day; a clientId answering its first result), that can be unreachable, lose an answer
 * after the write, refuse, or hold a request at [gate]. Every other route is the demo's.
 */
internal class FakeServer(var now: Instant, demo: DemoApi = DemoApi()) : XtnlApi by demo {
    var reachable = true
    var loseNextAnswer = false
    var refuse: Outcome.Err? = null
    /** GET /check's own refusal (a fault, the token), whatever the writes do. */
    var checkRefuse: Outcome.Err? = null
    var gate: CompletableDeferred<Unit>? = null
    val ticks = mutableListOf<Booked>()
    val lines = mutableListOf<String>()
    val done = mutableListOf<String>()
    /** Health phase 2: the check-ins and sets written, and every request that arrived. */
    val checkins = mutableListOf<CheckinBody>()
    val checkinCalls = mutableListOf<CheckinBody>()
    val sets = mutableListOf<LiftSetBody>()
    val setCalls = mutableListOf<LiftSetBody>()
    /** Each tick request as it arrived: its fields, the day last. */
    val calls = mutableListOf<List<Any?>>()
    private val replies = HashMap<String, Pair<List<Any?>, Outcome<*>>>()

    private val offline = Outcome.Err("Can't reach xtnl.example. Check the connection.", offline = true)

    override suspend fun check(): Outcome<CheckData> =
        if (!reachable) offline else checkRefuse ?: Outcome.Ok(CheckData(now = now.toString(), day = TimeLabels.lifeDay(now).toString()))

    @Suppress("UNCHECKED_CAST")
    private fun <T> answer(clientId: String, body: List<Any?>, write: () -> Outcome<T>): Outcome<T> {
        replies[clientId]?.let { (b, r) -> return if (b == body) r as Outcome<T> else Outcome.Err("That clientId was already used for a different request.", code = "conflict", status = 409) }
        val r = write()
        if (r is Outcome.Ok) replies[clientId] = body to r
        if (loseNextAnswer) {
            loseNextAnswer = false
            return offline
        }
        return r
    }

    override suspend fun completeTask(
        templateId: String, mvv: Boolean, clientId: String, minutes: Int?, sessionId: String?, pages: Int?, yesterday: Boolean, day: String?,
    ): Outcome<CompleteResult> {
        gate?.await()
        if (!reachable) return offline
        refuse?.let { return it }
        val wire = day ?: if (yesterday) "yesterday" else "today"
        val body = listOf(templateId, mvv, minutes, sessionId, pages, wire)
        calls += body
        return answer(clientId, body) {
            val today = TimeLabels.lifeDay(now)
            val booked = when (wire) { "today" -> today; "yesterday" -> today.minusDays(1); else -> LocalDate.parse(wire) }
            if (booked != today && booked != today.minusDays(1)) {
                Outcome.Err("The board is out of date: that day can no longer be recorded. Refresh and try again.", code = "conflict", status = 409)
            } else if (ticks.any { it.templateId == templateId && it.day == booked }) {
                Outcome.Ok(CompleteResult("i-x", 0.0, "Already recorded. Nothing is paid twice."))
            } else {
                ticks += Booked(templateId, booked)
                Outcome.Ok(CompleteResult("i-${ticks.size}", 8.3, "+8.3 XP · Body" + if (booked != today) " · yesterday" else ""))
            }
        }
    }

    override suspend fun log(text: String, section: String, clientId: String): Outcome<LogResult> {
        if (!reachable) return offline
        refuse?.let { return it }
        return answer(clientId, listOf(text, section)) {
            lines += text
            Outcome.Ok(LogResult("task", "t-${lines.size}", text, "Added. $text → Today"))
        }
    }

    override suspend fun workDone(id: String, clientId: String): Outcome<WorkResult> {
        if (!reachable) return offline
        refuse?.let { return it }
        return answer(clientId, listOf(id)) {
            if (id !in done) done += id
            Outcome.Ok(WorkResult(id, now.toString()))
        }
    }

    /** POST /checkin: once per clientId, booked at the body's own `at`; the line is the time alone. */
    override suspend fun checkin(body: CheckinBody, clientId: String): Outcome<CheckinResult> {
        gate?.await()
        if (!reachable) return offline
        refuse?.let { return it }
        checkinCalls += body
        return answer(clientId, listOf(body)) {
            checkins += body
            val at = Instant.parse(body.at)
            Outcome.Ok(CheckinResult("mc-${checkins.size}", TimeLabels.lifeDay(at).toString(), "Logged " + TimeLabels.clock(at, h24 = true)))
        }
    }

    /** POST /lift/set: once per clientId, at the body's own `doneAt`. */
    override suspend fun liftSet(body: LiftSetBody, clientId: String): Outcome<LiftSetResult> {
        gate?.await()
        if (!reachable) return offline
        refuse?.let { return it }
        setCalls += body
        return answer(clientId, listOf(body)) {
            sets += body
            Outcome.Ok(LiftSetResult(LiftSet("s-${sets.size}", body.entryId, sets.size, body.kind ?: "WORKING"), restSec = 180, line = "Bench press: logged 60 kg × 8."))
        }
    }
}
