package com.xtnl.app.ui.mall

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtnl.app.core.MallLine
import com.xtnl.app.data.MallData
import com.xtnl.app.data.MallPurchase
import com.xtnl.app.data.MallReward
import com.xtnl.app.ui.LocalWindowLayout
import com.xtnl.app.ui.TwoPane
import com.xtnl.app.ui.components.ButtonKind
import com.xtnl.app.ui.components.Eyebrow
import com.xtnl.app.ui.components.Glyphs
import com.xtnl.app.ui.components.XButton
import com.xtnl.app.ui.components.XCard
import com.xtnl.app.ui.components.XChip
import com.xtnl.app.ui.components.XField
import com.xtnl.app.ui.components.XIconButton
import com.xtnl.app.ui.motion.LocalFeel
import com.xtnl.app.ui.motion.LocalMotion
import com.xtnl.app.ui.motion.MotionLevel
import com.xtnl.app.ui.theme.X
import com.xtnl.app.ui.theme.figures
import kotlinx.coroutines.delay
import java.time.Instant

/**
 * More › Mall (docs/mobile-api.md `GET /mall`, `POST /mall/rewards`; blueprint 4.3, decision D30): the web's You › Mall
 * on the phone. The credits over the rewards (the balance and today's once they count; why there is none while they
 * are off), the rewards the user lists by category (each its name, its price, its hint "≈ 2 good days" or
 * "calibrating", its cooldown and note), the Add form, the archived ones, and how the Mall works: it runs on honour, and
 * #play, rest days and sleep are never priced. Only what the user lists is priced: it opens empty, and suggests nothing.
 *
 * Buying (P19, decisions D31 and D32): Buy, then Confirm, on each reward the server says can be bought (else its line
 * says why: below zero, a cooldown, too few credits); no Buy at all while credits are off. A purchase that lands burns
 * the wallet's figure (it dims and sinks 3 dp, then settles on the balance left: never a count) with its haptics, and its
 * Seal is the server's. The latest purchases follow, each undoable for ten minutes (Undo · until 21:15). A balance
 * below zero shows plainly, "−10 cr" and "earn it back". Rewards are added here and edited or archived on the web.
 *
 * The front display holds one column (the wallet, the rewards, the purchases, the Add form, the archived, the note); the
 * main display holds two panes that follow the hinge: the wallet and the rewards in the first, the purchases, the Add
 * form and the note in the second. One node per reward for TalkBack; every line may wrap; every target is at least 44 dp.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MallScreen(vm: MallViewModel, onBack: () -> Unit) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val c = X.c
    val wl = LocalWindowLayout.current
    val feel = LocalFeel.current
    val motion = LocalMotion.current
    // P19: the burn, once per purchase that landed (never again on a re-entry or a fold).
    val burn = remember { Animatable(1f) }
    var burned by rememberSaveable { mutableIntStateOf(ui.burnSeq) }
    LaunchedEffect(ui.burnSeq) {
        if (ui.burnSeq <= burned) return@LaunchedEffect
        burned = ui.burnSeq
        feel?.burn("mall-buy-${ui.burnSeq}")
        when (motion) {
            MotionLevel.STILL -> Unit
            MotionLevel.CALM -> {
                burn.animateTo(0.4f, tween(120))
                burn.animateTo(1f, tween(140))
            }
            MotionLevel.FULL -> {
                burn.animateTo(0.32f, tween(250, easing = FastOutLinearInEasing))
                burn.animateTo(1f, tween(310, easing = LinearOutSlowInEasing))
            }
        }
    }
    val sinks = motion == MotionLevel.FULL
    // Each Undo leaves at its own deadline: this device's clock, read every 15 s (the server's is the rule).
    val now by produceState(Instant.now()) {
        while (true) {
            delay(15_000)
            value = Instant.now()
        }
    }
    // Read each time the screen opens: a tick made on Check meanwhile moves the credits.
    LaunchedEffect(Unit) { vm.refresh(quiet = true) }
    // The Add form's fields: kept across a fold, cleared once for each add that landed (never again on a re-entry).
    val form = rememberAddForm()
    LaunchedEffect(ui.addedSeq) {
        if (ui.addedSeq > form.cleared) {
            form.clear()
            form.cleared = ui.addedSeq
        }
    }
    val top = WindowInsets.safeDrawing.only(WindowInsetsSides.Top).asPaddingValues().calculateTopPadding()
    val pull = rememberPullToRefreshState()
    PullToRefreshBox(
        isRefreshing = ui.refreshing,
        onRefresh = { vm.refresh() },
        state = pull,
        modifier = Modifier.fillMaxSize(),
        indicator = {
            PullToRefreshDefaults.Indicator(
                state = pull, isRefreshing = ui.refreshing,
                modifier = Modifier.align(Alignment.TopCenter).padding(top = top),
                containerColor = c.overlay, color = c.ink0,
            )
        },
    ) {
        val data = ui.data
        val add: LazyListScope.(MallData) -> Unit = { d -> addCard(d, form, ui, onAdd = { vm.add(form.title, form.category, form.price, form.note, form.cooldown) }) }
        val buys = BuyHandlers(onArm = vm::arm, onBuy = vm::buy)
        val burnOf = { burn.value }
        when {
            data == null -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = top + 4.dp, bottom = 24.dp)) {
                header(null, ui.error, onBack)
                item(key = "empty") {
                    Column(Modifier.fillMaxWidth().padding(top = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if (ui.loading) MallLine.LOADING else MallLine.FAILED, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
                        if (!ui.loading) {
                            Spacer(Modifier.height(16.dp))
                            XButton("Retry", { vm.refresh() }, icon = Glyphs.Refresh, kind = ButtonKind.QUIET, height = 48.dp)
                        }
                    }
                }
            }
            !wl.mode.twoPane -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = top + 4.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                header(data, ui.error, onBack)
                wallet(data, ui, burnOf, sinks)
                rewards(data, ui, buys)
                purchases(data, ui, now, vm::undo)
                add(data)
                archived(data)
                notes(data)
            }
            else -> TwoPane(
                first = {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 20.dp, end = 4.dp, top = top + 4.dp, bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        header(data, ui.error, onBack)
                        wallet(data, ui, burnOf, sinks)
                        rewards(data, ui, buys)
                        archived(data)
                    }
                },
                second = {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 4.dp, end = 20.dp, top = top + 4.dp, bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        purchases(data, ui, now, vm::undo)
                        add(data)
                        notes(data)
                    }
                },
            )
        }
    }
}

/** The Add form's fields as typed, saved across a fold; [cleared] is the last add that cleared them. */
private class AddForm(title: String, category: String, price: String, note: String, cooldown: String, cleared: Int) {
    var title by mutableStateOf(title)
    var category by mutableStateOf(category)
    var price by mutableStateOf(price)
    var note by mutableStateOf(note)
    var cooldown by mutableStateOf(cooldown)
    var cleared by mutableIntStateOf(cleared)

