# JARVIS Android shell

This native Android shell keeps the existing React JARVIS UI and adds a foreground microphone service using Android SpeechRecognizer.

## Build
1. Build the web app first: `npm install` then `npm run build`.
2. Open this `android` folder in Android Studio.
3. Let Gradle sync and build the debug APK.
4. Grant microphone/notification permissions.

The native service recognizes a greeting + JARVIS, then opens a command channel and sends the command into the existing React pipeline.

Important: this is a practical native Android bridge, not a dedicated low-power DSP wake-word engine. A production version can replace SpeechRecognizer in JarvisSpeechService with Porcupine or another on-device wake-word SDK without changing the React UI/pipeline.

For AI responses, the packaged app needs the JARVIS Express backend reachable over HTTPS. Set `VITE_API_BASE_URL` before `npm run build`.
