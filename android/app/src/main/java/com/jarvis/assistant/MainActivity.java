package com.jarvis.assistant;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

public class MainActivity extends Activity {

    private WebView web;
    private TextView errorView;

    private static MainActivity instance;

    public static MainActivity getInstance() {
        return instance;
    }

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);

        instance = this;

        // Enable WebView debugging
        WebView.setWebContentsDebuggingEnabled(true);

        // Root container
        android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.setBackgroundColor(Color.rgb(4, 7, 14));

        // WebView
        web = new WebView(this);

        WebSettings settings = web.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Allow the bundled React/Vite assets to load
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);

        // Better compatibility with React applications
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setLoadsImagesAutomatically(true);

        // Add Android bridge
        web.addJavascriptInterface(new AndroidBridge(), "JARVIS_ANDROID");

        // WebView client
        web.setWebViewClient(new WebViewClient() {

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);

                // Tell the React application that Android is ready
                view.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('jarvis-android-ready'));",
                    null
                );
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error) {

                super.onReceivedError(view, request, error);

                if (request.isForMainFrame()) {
                    String description =
                            error != null && error.getDescription() != null
                                    ? error.getDescription().toString()
                                    : "Unknown WebView error";

                    showError(
                            "JARVIS WEBVIEW ERROR\n\n" +
                            description +
                            "\n\nURL:\n" +
                            request.getUrl()
                    );
                }
            }
        });

        // Chrome client: JavaScript console + microphone permission
        web.setWebChromeClient(new WebChromeClient() {

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {

                android.util.Log.d(
                        "JARVIS_WEB",
                        consoleMessage.message()
                                + " | line "
                                + consoleMessage.lineNumber()
                                + " | "
                                + consoleMessage.sourceId()
                );

                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {

                runOnUiThread(() -> {

                    String[] resources = request.getResources();

                    for (String resource : resources) {

                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {

                            if (checkSelfPermission(
                                    Manifest.permission.RECORD_AUDIO
                            ) == PackageManager.PERMISSION_GRANTED) {

                                request.grant(
                                        new String[]{
                                                PermissionRequest.RESOURCE_AUDIO_CAPTURE
                                        }
                                );

                            } else {
                                requestMicPermission();
                            }

                            return;
                        }
                    }

                    request.deny();
                });
            }
        });

        root.addView(
                web,
                new android.widget.FrameLayout.LayoutParams(
                        android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                        android.widget.FrameLayout.LayoutParams.MATCH_PARENT
                )
        );

        // Error screen
        errorView = new TextView(this);
        errorView.setTextColor(Color.CYAN);
        errorView.setTextSize(14);
        errorView.setPadding(40, 60, 40, 40);
        errorView.setBackgroundColor(Color.rgb(4, 7, 14));
        errorView.setVisibility(View.GONE);

        root.addView(
                errorView,
                new android.widget.FrameLayout.LayoutParams(
                        android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                        android.widget.FrameLayout.LayoutParams.MATCH_PARENT
                )
        );

        setContentView(root);

        // Android microphone permission
        if (checkSelfPermission(
                Manifest.permission.RECORD_AUDIO
        ) != PackageManager.PERMISSION_GRANTED) {

            requestMicPermission();
        }

        // Load the bundled React/Vite application
        web.loadUrl("file:///android_asset/dist/index.html");
    }

    private void requestMicPermission() {

        if (android.os.Build.VERSION.SDK_INT >= 23) {

            requestPermissions(
                    new String[]{
                            Manifest.permission.RECORD_AUDIO
                    },
                    42
            );
        }
    }

    private void showError(String message) {

        if (errorView == null) {
            return;
        }

        runOnUiThread(() -> {

            errorView.setText(
                    "J.A.R.V.I.S.\n\n" +
                    "ANDROID INTERFACE FAILED TO LOAD\n\n" +
                    message
            );

            errorView.setVisibility(View.VISIBLE);
        });
    }

    public void emit(String type, String text) {

        if (web == null) {
            return;
        }

        String safe = text == null
                ? ""
                : text
                    .replace("\\", "\\\\")
                    .replace("'", "\\'")
                    .replace("\n", " ")
                    .replace("\r", " ");

        String js =
                "window.dispatchEvent(" +
                "new CustomEvent('jarvis-native-event'," +
                "{detail:{type:'" +
                type +
                "',text:'" +
                safe +
                "'}})" +
                ");";

        runOnUiThread(() ->
                web.evaluateJavascript(js, null)
        );
    }

    public class AndroidBridge {

        @JavascriptInterface
        public void start(String mode) {

            Intent intent =
                    new Intent(
                            MainActivity.this,
                            JarvisSpeechService.class
                    ).setAction(mode);

            if (android.os.Build.VERSION.SDK_INT >= 26) {

                startForegroundService(intent);

            } else {

                startService(intent);
            }
        }

        @JavascriptInterface
        public void stop() {

            stopService(
                    new Intent(
                            MainActivity.this,
                            JarvisSpeechService.class
                    )
            );
        }
    }

    @Override
    protected void onDestroy() {

        if (web != null) {
            web.destroy();
            web = null;
        }

        instance = null;

        super.onDestroy();
    }
}