    /** After an add landed: the fields empty for the next one (the category stays, as a run of treats is likely). */
    fun clear() {
        title = ""
        price = ""
        note = ""
        cooldown = ""
    }

    companion object {
        val Saver: Saver<AddForm, Any> = listSaver(
            save = { listOf(it.title, it.category, it.price, it.note, it.cooldown, it.cleared) },
            restore = { AddForm(it[0] as String, it[1] as String, it[2] as String, it[3] as String, it[4] as String, it[5] as Int) },
        )
    }
}

@Composable
private fun rememberAddForm(): AddForm = rememberSaveable(saver = AddForm.Saver) { AddForm("", "TREAT", "", "", "", 0) }

// ── The list's parts ────────────────────────────────────────────────────────

private fun LazyListScope.header(data: MallData?, error: String?, onBack: () -> Unit) {
    item(key = "header", contentType = "header") {
        val c = X.c
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                XIconButton(Glyphs.Back, "Back", onBack)
                Text(MallLine.TITLE, style = MaterialTheme.typography.headlineMedium, color = c.ink0)
            }
            data?.let { Text(MallLine.count(it.rewards.size) + " · only what you list is priced", style = MaterialTheme.typography.labelMedium, color = c.ink2, modifier = Modifier.padding(start = 12.dp)) }
            // The server said no (or couldn't be reached): its line, over what was last read.
            if (error != null && data != null) Text(error, style = MaterialTheme.typography.labelMedium, color = c.owed, modifier = Modifier.padding(start = 12.dp, top = 4.dp))
        }
    }
}

