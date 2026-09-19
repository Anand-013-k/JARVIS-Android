package com.jarvis.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Bundle;
import android.os.IBinder;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.util.ArrayList;
import java.util.Locale;

public class JarvisSpeechService extends Service implements RecognitionListener {

    private static final String CHANNEL = "jarvis_voice";
    private static final int NOTIFICATION_ID = 1001;

    private SpeechRecognizer recognizer;

    private String mode = "wake";

    private boolean running = false;
    private boolean restarting = false;
    private boolean wakeAlreadyDetected = false;

    @Override
    public void onCreate() {
        super.onCreate();

        NotificationChannel channel = new NotificationChannel(
                CHANNEL,
                "JARVIS voice",
                NotificationManager.IMPORTANCE_LOW
        );

        NotificationManager manager =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

        if (manager != null) {
            manager.createNotificationChannel(channel);
        }

        Notification notification =
                new Notification.Builder(this, CHANNEL)
                        .setContentTitle("JARVIS listening")
                        .setContentText("Voice standby is active")
                        .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                        .setOngoing(true)
                        .build();

        startForeground(NOTIFICATION_ID, notification);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {

        String requestedMode =
                intent != null ? intent.getAction() : null;

        if ("command".equals(requestedMode)) {
            mode = "command";
        } else {
            mode = "wake";
        }

        wakeAlreadyDetected = false;
        running = true;

        startRecognition();

        return START_STICKY;
    }

    private void startRecognition() {

        if (!running || restarting) {
            return;
        }

        restarting = true;

        destroyRecognizer();

        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            emit(
                    "error",
                    "Android speech recognition is unavailable on this device."
            );

            restarting = false;
            return;
        }

        recognizer = SpeechRecognizer.createSpeechRecognizer(this);

        if (recognizer == null) {
            emit(
                    "error",
                    "Could not create Android speech recognizer."
            );

            restarting = false;
            return;
        }

        recognizer.setRecognitionListener(this);

        Intent intent =
                new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);

