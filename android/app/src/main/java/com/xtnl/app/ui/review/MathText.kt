package com.xtnl.app.ui.review

import android.annotation.SuppressLint
import android.graphics.Color as AColor
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream
import com.xtnl.app.ui.theme.X
import kotlinx.serialization.json.JsonPrimitive

/** Has the author's text a math span as the web form writes it, `$…$` or `$$…$$`? (The New idea preview only.) */
fun hasDollarMath(text: String): Boolean = Regex("""\$[^$\n]+\$""").containsMatchIn(text)

/**
 * Prose with LaTeX spans. Plain text is a Text; text with math is typeset by
 * KaTeX in a small transparent WebView (KaTeX is bundled in the app's assets,
 * so it works offline and never touches a CDN). Until KaTeX has drawn, and
 * if it can't, the TeX source shows in monospace.
 *
 * @param display wrap the whole text as display math when it has no delimiters
 * @param dollars also read `$…$` / `$$…$$` spans (the New idea form's preview of what the author typed);
 *   a server prompt marks math with `\( … \)` and `\[ … \]` only
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MathText(
    text: String,
    hasMath: Boolean,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodyLarge,
    color: Color = X.c.ink0,
    display: Boolean = false,
    dollars: Boolean = false,
) {
    if (!hasMath && !display) {
        Text(text, modifier, style = style, color = color)
        return
    }
    var heightDp by remember { mutableIntStateOf(0) }
    var failed by remember { mutableStateOf(false) }
    var ready by remember { mutableStateOf(false) }
    val px = style.fontSize.value.takeIf { !it.isNaN() } ?: 17f
    val css = String.format("#%06X", 0xFFFFFF and color.toArgb())
    val call = "render(${JsonPrimitive(text)}, ${JsonPrimitive(css)}, $px, $display, $dollars)"
    val main = remember { Handler(Looper.getMainLooper()) }
    Box(modifier) {
        if (failed || heightDp == 0) {
            Text(text, Modifier.fillMaxWidth(), style = style.copy(fontFamily = FontFamily.Monospace), color = color.copy(alpha = if (failed) 1f else 0.55f))
        }
        if (!failed) {
            AndroidView(
                factory = { ctx ->
                    WebView(ctx).apply {
                        setBackgroundColor(AColor.TRANSPARENT)
                        isVerticalScrollBarEnabled = false
                        isHorizontalScrollBarEnabled = false
                        overScrollMode = WebView.OVER_SCROLL_NEVER
                        settings.javaScriptEnabled = true
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        // KaTeX is served from the app's own assets on a private https origin, so its fonts load
                        // as same-origin; every other request is refused (no CDN, no network).
                        val assets = WebViewAssetLoader.Builder()
                            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(ctx))
                            .build()
                        addJavascriptInterface(MathBridge(main, onHeight = { heightDp = it }, onReady = { ready = true }), "XtnlMath")
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
                            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse =
                                assets.shouldInterceptRequest(request.url)
                                    ?: WebResourceResponse("text/plain", "utf-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(ByteArray(0)))
                            override fun onPageFinished(view: WebView, url: String) {
                                ready = true
                                view.evaluateJavascript(view.tag as? String ?: "", null)
                            }
                            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                                if (request.isForMainFrame) failed = true
                            }
                            // The app's WebViews share one renderer (the full app's among them). If it dies, every one of
                            // them must say it coped, or the whole app goes down: show the TeX source; leaving drops the view.
                            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                                failed = true
                                return true
                            }
                        }
                        tag = call
                        loadUrl("https://appassets.androidplatform.net/assets/katex/math.html")
                    }
                },
                update = { wv ->
                    if (wv.tag != call) {
                        wv.tag = call
                        if (ready) wv.evaluateJavascript(call, null)
                    }
                },
                // A WebView that left the screen is done with: free it now, not at some later GC.
                onRelease = { it.destroy() },
                modifier = Modifier.fillMaxWidth().height(if (heightDp == 0) 1.dp else heightDp.dp),
            )
        }
    }
}

/** What the page calls back (window.XtnlMath): its height once typeset, and that it has loaded. */
private class MathBridge(private val main: Handler, private val onHeight: (Int) -> Unit, private val onReady: () -> Unit) {
    @JavascriptInterface fun height(h: Int) { main.post { onHeight(h) } }
    @JavascriptInterface fun ready() { main.post { onReady() } }
}