/** Buy's two presses (P19): arm a reward, then confirm it. */
private class BuyHandlers(val onArm: (String?) -> Unit, val onBuy: (String) -> Unit)

/**
 * The credits: the balance and today's once they count (below zero, plainly: "−10 cr", "earn it back"), else the
 * server's line saying why there is none; then the good day; then the last purchase or undo, in the server's words. The
 * figure burns when a purchase lands ([burn]: its alpha, and a 3 dp sink on Full).
 */
private fun LazyListScope.wallet(data: MallData, ui: MallViewModel.Ui, burn: () -> Float, sinks: Boolean) {
    item(key = "wallet", contentType = "wallet") {
        val c = X.c
        val balance = MallLine.balance(data)
        XCard(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Eyebrow(MallLine.CREDITS)
                if (balance != null) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            balance, style = MaterialTheme.typography.titleLarge.figures(), color = c.ink0,
                            modifier = Modifier.graphicsLayer {
                                val a = burn()
                                alpha = a
                                if (sinks) translationY = (1f - a) / 0.68f * 3.dp.toPx()
                            },
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(data.creditsLine, style = MaterialTheme.typography.labelMedium, color = c.ink1, modifier = Modifier.padding(bottom = 3.dp))
                    }
                } else {
                    Text(data.creditsLine, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
                }
                data.hintLine?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = c.ink2) }
                ui.bought?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = c.ink1) }
            }
        }
    }
}

/** The rewards by category, each a card of rows; the empty line when there are none (nothing is suggested). */
private fun LazyListScope.rewards(data: MallData, ui: MallViewModel.Ui, buys: BuyHandlers) {
    val groups = MallLine.groups(data)
    if (groups.isEmpty()) {
        item(key = "rewards-empty", contentType = "note") {
            XCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Eyebrow(MallLine.REWARDS)
                    Text(if (data.ready) MallLine.EMPTY else MallLine.NOT_READY, style = MaterialTheme.typography.bodyMedium, color = X.c.ink1)
                }
            }
        }
        return
    }
    for ((category, list) in groups) {
        item(key = "group-${category.key}", contentType = "group") {
            val c = X.c
            XCard(Modifier.fillMaxWidth(), padding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                Column {
                    Row(Modifier.padding(top = 12.dp, bottom = 4.dp).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
                        Eyebrow(category.label, Modifier.weight(1f))
                        Text(MallLine.count(list.size), style = MaterialTheme.typography.labelMedium, color = c.ink2)
                    }
                    for (r in list) {
                        HorizontalDivider(color = c.line1)
                        RewardRow(r)
                        if (MallLine.showsBuy(data, r)) BuyRow(r, ui, buys)
                    }
                }
            }
        }
    }
}

/** One reward: its name and price, its hint and cooldown, its note. One node for TalkBack. */
@Composable
private fun RewardRow(r: MallReward) {
    val c = X.c
    Column(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 12.dp).semantics(mergeDescendants = true) { contentDescription = MallLine.describe(r) },
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Text(r.title, style = MaterialTheme.typography.titleMedium, color = c.ink0, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(10.dp))
            Text(r.priceLine, style = MaterialTheme.typography.titleMedium.figures(), color = c.ink0)
        }
        Text(MallLine.metaLine(r), style = MaterialTheme.typography.labelMedium, color = c.ink2)
        r.note?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.ink1) }
    }
}

/**
 * One reward's Buy (P19): Buy arms it, Confirm · 120 cr buys it (the server burns exactly the price); a reward the
 * server says can't be bought shows Buy dimmed and its line; the server's refusal, if any, under it.
 */
