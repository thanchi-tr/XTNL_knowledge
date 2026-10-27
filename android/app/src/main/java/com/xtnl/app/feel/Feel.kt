package com.xtnl.app.feel

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.HapticFeedbackConstants
import android.view.View
import com.xtnl.app.core.HapticScore
import com.xtnl.app.core.HapticScore.Beat
import com.xtnl.app.core.TickLadder
import com.xtnl.app.data.MotionChoice
import com.xtnl.app.data.Prefs
import com.xtnl.app.ui.motion.Dur
import com.xtnl.app.ui.motion.MotionLevel
import com.xtnl.app.ui.motion.SessionMoment
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Sound and haptics, one place, both soft and both on by default
 * (Settings › Sound, Haptics). Sound is silent in Still (the resolved
 * [motion], so the system's "Remove animations" too); haptics follow only
 * their own switch (the system's touch-feedback setting still applies, since
 * they go through the view and USAGE_TOUCH).
 *
 * Every moment is a score (feel/Scores.kt): haptic beats at absolute times
 * from its trigger, and at most two sounds. A tap's beat fires synchronously
 * in the click handler and its pluck plays at once (SoundPool's ~40 ms
 * output latency lands it on the 56 ms visual peak); later beats and sounds
 * are posted ahead by [Dur.HAPTIC_LEAD_MS] and [Dur.AUDIO_LEAD_MS]. Scores
 * that overlap merge into one composition; [cancel] drops a moment's
 * pending beats and sounds.
 *
 *   tick / bankAt / untick   a due task: the CLICK and the ladder's pluck, then the bank as the motes land
 *   clear                    board clear: four beats and the chime, landing on the banner's stamp
 *   correct / miss           an answer: the CLICK by combo tier, or a soft double LOW_TICK
 *   forgeCard / forgeCharacter   a level: notches, then the close; ASCEND on the beats
 *   session                  session complete: the seal's THUD and the honest SEAL
 *   stamp / landAt           a new idea's seal stamped, then landing on Review
 *   merge / duplicate        an idea folded into one you have, or not saved
 *   work                     a work item's Done: a lighter CLICK and the clack (its undo leaves the ladder alone)
 *   checkIn                  a check-in saved: one neutral TICK, the same for every value, no sound
 *   segment / select         a tab, a chip
 */
class Feel(context: Context, private val prefs: () -> Prefs) {
    private val app = context.applicationContext

    /** The window's decor view, for performHapticFeedback (set by the activity). */
    @Volatile var view: View? = null

    /** The resolved motion level (AppRoot sets it): Still mutes every sound. */
    @Volatile var motion: MotionLevel = MotionLevel.FULL

    private val main = Handler(Looper.getMainLooper())

    private val rate: Int = runCatching {
        (app.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toIntOrNull()
    }.getOrNull()?.takeIf { it in 8_000..192_000 } ?: ToneSynth.RATE

    private val pool: SoundPool = SoundPool.Builder()
        .setMaxStreams(8)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        )
        .build()
    private val ids = ConcurrentHashMap<String, Int>()
    private val ready = ConcurrentHashMap.newKeySet<Int>()

    /** Each moment's playing streams (to stop them on cancel), the newest few moments only. */
    private val streams = object : LinkedHashMap<String, MutableList<Int>>() {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, MutableList<Int>>?) = size > 16
    }
    /** Each moment's token for its posted cues. */
    private val tokens = HashMap<String, Any>()

    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= 31) {
        (app.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        app.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    /** What the motor plays, probed once off the main thread: per primitive, supported and its length (ms). */
    private class Caps(val supported: BooleanArray, val durations: IntArray) {
        fun supports(prim: Int) = prim in supported.indices && supported[prim]
        fun duration(prim: Int) = if (prim in durations.indices) durations[prim] else 20
        val primitives get() = !HapticScore.needsPredefined(::supports)
    }
    @Volatile private var caps: Caps? = null

    /** A beat not yet played: its moment and absolute uptime. */
    private class Pending(val id: String, val prim: Int, val scale: Float, val at: Long)
    private val pending = ArrayList<Pending>()
    /** The composition now playing: each primitive's [start, end) in uptime ms. */
    private var playing = LongArray(0)
    private val rebuild = Runnable { rebuild() }
    private val rebuildToken = Any()

    private val _ladder = MutableStateFlow<TickLadder.Run?>(null)
    /** The tick ladder's run: the header seal's beads (and their lapse 90 s after the last tick). */
    val ladder: StateFlow<TickLadder.Run?> = _ladder.asStateFlow()

    private var warmedAt = 0L

    init {
        pool.setOnLoadCompleteListener { _, id, status -> if (status == 0) ready += id }
        Executors.newSingleThreadExecutor().execute {
            probe()
            prepare()
        }
    }

    /** Renders every tone once into the cache (a few KB each, at the native rate) and loads it into the pool. */
    private fun prepare() {
        val dir = File(app.cacheDir, "tones").apply { mkdirs() }
        val tones = ToneSynth.palette().mapValues { ToneSynth.render(it.value, rate) } + ("silence" to ToneSynth.silence(rate))
        for ((name, samples) in tones) {
            runCatching {
                val f = File(dir, "$name-v2-$rate.wav")
                if (!f.exists()) f.writeBytes(ToneSynth.wav(samples, rate))
                ids[name] = pool.load(f.absolutePath, 1)
            }
        }
    }

    private fun probe() {
        val supported = BooleanArray(9)
        val durations = IntArray(9) { HapticScore.MEASURED_MS[it] ?: 20 }
        val vib = vibrator
        if (vib != null && Build.VERSION.SDK_INT >= 30) runCatching {
            val prims = intArrayOf(HapticScore.CLICK, HapticScore.THUD, HapticScore.QUICK_RISE, HapticScore.QUICK_FALL, HapticScore.TICK, HapticScore.LOW_TICK)
                .filter { Build.VERSION.SDK_INT >= 31 || (it != HapticScore.THUD && it != HapticScore.LOW_TICK) }.toIntArray()
            val ok = vib.arePrimitivesSupported(*prims)
            prims.forEachIndexed { i, p -> supported[p] = ok[i] }
            if (Build.VERSION.SDK_INT >= 31) {
                val d = vib.getPrimitiveDurations(*prims)
                prims.forEachIndexed { i, p -> if (d[i] > 0) durations[p] = d[i] }
            }
        }
        caps = Caps(supported, durations)
    }

    // ── Sound ───────────────────────────────────────────────────────────────

    private val muted: Boolean
        get() {
            val p = prefs()
            return !p.sound || p.motion == MotionChoice.STILL || motion == MotionLevel.STILL
        }

    /** Plays a tone now; its stream belongs to moment [id] (stopped by [cancel]). */
    fun play(name: String, vol: Float = 1f, rate: Float = 1f, id: String? = null) {
        if (muted) return
        val sound = ids[name] ?: return
        if (sound !in ready) return
        val stream = pool.play(sound, vol, vol, 1, 0, rate)
        if (id != null && stream != 0) streams.getOrPut(id) { mutableListOf() } += stream
    }

    /** Runs [block] [ms] from now on the main thread, as part of moment [id]. */
    fun at(ms: Int, id: String, block: () -> Unit) {
        if (ms <= 0) { block(); return }
        main.postAtTime(block, tokens.getOrPut(id) { Any() }, SystemClock.uptimeMillis() + ms)
    }

    /** A sound whose start lands at [ms] from now (sent [Dur.AUDIO_LEAD_MS] early for the output latency). */
    fun soundAt(ms: Int, name: String, vol: Float = 1f, id: String) {
        if (muted) return
        at(ms - Dur.AUDIO_LEAD_MS, id) { play(name, vol, 1f, id) }
    }

    /** The first touch wakes the audio path (a 20 ms silent buffer), at most every 2 s, so the first pluck is on time. */
    fun prewarm() {
        val now = SystemClock.uptimeMillis()
        if (now - warmedAt < 2_000 || muted) return
        warmedAt = now
        play("silence")
    }

    /** Drops moment [id]: its posted sounds and cues, its playing streams and its pending beats. */
    fun cancel(id: String) {
        tokens.remove(id)?.let { main.removeCallbacksAndMessages(it) }
        streams.remove(id)?.forEach { pool.stop(it) }
        if (pending.removeAll { it.id == id }) {
            runCatching { vibrator?.cancel() }
            playing = LongArray(0)
            rebuild()
        }
    }

    // ── Haptics ─────────────────────────────────────────────────────────────

    private val hapticsOn get() = prefs().haptics

    /** The view's own haptic constants, the first one this API has (each as constant to its minimum API). */
    private fun viewHaptic(vararg choices: Pair<Int, Int>) {
        if (!hapticsOn) return
        val v = view ?: return
        val c = choices.firstOrNull { Build.VERSION.SDK_INT >= it.second }?.first ?: return
        v.performHapticFeedback(c)
    }

    /**
     * Moment [id]'s beats, [offsetMs] from now. The beats join any still pending (past ones dropped, beats under
     * 40 ms apart merged) and the whole is played as one composition from now. A motor without CLICK and TICK
     * gets [fallback] (or the strongest beat as a predefined effect) at its time instead; API 26–28 gets the view's
     * constant for a tap's beat only.
     */
    fun score(id: String, beats: List<Beat>, offsetMs: Int = 0, fallback: Fallback? = null) {
        if (!hapticsOn || beats.isEmpty()) return
        val c = caps
        val now = SystemClock.uptimeMillis()
        if (c == null || !c.primitives || Build.VERSION.SDK_INT < 30) {
            fallback(id, beats, offsetMs, fallback)
            return
        }
        for (b in HapticScore.cap(beats)) {
            val at = b.atMs + offsetMs
            // A tap's beat (at 0) plays now; a later one is sent a little early so it lands on its frame.
            val lead = if (at <= 0) 0 else Dur.HAPTIC_LEAD_MS
            pending += Pending(id, b.prim, b.scale, now + (at - lead).coerceAtLeast(0))
        }
        rebuild()
    }

    /** A moment's beats on a motor without primitives: one effect (or a view constant) at its time. */
    private fun fallback(id: String, beats: List<Beat>, offsetMs: Int, fb: Fallback?) {
        val strongest = HapticScore.strongest(beats) ?: return
        val pick = fb ?: Fallback.Effect(HapticScore.predefined(strongest), strongest.atMs)
        val fireAt = pick.atMs + offsetMs
        when {
            Build.VERSION.SDK_INT >= 29 && pick is Fallback.Effect -> at(fireAt, id) { vibratePredefined(pick.effect) }
            pick is Fallback.View -> at(fireAt, id) { viewHaptic(*pick.choices) }
            // API 26–28: the tap's beat only, as the view's constant.
            fireAt <= 0 -> viewHaptic((if (strongest.prim == HapticScore.CLICK) HapticFeedbackConstants.VIRTUAL_KEY else HapticFeedbackConstants.CLOCK_TICK) to 1)
        }
    }

    /** Plays every pending beat from now as one composition (after any primitive still playing). */
    @SuppressLint("MissingPermission", "WrongConstant")
    private fun rebuild() {
        main.removeCallbacksAndMessages(rebuildToken)
        val c = caps ?: return
        val vib = vibrator ?: return
        if (Build.VERSION.SDK_INT < 30 || !vib.hasVibrator()) { pending.clear(); return }
        val now = SystemClock.uptimeMillis()
        pending.removeAll { it.at < now }
        if (pending.isEmpty()) return
        var busy = now
        var i = 0
        while (i + 1 < playing.size) { if (playing[i] <= now && now < playing[i + 1]) busy = playing[i + 1]; i += 2 }
        if (busy > now + 1) {
            // A primitive is mid-play: start the merged composition when it ends, rather than cut it.
            main.postAtTime(rebuild, rebuildToken, busy)
            return
        }
        val beats = pending.map { Beat(it.prim, it.scale, (it.at - now).toInt()) }
        val steps = HapticScore.compose(beats, c::supports, c::duration)
        if (steps.isEmpty()) return
        val comp = VibrationEffect.startComposition()
        val spans = LongArray(steps.size * 2)
        var t = now
        steps.forEachIndexed { k, s ->
            comp.addPrimitive(s.prim, s.scale, s.delayMs)
            t += s.delayMs
            spans[2 * k] = t
            t += c.duration(s.prim)
            spans[2 * k + 1] = t
        }
        playing = spans
        vibrate(comp.compose())
    }

    @SuppressLint("MissingPermission")
    private fun vibrate(effect: VibrationEffect) {
        val vib = vibrator ?: return
        runCatching {
            if (Build.VERSION.SDK_INT >= 33) {
                vib.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
            } else {
                @Suppress("DEPRECATION")
                vib.vibrate(effect, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).build())
            }
        }
    }

    private fun vibratePredefined(effect: Int) {
        if (!hapticsOn || Build.VERSION.SDK_INT < 29) return
        val vib = vibrator ?: return
        if (vib.hasVibrator()) vibrate(VibrationEffect.createPredefined(effect))
    }

    /** What a motor without primitives plays instead: a predefined effect, or the view's own constant (with its API). */
    sealed interface Fallback {
        val atMs: Int
        class Effect(val effect: Int, override val atMs: Int) : Fallback
        class View(override val atMs: Int, vararg val choices: Pair<Int, Int>) : Fallback
    }

    // ── The moments ─────────────────────────────────────────────────────────

    private val calm get() = motion == MotionLevel.CALM
    private val full get() = motion == MotionLevel.FULL

    /**
     * A due task checked, now (T): the CLICK and the ladder's pluck at once. With [motes] coming, the second beat
     * waits for them ([bankAt]); without, it lands as the mark completes. Returns the ladder step.
     */
    fun tick(id: String, motes: Boolean): Int {
        val r = TickLadder.next(_ladder.value, SystemClock.elapsedRealtime())
        _ladder.value = r
        val beats = if (motes) listOf(Scores.tickClick(r.step)) else listOf(Scores.tickClick(r.step), Scores.tickMark)
        score(id, beats, fallback = Fallback.View(0, HapticFeedbackConstants.TOGGLE_ON to 34, HapticFeedbackConstants.CONFIRM to 30, HapticFeedbackConstants.VIRTUAL_KEY to 1))
        play(if (r.step >= 3) "pluckBright${r.step}" else "pluck${r.step}", id = id)
        return r.step
    }

    /** The tick's motes land between [firstMs] and [lastMs] from now: LOW_TICK on the first (five or more), the bank on the last. */
    fun bankAt(id: String, step: Int, motes: Int, firstMs: Int, lastMs: Int) {
        score(id, Scores.tickBank(step, motes, firstMs, lastMs))
        soundAt(lastMs, "bank", 0.7f, id)
    }

    /**
     * An undo: the toggle-off haptic, the ladder steps back (unless the deed never climbed it: a work item's Done),
     * silent; [id]'s pending beats and sounds go.
     */
    fun untick(id: String? = null, ladder: Boolean = true) {
        id?.let(::cancel)
        viewHaptic(HapticFeedbackConstants.TOGGLE_OFF to 34, HapticFeedbackConstants.CLOCK_TICK to 1)
        if (ladder) ladderBack()
    }

    fun ladderBack() { _ladder.value = TickLadder.back(_ladder.value) }

    /** The run lapsed (90 s after the last tick). */
    fun ladderLapsed() { _ladder.value = null }

    /** A tick or a Done the server refused: a soft double, never a long buzz. */
    fun failed(id: String) = score(id, Scores.failed, fallback = Fallback.View(0, HapticFeedbackConstants.REJECT to 30, HapticFeedbackConstants.CLOCK_TICK to 1))

    /** Board clear at B, [atMs] from now. Full: four beats with the chime's first note on the banner's contact (B + 220). */
    fun clear(id: String, atMs: Int) {
        when (motion) {
            MotionLevel.STILL -> score(id, listOf(Beat(HapticScore.CLICK, 0.70f, 0)), atMs)
            MotionLevel.CALM -> {
                score(id, Scores.boardClear(calm = true), atMs)
                soundAt(atMs + 120, "chime", 1f, id)
            }
            MotionLevel.FULL -> {
                score(id, Scores.boardClear(calm = false), atMs, Fallback.Effect(HapticScore.EFFECT_DOUBLE_CLICK, 220))
                soundAt(atMs + 220, "chime", 1f, id)
            }
        }
    }

    /**
     * A right answer, now. [firstArrivalMs]: the first point mote's landing (the bank); a [milestone] plays the chime
     * there instead, and a [levelUp] leaves it to ASCEND.
     */
    fun correct(id: String, tier: Int, combo: Int, firstArrivalMs: Int?, bigMoment: Boolean, milestone: Boolean, levelUp: Boolean) {
        val fb = Fallback.View(0, HapticFeedbackConstants.CONFIRM to 30, HapticFeedbackConstants.VIRTUAL_KEY to 1)
        if (full) score(id, Scores.correct(tier, firstArrivalMs, bigMoment, levelUp), fallback = fb)
        else if (calm) score(id, Scores.correctCalm(), fallback = fb)
        else score(id, listOf(Beat(HapticScore.CLICK, 0.65f, 0)), fallback = fb)
        val rung = combo.coerceIn(0, TickLadder.STEPS.size - 1)
        play(if (rung >= 3) "pluckBright$rung" else "pluck$rung", id = id)
        if (!full) return
        when {
            milestone -> soundAt(240, "chime", 1f, id)
            levelUp -> Unit
            firstArrivalMs != null -> soundAt(firstArrivalMs, "bank", 0.7f, id)
        }
    }

    /** A miss: the soft double LOW_TICK (and a third as the retry node settles), and one quiet low SOFT. */
    fun miss(id: String, retry: Boolean) {
        score(id, Scores.miss(retry && full), fallback = Fallback.View(0, HapticFeedbackConstants.REJECT to 30, HapticFeedbackConstants.CLOCK_TICK to 1))
        play("soft", id = id)
    }

    /** A card's mastery level closing [atMs] from now (L + 300): notches on 0/100/200, the close on 300; ASCEND's notes land on them. */
    fun forgeCard(id: String, atMs: Int) {
        when (motion) {
            MotionLevel.FULL -> {
                score(id, Scores.forgeCard, atMs - 300, Fallback.Effect(HapticScore.EFFECT_HEAVY_CLICK, 300))
                soundAt(atMs - 300, "ascend", 1f, id)
            }
            MotionLevel.CALM -> {
                score(id, listOf(Beat(HapticScore.CLICK, 0.80f, 0)), atMs)
                soundAt(atMs - 300, "ascend", 1f, id)
            }
            MotionLevel.STILL -> score(id, listOf(Beat(HapticScore.CLICK, 0.80f, 0)), atMs)
        }
    }

    /** The character's level, T [atMs] from now: the forge's beats, the close at T + 500, ASCEND_BIG's chord on it. */
    fun forgeCharacter(id: String, atMs: Int) {
        when (motion) {
            MotionLevel.FULL -> {
                score(id, Scores.forgeCharacter, atMs, Fallback.Effect(HapticScore.EFFECT_HEAVY_CLICK, 500))
                soundAt(atMs + 200, "ascendBig", 1f, id)
            }
            MotionLevel.CALM -> {
                score(id, listOf(Beat(HapticScore.CLICK, 0.80f, 300)), atMs)
                soundAt(atMs, "ascendBig", 1f, id)
            }
            MotionLevel.STILL -> at(atMs, id) { vibratePredefined(HapticScore.EFFECT_HEAVY_CLICK) }
        }
    }

    /** Session complete (S = now): the seal's THUD, the X's parts, and SEAL with as many notes as the run earned. */
    fun session(id: String, accuracy: Float, perfect: Boolean, lastLitMs: Int) {
        val notes = SessionMoment.notes(accuracy, perfect)
        when (motion) {
            MotionLevel.FULL -> {
                score(id, Scores.session(perfect, lastLitMs), fallback = Fallback.Effect(HapticScore.EFFECT_HEAVY_CLICK, 200))
                soundAt(300, "seal$notes", 1f, id)
            }
            MotionLevel.CALM -> {
                score(id, listOf(Beat(HapticScore.CLICK, 0.70f, 200)))
                soundAt(200, "seal$notes", 1f, id)
            }
            MotionLevel.STILL -> score(id, listOf(Beat(HapticScore.CLICK, 0.70f, 0)))
        }
    }

    /** A new idea's seal (R = now): the CLICK and STAMP on its contact (Calm: sooner, and LAND at 200). */
    fun stamp(id: String) {
        when (motion) {
            MotionLevel.FULL -> {
                score(id, Scores.ideaStamp, fallback = Fallback.View(180, HapticFeedbackConstants.CONFIRM to 30, HapticFeedbackConstants.VIRTUAL_KEY to 1))
                soundAt(180, "stamp", 1f, id)
            }
            MotionLevel.CALM -> {
                score(id, listOf(Beat(HapticScore.CLICK, 0.70f, 160)))
                play("stamp", id = id)
                soundAt(200, "land", 1f, id)
            }
            MotionLevel.STILL -> score(id, listOf(Beat(HapticScore.CLICK, 0.70f, 0)))
        }
    }

    /** The seal lands on Review [atMs] from now: CLICK and TICK, and LAND. Scheduled when the flight launches. */
    fun landAt(id: String, atMs: Int) {
        score(id, Scores.land, atMs, Fallback.View(0, HapticFeedbackConstants.CONFIRM to 30, HapticFeedbackConstants.VIRTUAL_KEY to 1))
        soundAt(atMs, "land", 1f, id)
    }

    /** An idea folded into one you have (the fuse at 200). */
    fun merge(id: String) {
        score(id, if (motion == MotionLevel.STILL) listOf(Beat(HapticScore.TICK, 0.40f, 0)) else Scores.merged)
        soundAt(if (motion == MotionLevel.STILL) 0 else 200, "merge", 1f, id)
    }

    /** Nothing saved (a twin): one quiet LOW_TICK, silent. */
    fun duplicate(id: String) = score(id, if (motion == MotionLevel.STILL) listOf(Beat(HapticScore.LOW_TICK, 0.30f, 0)) else Scores.duplicate)

    fun ideaFailed(id: String) = score(id, Scores.ideaFailed, fallback = Fallback.View(0, HapticFeedbackConstants.REJECT to 30, HapticFeedbackConstants.CLOCK_TICK to 1))

    /** A work item's Done: CLICK and TICK, the clack at a fixed pitch. Work never climbs the life ladder. */
    fun work(id: String) {
        score(
            id, if (motion == MotionLevel.STILL) listOf(Beat(HapticScore.CLICK, 0.50f, 0)) else Scores.work,
            fallback = Fallback.View(0, HapticFeedbackConstants.TOGGLE_ON to 34, HapticFeedbackConstants.CONFIRM to 30, HapticFeedbackConstants.VIRTUAL_KEY to 1),
        )
        play("clack", id = id)
    }

    /**
     * A Mall purchase landed (blueprint P19): the Confirm's CLICK and the burn cooling down ([Scores.burn]), the land at its
     * end. Still: the CLICK alone. Never on a repeat, which spent nothing.
     */
    fun burn(id: String) {
        score(
            id, if (motion == MotionLevel.STILL) listOf(Beat(HapticScore.CLICK, 0.60f, 0)) else Scores.burn,
            fallback = Fallback.View(0, HapticFeedbackConstants.CONFIRM to 30, HapticFeedbackConstants.VIRTUAL_KEY to 1),
        )
        soundAt(if (motion == MotionLevel.STILL) 0 else 360, "land", 0.8f, id)
    }

    /**
     * A check-in saved (health phase 2; D5): [Scores.checkIn], one neutral TICK whatever was picked, on every motion level.
     * No sound and no moment: a record, never a reward.
     */
    fun checkIn(id: String) = score(id, Scores.checkIn, fallback = Fallback.View(0, HapticFeedbackConstants.CLOCK_TICK to 1))

    /** A tab changed. */
    fun segment() = viewHaptic(HapticFeedbackConstants.SEGMENT_TICK to 34, HapticFeedbackConstants.CLOCK_TICK to 1)

    fun select() = viewHaptic(HapticFeedbackConstants.CLOCK_TICK to 1)

    fun press() = viewHaptic(HapticFeedbackConstants.VIRTUAL_KEY to 1)

    fun error() = viewHaptic(HapticFeedbackConstants.REJECT to 30, HapticFeedbackConstants.CLOCK_TICK to 1)

    fun release() = pool.release()
}
