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
import android.widget.FrameLayout;
import android.widget.TextView;

public class MainActivity extends Activity {

    private WebView web;
    private TextView errorView;

    private static MainActivity instance;

    // Stores the WebView microphone request while Android asks for permission.
    private PermissionRequest pendingPermissionRequest;

    public static MainActivity getInstance() {
        return instance;
    }

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);

        instance = this;

        WebView.setWebContentsDebuggingEnabled(true);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(4, 7, 14));

        web = new WebView(this);

        WebSettings settings = web.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);

        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setLoadsImagesAutomatically(true);

        // Android <-> JavaScript bridge
        web.addJavascriptInterface(
                new AndroidBridge(),
                "JARVIS_ANDROID"
        );

        web.setWebViewClient(new WebViewClient() {

            @Override
            public void onPageFinished(
                    WebView view,
                    String url
            ) {
                super.onPageFinished(view, url);

                view.evaluateJavascript(
                        "window.dispatchEvent(" +
                        "new CustomEvent('jarvis-android-ready')" +
                        ");",
                        null
                );
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                super.onReceivedError(view, request, error);

                if (request.isForMainFrame()) {

                    String description =
                            error != null &&
                            error.getDescription() != null
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

        web.setWebChromeClient(new WebChromeClient() {

            @Override
            public boolean onConsoleMessage(
                    ConsoleMessage consoleMessage
            ) {

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
            public void onPermissionRequest(
                    final PermissionRequest request
            ) {

                runOnUiThread(() -> {

                    boolean needsAudio = false;

                    for (String resource : request.getResources()) {

                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE
                                .equals(resource)) {

                            needsAudio = true;
                            break;
                        }
                    }

                    if (!needsAudio) {
                        request.deny();
                        return;
                    }

                    // Android permission already granted:
                    // immediately grant microphone access to WebView.
                    if (checkSelfPermission(
                            Manifest.permission.RECORD_AUDIO
                    ) == PackageManager.PERMISSION_GRANTED) {

                        try {
                            request.grant(
                                    new String[]{
                                            PermissionRequest
                                                    .RESOURCE_AUDIO_CAPTURE
                                    }
                            );

                            android.util.Log.d(
                                    "JARVIS_WEB",
                                    "WebView microphone permission GRANTED"
                            );

                        } catch (Exception e) {

                            android.util.Log.e(
                                    "JARVIS_WEB",
                                    "Failed to grant WebView microphone",
                                    e
                            );
                        }

                    } else {

                        // Remember the WebView request.
                        pendingPermissionRequest = request;

                        // Ask Android for microphone permission.
                        requestMicPermission();
                    }
                });
            }
        });

        root.addView(
                web,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                )
        );

        errorView = new TextView(this);

        errorView.setTextColor(Color.CYAN);
        errorView.setTextSize(14);
        errorView.setPadding(40, 60, 40, 40);
        errorView.setBackgroundColor(Color.rgb(4, 7, 14));
        errorView.setVisibility(View.GONE);

        root.addView(
                errorView,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                )
        );

        setContentView(root);

        // Request Android microphone permission on first launch.
        if (checkSelfPermission(
                Manifest.permission.RECORD_AUDIO
        ) != PackageManager.PERMISSION_GRANTED) {

            requestMicPermission();
        }

        // Load the bundled React application.
        web.loadUrl(
                "file:///android_asset/dist/index.html"
        );
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

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {

        super.onRequestPermissionsResult(
                requestCode,
                permissions,
                grantResults
        );

        if (requestCode != 42) {
            return;
        }

        boolean granted =
                grantResults.length > 0 &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED;

        android.util.Log.d(
                "JARVIS_PERMISSION",
                "Android microphone permission: " +
                        (granted ? "GRANTED" : "DENIED")
        );

        if (granted) {

            // Android permission is now granted.
            // Complete the pending WebView permission request.
            if (pendingPermissionRequest != null) {

                try {

                    pendingPermissionRequest.grant(
                            new String[]{
                                    PermissionRequest
                                            .RESOURCE_AUDIO_CAPTURE
                            }
                    );

                    android.util.Log.d(
                            "JARVIS_PERMISSION",
                            "WebView microphone permission: GRANTED"
                    );

                } catch (Exception e) {

                    android.util.Log.e(
                            "JARVIS_PERMISSION",
                            "Could not grant WebView microphone",
                            e
                    );
                }

                pendingPermissionRequest = null;
            }

            // Tell the React application that Android microphone
            // permission is ready.
            if (web != null) {

                web.evaluateJavascript(
                        "window.dispatchEvent(" +
                        "new CustomEvent(" +
                        "'jarvis-microphone-granted'" +
                        ")" +
                        ");",
                        null
                );
            }

        } else {

            if (pendingPermissionRequest != null) {

                try {
                    pendingPermissionRequest.deny();
                } catch (Exception ignored) {
                }

                pendingPermissionRequest = null;
            }

            if (web != null) {

                web.evaluateJavascript(
                        "window.dispatchEvent(" +
                        "new CustomEvent(" +
                        "'jarvis-microphone-denied'" +
                        ")" +
                        ");",
                        null
                );
            }
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

    public void emit(
            String type,
            String text
    ) {

        if (web == null) {
            return;
        }

        String safe =
                text == null
                        ? ""
                        : text
                            .replace("\\", "\\\\")
                            .replace("'", "\\'")
                            .replace("\n", " ")
                            .replace("\r", " ");

        String js =
                "window.dispatchEvent(" +
                "new CustomEvent(" +
                "'jarvis-native-event'," +
                "{detail:{type:'" +
                type +
                "',text:'" +
                safe +
                "'}}" +
                ")" +
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

        pendingPermissionRequest = null;

        if (web != null) {
            web.destroy();
            web = null;
        }

        instance = null;

        super.onDestroy();
    }
}
