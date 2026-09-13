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
    private static final String CHANNEL="jarvis_voice";
    private SpeechRecognizer recognizer;
    private String mode="wake";
    private boolean running;

    @Override public void onCreate() { super.onCreate();
        NotificationChannel c=new NotificationChannel(CHANNEL,"JARVIS voice",NotificationManager.IMPORTANCE_LOW);
        ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(c);
        Notification n=new Notification.Builder(this,CHANNEL).setContentTitle("JARVIS listening").setContentText("Voice standby is active").setSmallIcon(android.R.drawable.ic_btn_speak_now).build();
        startForeground(1001,n);
    }
    @Override public int onStartCommand(Intent intent,int flags,int id){ mode=intent!=null&&intent.getAction()!=null?intent.getAction():"wake"; startRecognition(); return START_STICKY; }
    private void startRecognition(){
        if (recognizer!=null) try{recognizer.destroy();}catch(Exception ignored){}
        if (!SpeechRecognizer.isRecognitionAvailable(this)){ emit("error","Android speech recognition is unavailable on this device."); return; }
        recognizer=SpeechRecognizer.createSpeechRecognizer(this); recognizer.setRecognitionListener(this);
        Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH); i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM); i.putExtra(RecognizerIntent.EXTRA_LANGUAGE,Locale.US.toLanguageTag()); i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true); i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,3);
        running=true; try{recognizer.startListening(i);}catch(Exception e){emit("error",e.getMessage());}
    }
    private void emit(String t,String x){ MainActivity a=MainActivity.getInstance(); if(a!=null)a.emit(t,x); }
    private boolean wake(String s){ String x=s.toLowerCase(Locale.US).replaceAll("[^a-z ]"," ").replaceAll("\\s+"," ").trim(); return x.matches(".*\\b(hey|okay|ok|hi|hello) jarvis\\b.*"); }
    private String afterWake(String s){ int i=s.toLowerCase(Locale.US).indexOf("jarvis"); return i>=0?s.substring(i+6).replaceFirst("^[, .!?-]+","").trim():""; }

    @Override public void onResults(Bundle b){ ArrayList<String> r=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); String s=(r!=null&&!r.isEmpty())?r.get(0):"";
        if(mode.equals("wake")) { if(wake(s)){ emit("wake",""); String tail=afterWake(s); mode="command"; if(!tail.isEmpty()) emit("command",tail); } }
        else if(!s.isEmpty()) emit("command",s);
        if(running) startRecognition();
    }
    @Override public void onPartialResults(Bundle b){ ArrayList<String> r=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); if(r!=null&&!r.isEmpty()){String s=r.get(0); if(mode.equals("wake")){if(wake(s))emit("wake","");}else emit("partial",s);} }
    @Override public void onError(int e){ if(running){ startRecognition(); } }
    @Override public void onReadyForSpeech(Bundle b){} @Override public void onBeginningOfSpeech(){} @Override public void onRmsChanged(float v){} @Override public void onBufferReceived(byte[] b){} @Override public void onEndOfSpeech(){} @Override public void onEvent(int a,Bundle b){}
    @Override public void onDestroy(){running=false;if(recognizer!=null)recognizer.destroy();super.onDestroy();}
    @Override public IBinder onBind(Intent i){return null;}
}
