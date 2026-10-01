package com.xtnl.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.window.OnBackInvokedDispatcher;

/**
 * The whole app: one WebView showing the XTNL web app. Nothing is drawn
 * natively except a thin loading bar, the "can't reach" screen and the
 * address dialog.
 *
 * - The address comes from BuildConfig.START_URL (gradle.properties
 *   xtnl.url) until the user sets another one (long-press the icon →
 *   Address, or "Change address" on the offline screen).
 * - Links on the app's own origin stay inside; anything else opens in the
 *   browser.
 * - Back goes back in the page's history first (the capture sheet closes on
 *   Back because it pushes a history entry), and leaves the app only when
 *   there is none.
 * - Launcher shortcuts open xtnl://app/<path> (Quick task, Review, New idea).
 * - Fold/unfold, rotation and a hardware keyboard never reload the page
 *   (configChanges in the manifest); a killed process restores its history.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "xtnl";
    private static final String KEY_URL = "url";
    private static final String ACTION_CHANGE_ADDRESS = "com.xtnl.app.CHANGE_ADDRESS";
    private static final int FILE_REQUEST = 41;

    private WebView web;
    private ProgressBar progress;
    private View offline;
    private TextView offlineBody;
    private ValueCallback<Uri[]> fileCallback;
    /** A page has finished loading (or was restored), so a plain relaunch keeps it. */
    private boolean loadedOnce;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.xtnl_bg));

        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.xtnl_bg));
        configure(web);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setIndeterminate(false);
        progress.setVisibility(View.GONE);
        root.addView(progress, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP));

        offline = buildOfflineView();
        offline.setVisibility(View.GONE);
        root.addView(offline, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }

        if (state != null && web.restoreState(state) != null) {
            loadedOnce = true;
        } else {
            handleIntent(getIntent(), true);
        }
    }

    // ── The WebView ─────────────────────────────────────────────────────────

    private void configure(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " XTNLAndroid/" + BuildConfig.VERSION_NAME);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(w, false);

        w.setFocusable(true);
        w.setFocusableInTouchMode(true);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);

        w.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (sameOrigin(uri, Uri.parse(baseUrl()))) return false;
                openOutside(uri);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                offline.setVisibility(View.GONE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                loadedOnce = true;
                progress.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // The page's renderer died (memory pressure): start over rather than crash.
                recreate();
                return true;
            }
        });

        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress < 100 ? View.VISIBLE : View.GONE);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQUEST);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ── Intents: launch, launcher shortcuts, the address action ─────────────

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent, false);
    }

    private void handleIntent(Intent intent, boolean firstLoad) {
        if (intent != null && ACTION_CHANGE_ADDRESS.equals(intent.getAction())) {
            if (firstLoad) web.loadUrl(baseUrl());
            showAddressDialog();
            return;
        }
        Uri data = intent == null ? null : intent.getData();
        if (data != null && "xtnl".equals(data.getScheme())) {
            web.loadUrl(resolve(data));
        } else if (firstLoad || !loadedOnce) {
            web.loadUrl(baseUrl());
        }
    }

    /** xtnl://app/today?capture=task → <base>/today?capture=task. */
    private String resolve(Uri deepLink) {
        String path = deepLink.getEncodedPath() == null ? "/" : deepLink.getEncodedPath();
        String query = deepLink.getEncodedQuery();
        return baseUrl() + path + (query == null ? "" : "?" + query);
    }

    // ── Back ────────────────────────────────────────────────────────────────

    private void goBack() {
        if (offline.getVisibility() == View.VISIBLE) {
            finish();
        } else if (web.canGoBack()) {
            web.goBack();
        } else {
            finish();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Android 12 and older; 13+ uses the OnBackInvokedCallback registered in onCreate.
        goBack();
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            ((ViewGroup) web.getParent()).removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }

    // ── The address ─────────────────────────────────────────────────────────

    private String baseUrl() {
        String saved = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_URL, null);
        return trimSlash(saved != null ? saved : BuildConfig.START_URL);
    }

    private void showAddressDialog() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(24), dp(8), dp(24), 0);

        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_DONE);
        input.setHint(R.string.address_hint);
        input.setText(baseUrl());
        input.setSelection(input.getText().length());
        box.addView(input);

        TextView help = new TextView(this);
        help.setText(R.string.address_help);
        help.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        help.setPadding(0, dp(8), 0, 0);
        box.addView(help);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(R.string.address_title)
                .setView(box)
                .setPositiveButton(R.string.save, null)
                .setNeutralButton(R.string.reset, (d, w) -> saveAddress(null))
                .setNegativeButton(R.string.cancel, null)
                .create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String url = trimSlash(input.getText().toString().trim());
            Uri uri = Uri.parse(url);
            boolean ok = uri.getHost() != null && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()));
            if (!ok) {
                input.setError(getString(R.string.address_invalid));
                return;
            }
            saveAddress(url);
            dialog.dismiss();
        }));
        dialog.show();
    }

    /** Saves the address (null = back to the built-in one) and opens it. */
    private void saveAddress(String url) {
        SharedPreferences.Editor e = getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (url == null) e.remove(KEY_URL);
        else e.putString(KEY_URL, url);
        e.apply();
        web.clearHistory();
        web.loadUrl(baseUrl());
    }

    // ── The offline screen ──────────────────────────────────────────────────

    private View buildOfflineView() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(24), dp(24), dp(24), dp(24));
        box.setBackgroundColor(getColor(R.color.xtnl_bg));
        box.setClickable(true);

        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextColor(getColor(R.color.xtnl_text));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        title.setGravity(Gravity.CENTER);
        box.addView(title);

        offlineBody = new TextView(this);
        offlineBody.setTextColor(getColor(R.color.xtnl_muted));
        offlineBody.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        offlineBody.setGravity(Gravity.CENTER);
        offlineBody.setPadding(0, dp(8), 0, dp(20));
        box.addView(offlineBody);

        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setMinHeight(dp(48));
        retry.setOnClickListener(v -> {
            offline.setVisibility(View.GONE);
            if (web.getUrl() == null || "about:blank".equals(web.getUrl())) web.loadUrl(baseUrl());
            else web.reload();
        });
        box.addView(retry, new LinearLayout.LayoutParams(dp(220), ViewGroup.LayoutParams.WRAP_CONTENT));

        Button change = new Button(this);
        change.setText(R.string.change_address);
        change.setMinHeight(dp(48));
        change.setOnClickListener(v -> showAddressDialog());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(220), ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        box.addView(change, lp);
        return box;
    }

    private void showOffline() {
        progress.setVisibility(View.GONE);
        offlineBody.setText(getString(R.string.offline_body, Uri.parse(baseUrl()).getHost()));
        offline.setVisibility(View.VISIBLE);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private void openOutside(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException ignored) {
            // No app can open it: stay on the page.
        }
    }

    private static boolean sameOrigin(Uri a, Uri b) {
        return a.getScheme() != null && a.getScheme().equalsIgnoreCase(b.getScheme())
                && a.getHost() != null && a.getHost().equalsIgnoreCase(b.getHost())
                && portOf(a) == portOf(b);
    }

    private static int portOf(Uri u) {
        if (u.getPort() != -1) return u.getPort();
        return "https".equalsIgnoreCase(u.getScheme()) ? 443 : 80;
    }

    private static String trimSlash(String url) {
        String s = url;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
