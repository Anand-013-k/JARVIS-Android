package com.jarvis.assistant;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView web;
    private static MainActivity instance;
    public static MainActivity getInstance() { return instance; }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state); instance = this;
        web = new WebView(this); setContentView(web);
        WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new AndroidBridge(), "JARVIS_ANDROID");
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 42);
        web.loadUrl("file:///android_asset/dist/index.html");
    }

    public void emit(String type, String text) {
        if (web == null) return;
        String safe = text == null ? "" : text.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ");
        String js = "window.dispatchEvent(new CustomEvent('jarvis-native-event',{detail:{type:'"+type+"',text:'"+safe+"'}}));";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    public class AndroidBridge {
        @JavascriptInterface public void start(String mode) {
            Intent i = new Intent(MainActivity.this, JarvisSpeechService.class).setAction(mode);
            if (android.os.Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
        }
        @JavascriptInterface public void stop() { stopService(new Intent(MainActivity.this, JarvisSpeechService.class)); }
    }
}
