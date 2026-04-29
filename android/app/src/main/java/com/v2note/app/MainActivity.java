package com.v2note.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 注册自定义 Capacitor 插件
        registerPlugin(AudioSessionPlugin.class);
        registerPlugin(SystemIntentPlugin.class);
        registerPlugin(PersistentNotificationPlugin.class);
        registerPlugin(FloatingCapturePlugin.class);
        super.onCreate(savedInstanceState);

        // Request permissions at startup
        requestAppPermissions();

        WebView webView = getBridge().getWebView();

        // Allow mixed content: HTTPS page → HTTP/WS gateway
        webView.getSettings()
            .setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Wrap Capacitor's existing WebChromeClient to add mic permission handling
        // IMPORTANT: do NOT replace it with new WebChromeClient() — that breaks file input
        final WebChromeClient original = (WebChromeClient) webView.getWebChromeClient();
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                for (String res : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                        if (ContextCompat.checkSelfPermission(
                                MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                == PackageManager.PERMISSION_GRANTED) {
                            request.grant(request.getResources());
                            return;
                        }
                    }
                }
                // Delegate other permission requests to Capacitor's client
                if (original != null) {
                    original.onPermissionRequest(request);
                } else {
                    request.deny();
                }
            }

            // Delegate file chooser to Capacitor's original client (critical for <input type="file">)
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    android.webkit.ValueCallback<android.net.Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (original != null) {
                    return original.onShowFileChooser(webView, filePathCallback, fileChooserParams);
                }
                return super.onShowFileChooser(webView, filePathCallback, fileChooserParams);
            }
        });
    }

    private void requestAppPermissions() {
        String[] permissions;
        if (Build.VERSION.SDK_INT >= 33) {
            permissions = new String[]{
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.CAMERA,
                Manifest.permission.READ_MEDIA_IMAGES,
            };
        } else {
            permissions = new String[]{
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.CAMERA,
                Manifest.permission.READ_EXTERNAL_STORAGE,
            };
        }

        boolean needRequest = false;
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needRequest = true;
                break;
            }
        }

        if (needRequest) {
            ActivityCompat.requestPermissions(this, permissions, 1);
        }
    }
}
