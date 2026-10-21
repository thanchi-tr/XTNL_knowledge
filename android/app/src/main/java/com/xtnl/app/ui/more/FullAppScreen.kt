package com.xtnl.app.ui.more

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.xtnl.app.BuildConfig
import com.xtnl.app.core.ServerAddress
import com.xtnl.app.ui.components.ButtonKind
import com.xtnl.app.ui.components.Glyphs
import com.xtnl.app.ui.components.XButton
import com.xtnl.app.ui.components.XIconButton
import com.xtnl.app.ui.theme.X

/**
 * One WebView for the whole run of the app (the full web app), so leaving
 * "Open full app" and coming back keeps the page where it was. The v1
 * shell's rules: links on the server's own origin stay inside, anything else
 * opens in the browser; Back goes back in the page first (sheets close on
 * Back because they push a history entry); the file chooser works; a "Can't
 * reach" screen when the page can't load.
 */
class WebHolder {
    var web: WebView? = null
        private set
    var loadedBase: String? = null
    /** The server's origin now: links on it stay inside. Set on every show, so a new address in Settings counts at once. */
    @Volatile var base: String = ""

    var progress by mutableIntStateOf(100)
    var canGoBack by mutableStateOf(false)
    var failed by mutableStateOf(false)
    /** The page's renderer died (not the network): the failure screen says so. */
    var rendererGone by mutableStateOf(false)
    /** Ticks when the WebView was dropped, so the screen builds a new one (Retry, Reload). */
    var generation by mutableIntStateOf(0)
        private set
    var fileCallback: ValueCallback<Array<Uri>>? = null
    var chooser: ((Intent) -> Unit)? = null

    @SuppressLint("SetJavaScriptEnabled")
    fun get(context: Context): WebView {
        web?.let { (it.parent as? ViewGroup)?.removeView(it); return it }
        val w = WebView(context)
        w.setBackgroundColor(0xFF0A0D13.toInt())
        val s = w.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        s.setSupportMultipleWindows(false)
        s.javaScriptCanOpenWindowsAutomatically = false
        s.allowFileAccess = false
        s.allowContentAccess = true
        s.mediaPlaybackRequiresUserGesture = true
        s.userAgentString = s.userAgentString + " XTNLAndroid/" + BuildConfig.VERSION_NAME
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(w, false)
        }
        w.overScrollMode = WebView.OVER_SCROLL_NEVER
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (ServerAddress.sameOrigin(uri.toString(), base)) return false
                openOutside(view.context, uri)
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) { failed = false; rendererGone = false }

            override fun onPageFinished(view: WebView, url: String?) {
                progress = 100
                CookieManager.getInstance().flush()
            }

            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                canGoBack = view.canGoBack()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) failed = true
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // The page's renderer died (memory pressure): drop this WebView, and show the failure screen,
                // whose Retry makes a new one. Nothing is left to go back in.
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
                if (web === view) {
                    web = null
                    loadedBase = null
                    canGoBack = false
                    progress = 100
                    rendererGone = true
                    failed = true
                }
                return true
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) { progress = newProgress }

            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val launch = chooser ?: run { fileCallback = null; return false }
                return try {
                    launch(params.createIntent())
                    true
                } catch (e: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }
        }
        web = w
        return w
    }

    fun destroy() {
        web?.let { (it.parent as? ViewGroup)?.removeView(it); it.destroy() }
        web = null
    }

    /** Retry and Reload: load the page again, in a new WebView if the renderer took the old one. */
    fun retry(target: String) {
        failed = false
        rendererGone = false
        val w = web
        when {
            w == null -> generation++
            w.url.isNullOrEmpty() || w.url == "about:blank" -> w.loadUrl(target)
            else -> w.reload()
        }
    }

    companion object {
        fun openOutside(context: Context, uri: Uri) {
            try {
                context.startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: ActivityNotFoundException) {
            }
        }
    }
}

@Composable
fun FullAppScreen(holder: WebHolder, server: String, path: String, onClose: () -> Unit, onSettings: () -> Unit) {
    val c = X.c
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        holder.fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data).takeIf { res.resultCode == Activity.RESULT_OK })
        holder.fileCallback = null
    }
    holder.chooser = { launcher.launch(it) }
    holder.base = server
    val target = server.trimEnd('/') + (if (path.startsWith("/")) path else "/$path")

    BackHandler(enabled = holder.canGoBack && !holder.failed) { holder.web?.goBack() }
    BackHandler(enabled = !holder.canGoBack || holder.failed) { onClose() }

    Column(Modifier.fillMaxSize().background(c.page).windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top))) {
        Row(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            XIconButton(Glyphs.Close, "Close the full app", onClose)
            Text(ServerAddress.hostOf(server), color = c.ink1, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            XIconButton(Glyphs.Refresh, "Reload", { holder.retry(target) })
        }
        Box(Modifier.fillMaxWidth().height(2.dp)) {
            if (holder.progress < 100) LinearProgressIndicator(progress = { holder.progress / 100f }, modifier = Modifier.fillMaxSize(), color = c.ink0, trackColor = c.line1)
        }
        Box(Modifier.weight(1f).fillMaxWidth().windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars).only(WindowInsetsSides.Bottom))) {
            key(holder.generation) {
                AndroidView(
                    factory = { ctx ->
                        holder.get(ctx).also { w ->
                            if (holder.loadedBase != target) {
                                holder.loadedBase = target
                                w.loadUrl(target)
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                )
            }
            if (holder.failed) {
                Column(
                    Modifier.fillMaxSize().background(c.page).padding(24.dp),
                    verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(Glyphs.Offline, null, tint = c.ink2, modifier = Modifier.size(40.dp))
                    Spacer(Modifier.height(16.dp))
                    Text("Can't reach XTNL", style = MaterialTheme.typography.headlineSmall, color = c.ink0)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        if (holder.rendererGone) "The page stopped (the phone took its memory back). Retry to load it again."
                        else "${ServerAddress.hostOf(server)} didn't answer. Check the connection, or that the server is running.",
                        style = MaterialTheme.typography.bodyMedium, color = c.ink1, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 420.dp),
                    )
                    Spacer(Modifier.height(24.dp))
                    XButton("Retry", { holder.retry(target) }, Modifier.widthIn(min = 220.dp), icon = Glyphs.Refresh)
                    Spacer(Modifier.height(8.dp))
                    XButton("Change address", onSettings, Modifier.widthIn(min = 220.dp), kind = ButtonKind.QUIET, icon = Glyphs.Settings)
                }
            }
        }
    }
    // A new address or deep-linked path while the page is up: load it.
    LaunchedEffect(target) {
        val w = holder.web ?: return@LaunchedEffect
        if (holder.loadedBase != target) {
            holder.loadedBase = target
            w.clearHistory()
            w.loadUrl(target)
        }
    }
}
