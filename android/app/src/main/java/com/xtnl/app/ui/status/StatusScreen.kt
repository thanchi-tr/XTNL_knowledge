package com.xtnl.app.ui.status

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.xtnl.app.core.StatusLine
import com.xtnl.app.data.CapitalReading
import com.xtnl.app.data.StatusAttribute
import com.xtnl.app.data.StatusPanel
import com.xtnl.app.data.StatusSkill
import com.xtnl.app.data.StatusTarget
import com.xtnl.app.ui.LocalWindowLayout
import com.xtnl.app.ui.TwoPane
import com.xtnl.app.ui.components.ButtonKind
import com.xtnl.app.ui.components.Eyebrow
import com.xtnl.app.ui.components.Glyphs
import com.xtnl.app.ui.components.XButton
import com.xtnl.app.ui.components.XCard
import com.xtnl.app.ui.components.XIconButton
import com.xtnl.app.ui.theme.X
import com.xtnl.app.ui.theme.figures

/**
 * More › Attributes (docs/mobile-api.md `GET /status`; blueprint 1.1, decisions D1 and D2; titled so since P2, D6): the
 * web's /you Status card, "Attributes", on the phone. The five attributes in the panel's order (Vitality, Intellect, Craft, Duty, Care), each its track's or
 * Knowledge's own figures from the server: the name with the blueprint's word beside it, the level, the last judged
 * weeks as pips, the meter (last week banked in ink, this week's gain in the currency that fed it, a cap tick while
 * the XP waits at the cap) and the web row's own line. Then Capital, a reading only (AUD won this month, the deals, the
 * months before; no level, no XP), and what the five are. Since P4 each attribute's avatar targets sit under its line
 * (Capital's on the Capital card, a track's before life counts on a card of its own), in the web's own words.
 *
 * Since P5 (blueprint 1.5, decisions D7 to D9) each attribute's row counts its live skills ("2 skills"), and a Skills card
 * lists them by hours: the tier badge, the meter through the tier and the web's own lines. Named and linked on the web.
 *
 * Read only, nothing to tick. The front display holds one column; the main display holds two panes that follow the
 * hinge: the attributes in the first, Capital, the Skills and the note in the second. One node per row for TalkBack;
 * every line may wrap.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatusScreen(vm: StatusViewModel, onBack: () -> Unit) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val c = X.c
    val wl = LocalWindowLayout.current
    // Read each time the screen opens: a tick made on Check meanwhile moves a track's meter.
    LaunchedEffect(Unit) { vm.refresh(quiet = true) }
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
        when {
            data == null -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = top + 4.dp, bottom = 24.dp)) {
                header(null, ui.error, onBack)
                item(key = "empty") {
                    Column(Modifier.fillMaxWidth().padding(top = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if (ui.loading) StatusLine.LOADING else StatusLine.FAILED, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
                        if (!ui.loading) {
                            Spacer(Modifier.height(16.dp))
                            XButton("Retry", { vm.refresh() }, icon = Glyphs.Refresh, kind = ButtonKind.QUIET, height = 48.dp)
                        }
                    }
                }
            }
            !wl.mode.twoPane -> LazyColumn(
                state = rememberLazyListState(),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = top + 4.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                header(data, ui.error, onBack)
                attributes(data)
                unplaced(data)
                capital(data)
                skills(data)
                about()
            }
            else -> TwoPane(
                first = {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 20.dp, end = 4.dp, top = top + 4.dp, bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        header(data, ui.error, onBack)
                        attributes(data)
                        unplaced(data)
                    }
                },
                second = {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 4.dp, end = 20.dp, top = top + 4.dp, bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        capital(data)
                        skills(data)
                        about()
                    }
                },
            )
        }
    }
}

// ── The list's parts ────────────────────────────────────────────────────────

private fun LazyListScope.header(data: StatusPanel?, error: String?, onBack: () -> Unit) {
    item(key = "header", contentType = "header") {
        val c = X.c
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                XIconButton(Glyphs.Back, "Back", onBack)
                Text(StatusLine.TITLE, style = MaterialTheme.typography.headlineMedium, color = c.ink0)
            }
            data?.let { Text(StatusLine.aside(it), style = MaterialTheme.typography.labelMedium, color = c.ink2, modifier = Modifier.padding(start = 12.dp)) }
            // The server said no (or couldn't be reached): its line, over what was last read.
            if (error != null && data != null) Text(error, style = MaterialTheme.typography.labelMedium, color = c.owed, modifier = Modifier.padding(start = 12.dp, top = 4.dp))
        }
    }
}

private fun LazyListScope.attributes(data: StatusPanel) {
    item(key = "attributes", contentType = "attributes") {
        XCard(Modifier.fillMaxWidth(), padding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
            Column {
                data.attributes.forEachIndexed { i, a ->
                    if (i > 0) HorizontalDivider(color = X.c.line1)
                    AttributeRow(a, StatusLine.targetsFor(data, a.key))
                }
            }
        }
    }
}

private fun LazyListScope.capital(data: StatusPanel) {
    val targets = StatusLine.capitalTargets(data)
    if (data.capital != null || targets.isNotEmpty()) item(key = "capital", contentType = "capital") { CapitalCard(data.capital, targets) }
}

/** P4: the targets whose attribute has no row yet (a track's, before life counts), never dropped. One node for TalkBack. */
private fun LazyListScope.unplaced(data: StatusPanel) {
    val targets = StatusLine.unplaced(data)
    if (targets.isEmpty()) return
    item(key = "unplaced", contentType = "unplaced") {
        val c = X.c
        val meta = MaterialTheme.typography.labelMedium
        XCard(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = "${StatusLine.UNPLACED}, ${StatusLine.UNPLACED_SUB}." + StatusLine.targetsDescription(targets) }) {
            Column {
                val name = buildAnnotatedString {
                    append(StatusLine.UNPLACED)
                    withStyle(SpanStyle(color = c.ink2, fontSize = meta.fontSize)) { append(" · ${StatusLine.UNPLACED_SUB}") }
                }
                Text(name, style = MaterialTheme.typography.titleMedium, color = c.ink0)
                TargetLines(targets, named = true)
            }
        }
    }
}