        intent.putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
        );

        intent.putExtra(
                RecognizerIntent.EXTRA_LANGUAGE,
                Locale.US.toLanguageTag()
        );

        intent.putExtra(
                RecognizerIntent.EXTRA_PARTIAL_RESULTS,
                true
        );

        intent.putExtra(
                RecognizerIntent.EXTRA_MAX_RESULTS,
                3
        );

        try {
            recognizer.startListening(intent);
        } catch (Exception e) {

            emit(
                    "error",
                    e.getMessage() != null
                            ? e.getMessage()
                            : "Failed to start speech recognition."
            );

            scheduleRestart(1000);
        }
    }

    private void scheduleRestart(long delay) {

        if (!running) {
            return;
        }

        new android.os.Handler(
                android.os.Looper.getMainLooper()
        ).postDelayed(() -> {

            if (!running) {
                return;
            }

            restarting = false;
            startRecognition();

        }, delay);
    }

    private void destroyRecognizer() {

        if (recognizer != null) {

            try {
                recognizer.cancel();
            } catch (Exception ignored) {
            }

            try {
                recognizer.destroy();
            } catch (Exception ignored) {
            }

            recognizer = null;
        }
    }

    private void emit(String type, String text) {

        MainActivity activity =
                MainActivity.getInstance();

        if (activity != null) {
            activity.emit(
                    type,
                    text == null ? "" : text
            );
        }
    }

    private boolean containsWakeWord(String text) {

        if (text == null) {
            return false;
        }

        String normalized =
                text.toLowerCase(Locale.US)
                        .replaceAll("[^a-z ]", " ")
                        .replaceAll("\\s+", " ")
                        .trim();

        return normalized.matches(
                ".*\\b(hey|okay|ok|hi|hello) jarvis\\b.*"
        );
    }

    private String extractCommandAfterWakeWord(String text) {

        if (text == null) {
            return "";
        }

        String normalized =
                text.toLowerCase(Locale.US);

        int jarvisIndex =
                normalized.indexOf("jarvis");

        if (jarvisIndex < 0) {
            return "";
        }

        String command =
                text.substring(jarvisIndex + 6);

        return command
                .replaceFirst("^[, .!?-]+", "")
                .trim();
    }

    @Override
    public void onReadyForSpeech(Bundle params) {

        restarting = false;

        emit(
                "listening",
                mode
        );
    }

    @Override
    public void onBeginningOfSpeech() {
    }

    @Override
    public void onRmsChanged(float rmsdB) {
    }

    @Override
    public void onBufferReceived(byte[] buffer) {
    }

    @Override
    public void onEndOfSpeech() {
    }

    @Override
    public void onPartialResults(Bundle bundle) {

        if (!running || bundle == null) {
            return;
        }

        ArrayList<String> results =
                bundle.getStringArrayList(
                        SpeechRecognizer.RESULTS_RECOGNITION
                );

        if (results == null || results.isEmpty()) {
            return;
        }

        String text = results.get(0);

        if (text == null || text.trim().isEmpty()) {
            return;
        }

        if ("wake".equals(mode)) {

            if (!wakeAlreadyDetected &&
                    containsWakeWord(text)) {

                wakeAlreadyDetected = true;

                emit("wake", "");
            }

            return;
        }

        emit("partial", text);
    }

    @Override
    public void onResults(Bundle bundle) {

        if (!running || bundle == null) {
            return;
        }

        ArrayList<String> results =
                bundle.getStringArrayList(
                        SpeechRecognizer.RESULTS_RECOGNITION
                );

        String text =
                (results != null && !results.isEmpty())
                        ? results.get(0)
                        : "";

        text = text == null ? "" : text.trim();

        if ("wake".equals(mode)) {

            if (containsWakeWord(text)) {

                if (!wakeAlreadyDetected) {

                    wakeAlreadyDetected = true;

                    emit("wake", "");
                }

                String command =
                        extractCommandAfterWakeWord(text);

                if (!command.isEmpty()) {

                    emit(
                            "command",
                            command
                    );

                    mode = "wake";
                    wakeAlreadyDetected = false;

                    scheduleRestart(500);

                    return;
                }

                mode = "command";
                wakeAlreadyDetected = false;

                scheduleRestart(300);

                return;
            }

            wakeAlreadyDetected = false;

            scheduleRestart(350);

            return;
        }

        if (!text.isEmpty()) {

            emit(
                    "command",
                    text
            );
        }

        mode = "wake";
        wakeAlreadyDetected = false;

        scheduleRestart(500);
    }

    @Override
    public void onError(int error) {

        if (!running) {
            return;
        }

        String message;

        switch (error) {

            case SpeechRecognizer.ERROR_AUDIO:
                message = "Audio recording error.";
                break;

            case SpeechRecognizer.ERROR_CLIENT:
                message = "Speech recognizer client error.";
                break;

            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                message = "Microphone permission is required.";
                break;

            case SpeechRecognizer.ERROR_NETWORK:
                message = "Speech recognition network error.";
                break;

            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                message = "Speech recognition network timeout.";
                break;

            case SpeechRecognizer.ERROR_NO_MATCH:
                message = "No speech match.";
                break;

            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                message = "Speech recognizer is busy.";
                break;

            case SpeechRecognizer.ERROR_SERVER:
                message = "Speech recognition server error.";
                break;

            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                message = "Speech input timed out.";
                break;

            default:
                message = "Speech recognition error: " + error;
                break;
        }

        if (error != SpeechRecognizer.ERROR_NO_MATCH &&
                error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {

            emit("error", message);
        }

if (error ==
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {

    running = false;
    return;
}

if (error ==
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {

    restarting = false;

    destroyRecognizer();

    scheduleRestart(1500);

    return;
}

scheduleRestart(1000);
    }

    @Override
    public void onEvent(int eventType, Bundle params) {
    }

    @Override
    public void onDestroy() {

        running = false;
        restarting = false;

        destroyRecognizer();

        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