@Composable
private fun BuyRow(r: MallReward, ui: MallViewModel.Ui, buys: BuyHandlers) {
    val c = X.c
    val armed = ui.armedId == r.id
    val busy = ui.buyingId == r.id
    Column(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            XButton(
                if (busy) MallLine.BUYING else if (armed) MallLine.confirmLabel(r) else MallLine.BUY,
                { if (armed) buys.onBuy(r.id) else buys.onArm(r.id) },
                Modifier.semantics { contentDescription = MallLine.buyDescription(r, armed) },
                kind = if (armed) ButtonKind.PRIMARY else ButtonKind.QUIET, icon = Glyphs.Mall, height = 48.dp,
                busy = busy, enabled = MallLine.buyable(r) && ui.buyingId == null,
            )
            if (armed && !busy) XButton("Cancel", { buys.onArm(null) }, kind = ButtonKind.QUIET, height = 48.dp)
        }
        MallLine.whyLine(r)?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = c.ink2) }
        ui.buyError?.takeIf { it.first == r.id }?.let { Text(it.second, style = MaterialTheme.typography.labelMedium, color = c.owed) }
    }
}

/**
 * The latest purchases (P19), newest first: each its title, its figure spent ("−120 cr") or given back, and when; Undo
 * while its ten minutes last on [now] ("until 21:15"; the server checks its own clock again). Nothing while there are none.
 */
private fun LazyListScope.purchases(data: MallData, ui: MallViewModel.Ui, now: Instant, onUndo: (String) -> Unit) {
    if (data.purchases.isEmpty()) return
    item(key = "purchases", contentType = "purchases") {
        val c = X.c
        XCard(Modifier.fillMaxWidth(), padding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
            Column {
                Row(Modifier.padding(top = 12.dp, bottom = 4.dp).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
                    Eyebrow(MallLine.PURCHASES, Modifier.weight(1f))
                    Text("undo within ${data.limits.undoMinutes} min", style = MaterialTheme.typography.labelMedium, color = c.ink2)
                }
                for (p in data.purchases) {
                    HorizontalDivider(color = c.line1)
                    PurchaseRow(p, ui, open = data.writesOn && MallLine.undoOpen(p, now), onUndo)
                }
            }
        }
    }
}

@Composable
private fun PurchaseRow(p: MallPurchase, ui: MallViewModel.Ui, open: Boolean, onUndo: (String) -> Unit) {
    val c = X.c
    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = MallLine.describePurchase(p) }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(p.title, style = MaterialTheme.typography.bodyMedium, color = if (p.refunded) c.ink2 else c.ink0, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(10.dp))
                // Undone: its price alone, struck through (it spent and got back the same; never a "+" that reads as income).
                Text(
                    MallLine.purchaseFigure(p), style = MaterialTheme.typography.bodyMedium.figures(), color = if (p.refunded) c.ink2 else c.ink0,
                    textDecoration = if (p.refunded) TextDecoration.LineThrough else null,
                )
            }
            Text(p.line, style = MaterialTheme.typography.labelMedium, color = c.ink2)
        }
        if (open) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                val busy = ui.undoingId == p.id
                XButton(
                    if (busy) MallLine.UNDOING else MallLine.UNDO, { onUndo(p.id) },
                    Modifier.semantics { contentDescription = "Undo the purchase of ${p.title}" },
                    kind = ButtonKind.QUIET, icon = Glyphs.Undo, height = 48.dp, busy = busy, enabled = ui.undoingId == null,
                )
                MallLine.undoUntilLine(p)?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = c.ink2) }
            }
        }
        ui.undoError?.takeIf { it.first == p.id }?.let { Text(it.second, style = MaterialTheme.typography.labelMedium, color = c.owed) }
    }
}