/** P5: the skills by hours, as You › Skills lists them (none when they couldn't be read; a line with none). */
private fun LazyListScope.skills(data: StatusPanel) {
    val skills = data.skills ?: return
    item(key = "skills", contentType = "skills") {
        val c = X.c
        val meta = MaterialTheme.typography.labelMedium
        XCard(Modifier.fillMaxWidth(), padding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
            Column {
                Column(Modifier.padding(top = 12.dp, bottom = 4.dp).semantics(mergeDescendants = true) {}) {
                    Eyebrow(StatusLine.SKILLS)
                    Text(StatusLine.SKILLS_ASIDE, style = meta, color = c.ink2)
                }
                if (skills.isEmpty()) Text(StatusLine.SKILLS_NONE, style = MaterialTheme.typography.bodyMedium, color = c.ink1, modifier = Modifier.padding(vertical = 8.dp))
                for (s in skills) {
                    HorizontalDivider(color = c.line1)
                    SkillRow(s)
                }
                HorizontalDivider(color = c.line1)
                Text(StatusLine.SKILLS_NOTE, style = meta, color = c.ink2, modifier = Modifier.padding(top = 8.dp, bottom = 12.dp))
            }
        }
    }
}

private fun LazyListScope.about() {
    item(key = "about", contentType = "about") {
        val c = X.c
        XCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Eyebrow(StatusLine.ABOUT_TITLE)
                for (line in StatusLine.ABOUT) Text(line, style = MaterialTheme.typography.bodyMedium, color = c.ink1)
            }
        }
    }
}

/** The sigil of what an attribute reads (the web's track sigils, and Knowledge's book). */
private fun glyphOf(key: String): ImageVector = when (key) {
    "VITALITY" -> Glyphs.Body
    "INTELLECT" -> Glyphs.Know
    "CRAFT" -> Glyphs.Craft
    "DUTY" -> Glyphs.Duty
    "CARE" -> Glyphs.Care
    else -> Glyphs.Diamond
}