/** The Add form: a name, a category, a price in cr (with its live hint), an optional note and cooldown. */
@OptIn(ExperimentalLayoutApi::class)
private fun LazyListScope.addCard(data: MallData, form: AddForm, ui: MallViewModel.Ui, onAdd: () -> Unit) {
    item(key = "add", contentType = "add") {
        val c = X.c
        val meta = MaterialTheme.typography.labelMedium
        val open = data.ready && data.writesOn
        val examples = data.categories.firstOrNull { it.key == form.category }?.examples
        XCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Eyebrow(MallLine.ADD)
                if (!data.ready) Text(MallLine.NOT_READY, style = meta, color = c.ink1)
                else if (!data.writesOn) Text(MallLine.WRITES_OFF, style = meta, color = c.ink1)
                XField(
                    form.title, { form.title = it.take(data.limits.titleMax) }, Modifier.fillMaxWidth(),
                    label = "Reward", placeholder = "What you'd like to earn", enabled = open && !ui.adding,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                )
                Column {
                    Eyebrow("Category", Modifier.padding(start = 4.dp, bottom = 6.dp))
                    FlowRow(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (cat in data.categories) XChip(cat.label, form.category == cat.key, { form.category = cat.key }, height = 44.dp)
                    }
                    examples?.let { Text("For example $it.", style = meta, color = c.ink2, modifier = Modifier.padding(start = 4.dp, top = 6.dp)) }
                }
                Column {
                    XField(
                        form.price, { form.price = it.take(12) }, Modifier.fillMaxWidth(),
                        label = "Price", placeholder = "120", enabled = open && !ui.adding, mono = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next),
                        trailing = { Text("cr", style = MaterialTheme.typography.titleMedium, color = c.ink1) },
                    )
                    Text(MallLine.formHint(form.price, data), style = meta, color = c.ink2, modifier = Modifier.padding(start = 4.dp, top = 6.dp))
                }
                XField(
                    form.note, { form.note = it.take(data.limits.noteMax) }, Modifier.fillMaxWidth(),
                    label = "Note (optional)", enabled = open && !ui.adding,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                )
                Column {
                    XField(
                        form.cooldown, { form.cooldown = it.take(4) }, Modifier.fillMaxWidth(),
                        label = "Cooldown (optional)", placeholder = "none", enabled = open && !ui.adding, mono = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                        trailing = { Text("days", style = MaterialTheme.typography.titleMedium, color = c.ink1) },
                    )
                    Text("At most once every so many days, ${data.limits.cooldownMin} to ${data.limits.cooldownMax}. Leave it empty for none.", style = meta, color = c.ink2, modifier = Modifier.padding(start = 4.dp, top = 6.dp))
                }
                ui.addError?.let { Text(it, style = meta, color = c.owed) }
                ui.added?.let { Text(it, style = meta, color = c.ink1) }
                XButton(
                    if (ui.adding) MallLine.ADDING else MallLine.ADD_BUTTON, onAdd, Modifier.fillMaxWidth(),
                    icon = Glyphs.Plus, height = 52.dp, busy = ui.adding,
                    enabled = open && !ui.adding && form.title.isNotBlank() && form.price.isNotBlank(),
                )
                Text(MallLine.WEB_EDITS, style = meta, color = c.ink2)
            }
        }
    }
}

/** The archived rewards, newest first: kept rows, read only. */
private fun LazyListScope.archived(data: MallData) {
    if (data.archived.isEmpty()) return
    item(key = "archived", contentType = "archived") {
        val c = X.c
        XCard(Modifier.fillMaxWidth(), padding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
            Column {
                Row(Modifier.padding(top = 12.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Eyebrow(MallLine.ARCHIVED, Modifier.weight(1f))
                    Text(MallLine.count(data.archived.size) + " · kept", style = MaterialTheme.typography.labelMedium, color = c.ink2)
                }
                for (r in data.archived) {
                    HorizontalDivider(color = c.line1)
                    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp).semantics(mergeDescendants = true) {}) {
                        Text(r.title, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
                        Text(MallLine.archivedLine(r), style = MaterialTheme.typography.labelMedium, color = c.ink2)
                    }
                }
            }
        }
    }
}

/** How the Mall works, in the server's words: on honour; #play, rest days and sleep stay free; only yours; how buying works. */
private fun LazyListScope.notes(data: MallData) {
    item(key = "notes", contentType = "notes") {
        val c = X.c
        XCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Eyebrow("How the Mall works")
                for (line in listOf(data.notes.honour, data.notes.free).filter { it.isNotBlank() }) Text(line, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
                val small = listOf(data.notes.onlyYours, data.notes.buying).filter { it.isNotBlank() }.joinToString(" ")
                if (small.isNotEmpty()) Text(small, style = MaterialTheme.typography.labelMedium, color = c.ink2)
            }
        }
    }
}