/** One attribute: the web's TrackRow, read from the server's row, with its avatar targets under the line. One node for TalkBack. */
@Composable
private fun AttributeRow(a: StatusAttribute, targets: List<StatusTarget>) {
    val c = X.c
    val meta = MaterialTheme.typography.labelMedium
    Row(
        Modifier.fillMaxWidth().padding(vertical = 12.dp).semantics(mergeDescendants = true) {
            contentDescription = StatusLine.description(a) + StatusLine.targetsDescription(targets) + (StatusLine.skillCount(a)?.let { " $it." } ?: "")
        },
        verticalAlignment = Alignment.Top,
    ) {
        Icon(glyphOf(a.key), null, tint = c.ink1, modifier = Modifier.padding(top = 2.dp).size(22.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val name = buildAnnotatedString {
                    append(a.name)
                    StatusLine.sub(a)?.let { sub -> withStyle(SpanStyle(color = c.ink2, fontSize = meta.fontSize)) { append(" · $sub") } }
                }
                Text(name, style = MaterialTheme.typography.titleMedium, color = c.ink0, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text("${a.level}", style = MaterialTheme.typography.titleLarge.figures(), color = c.ink0)
            }
            if (a.weeks.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Pips(a.weeks)
            }
            Spacer(Modifier.height(8.dp))
            Meter(a)
            Spacer(Modifier.height(6.dp))
            Text(a.line, style = meta, color = c.ink2)
            TargetLines(targets)
            // P5: its live skills, counted (the web row's "2 skills"; each is on the Skills card).
            StatusLine.skillCount(a)?.let { Text(it, style = meta, color = c.ink1, modifier = Modifier.padding(top = 6.dp)) }
        }
    }
}

/** P5: one skill: its name over its attribute, the tier badge, the meter through the tier, its hours and tier lines. One node for TalkBack. */
@Composable
private fun SkillRow(s: StatusSkill) {
    val c = X.c
    val meta = MaterialTheme.typography.labelMedium
    Row(
        Modifier.fillMaxWidth().padding(vertical = 12.dp).semantics(mergeDescendants = true) { contentDescription = StatusLine.skillDescription(s) },
        verticalAlignment = Alignment.Top,
    ) {
        Icon(glyphOf(s.attribute), null, tint = c.ink1, modifier = Modifier.padding(top = 2.dp).size(22.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val name = buildAnnotatedString {
                    append(s.name)
                    withStyle(SpanStyle(color = c.ink2, fontSize = meta.fontSize)) { append(" · ${StatusLine.skillSub(s)}") }
                }
                Text(name, style = MaterialTheme.typography.titleMedium, color = c.ink0, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text(StatusLine.tierBadge(s), style = MaterialTheme.typography.titleMedium.figures(), color = c.ink1)
            }
            Spacer(Modifier.height(8.dp))
            TierMeter(s.progress.toFloat())
            Spacer(Modifier.height(6.dp))
            Text(s.line, style = meta, color = c.ink1)
            Text(s.tierLine, style = meta, color = c.ink2)
        }
    }
}

/** P5: the meter through a skill's tier: 8 dp, the web's sunken track, the share in ink (no gain, no cap: hours only rise with ticks). */
@Composable
private fun TierMeter(share: Float) {
    val c = X.c
    Canvas(Modifier.fillMaxWidth().height(8.dp)) {
        val h = size.height
        val radius = CornerRadius(h / 2f)
        drawRoundRect(c.sunken, size = size, cornerRadius = radius)
        drawRoundRect(c.line2, size = size, cornerRadius = radius, style = Stroke(1.dp.toPx()))
        val v = share.coerceIn(0f, 1f)
        if (v > 0f) drawRoundRect(c.ink0, size = Size(size.width * v, h), cornerRadius = radius)
    }
}

/** P4: a row's avatar targets, one line each in the web's words, each after an outlined diamond (a record, not a pip). */
@Composable
private fun TargetLines(targets: List<StatusTarget>, named: Boolean = false) {
    if (targets.isEmpty()) return
    val c = X.c
    val meta = MaterialTheme.typography.labelMedium
    Spacer(Modifier.height(8.dp))
    HorizontalDivider(color = c.line1)
    Column(Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        for (t in targets) {
            Row(verticalAlignment = Alignment.Top) {
                Canvas(Modifier.padding(top = 5.dp).size(7.dp)) {
                    val r = size.minDimension / 2f
                    val path = Path().apply {
                        moveTo(center.x, center.y - r); lineTo(center.x + r, center.y); lineTo(center.x, center.y + r); lineTo(center.x - r, center.y); close()
                    }
                    drawPath(path, c.ink2, style = Stroke(1.2.dp.toPx()))
                }
                Spacer(Modifier.width(8.dp))
                Text(if (named) StatusLine.namedLine(t) else t.line, style = meta, color = c.ink1)
            }
        }
    }
}

/** The last judged weeks, oldest first: kept a filled diamond, held a held-blue outline on its wash, missed an outline. */
@Composable
private fun Pips(weeks: List<String>) {
    val c = X.c
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        for (w in weeks) {
            Canvas(Modifier.size(10.dp)) {
                val r = size.minDimension / 2f
                val path = Path().apply {
                    moveTo(center.x, center.y - r); lineTo(center.x + r, center.y); lineTo(center.x, center.y + r); lineTo(center.x - r, center.y); close()
                }
                when (w) {
                    "kept" -> drawPath(path, c.kept)
                    "held" -> { drawPath(path, c.wash(c.held, 0.35f)); drawPath(path, c.held, style = Stroke(1.5.dp.toPx())) }
                    else -> drawPath(path, c.inkMute, style = Stroke(1.5.dp.toPx()))
                }
            }
        }
    }
}

/** The web's Meter: 8 dp, a sunken track; this week's gain in the currency that fed it under last week's banked ink; the cap tick. */
@Composable
private fun Meter(a: StatusAttribute) {
    val c = X.c
    val (banked, now) = StatusLine.meter(a)
    val gain = if (a.unit == "pts") c.pts else c.xp
    Canvas(Modifier.fillMaxWidth().height(8.dp)) {
        val h = size.height
        val radius = CornerRadius(h / 2f)
        drawRoundRect(c.sunken, size = size, cornerRadius = radius)
        drawRoundRect(c.line2, size = size, cornerRadius = radius, style = Stroke(1.dp.toPx()))
        if (now > 0f) drawRoundRect(gain, size = Size(size.width * now, h), cornerRadius = radius)
        if (banked > 0f) drawRoundRect(c.ink0, size = Size(size.width * banked, h), cornerRadius = radius)
        if (a.atCap) drawRect(c.ink1, topLeft = Offset(size.width - 2.dp.toPx(), 0f), size = Size(2.dp.toPx(), h))
    }
}

/**
 * Capital, a reading only: this month's figure, its line and the months before; no meter, no level. With no deal won in
 * the quarter it shows only for its targets (P4). One node for TalkBack.
 */
@Composable
private fun CapitalCard(cap: CapitalReading?, targets: List<StatusTarget>) {
    val c = X.c
    val meta = MaterialTheme.typography.labelMedium
    val described = (cap?.let { StatusLine.capitalDescription(it) } ?: "${StatusLine.CAPITAL}, a reading only. ${StatusLine.CAPITAL_NONE}.") + StatusLine.targetsDescription(targets)
    XCard(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = described }) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(Glyphs.Money, null, tint = c.ink1, modifier = Modifier.padding(top = 2.dp).size(22.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val name = buildAnnotatedString {
                        append(StatusLine.CAPITAL)
                        withStyle(SpanStyle(color = c.ink2, fontSize = meta.fontSize)) { append(" · ${StatusLine.CAPITAL_SUB}") }
                    }
                    Text(name, style = MaterialTheme.typography.titleMedium, color = c.ink0, modifier = Modifier.weight(1f))
                    if (cap != null) {
                        Spacer(Modifier.width(8.dp))
                        Text(cap.won, style = MaterialTheme.typography.titleLarge.figures(), color = c.ink0)
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(cap?.line ?: StatusLine.CAPITAL_NONE, style = meta, color = c.ink1)
                if (cap != null && cap.history.isNotBlank()) Text(cap.history, style = meta, color = c.ink2)
                TargetLines(targets)
            }
        }
    }
}
