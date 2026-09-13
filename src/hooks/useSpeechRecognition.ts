import { useState, useEffect, useRef, useCallback } from 'react';
import { JarvisPipelineStatus } from '../types/jarvis';
import { apiUrl } from '../services/api';
import { getNativeJarvisBridge } from '../services/nativeBridge';

export interface DiagnosticEventLog {
  id: string;
  time: string;
  event: string;
  details: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface SpeechDiagnostics {
  hasSpeechRecognition: boolean;
  hasWebkitSpeechRecognition: boolean;
  constructorUsed: string;
  micPermission: 'granted' | 'prompt' | 'denied' | 'query_unsupported' | 'checking';
  isSecureContext: boolean;
  isInIframe: boolean;
  exactError: string | null;
  lastEvent: string | null;
  lastEventTimestamp: string | null;
  lastInterim: string;
  lastFinal: string;
  confidenceScore: number | null;
  detectedLanguage: string;
  eventCounts: {
    onstart: number;
    onaudiostart: number;
    onsoundstart: number;
    onspeechstart: number;
    onresult: number;
    onspeechend: number;
    onsoundend: number;
    onaudioend: number;
    onerror: number;
    onend: number;
  };
  eventLogs: DiagnosticEventLog[];
  zeroWordsCaptured: boolean;
  isWebSpeechUnavailable: boolean;
  unavailableReason: string | null;
}

interface UseSpeechRecognitionOptions {
  onFinalTranscript?: (transcript: string) => void;
  onWakeWordDetected?: (trailingCommand?: string) => void;
  wakeWordEnabled?: boolean;
  isSpeaking?: boolean;
  onCommandListeningStart?: () => void;
  onPipelineTransition?: (from: JarvisPipelineStatus, to: JarvisPipelineStatus, reason?: string) => void;
  preferredInputDeviceId?: string | null;
}

/**
 * Deduplicates overlapping and interim repeated words and phrases caused by speech engine events
 * Examples:
 * - "oneplus oneplus oneplus 19 oneplus 19" -> "oneplus 19"
 * - "what what water what water right now" -> "what water right now"
 * Preserves what the speech engine actually heard without altering vocabulary or spelling.
 */
export function cleanTranscriptRepetitions(rawText: string): string {
  if (!rawText) return '';
  const text = rawText.trim().replace(/\s+/g, ' ');
  if (!text) return '';

  const rawWords = text.split(' ');
  if (rawWords.length <= 1) return text;

  // Step 1: Remove immediate consecutive duplicate single words (case-insensitive)
  const deduplicatedWords: string[] = [];
  for (let i = 0; i < rawWords.length; i++) {
    const current = rawWords[i];
    const prev = deduplicatedWords[deduplicatedWords.length - 1];
    if (prev && prev.toLowerCase() === current.toLowerCase()) {
      continue;
    }
    deduplicatedWords.push(current);
  }

  // Step 2: Remove immediate consecutive repeated n-gram phrases (from 4 words down to 2 words)
  const tokens = [...deduplicatedWords];
  let changed = true;
  let safetyLoops = 0;

  while (changed && safetyLoops < 10) {
    changed = false;
    safetyLoops++;
    for (let phraseLen = 4; phraseLen >= 2; phraseLen--) {
      for (let i = 0; i <= tokens.length - phraseLen * 2; i++) {
        const phraseA = tokens.slice(i, i + phraseLen).map(w => w.toLowerCase()).join(' ');
        const phraseB = tokens.slice(i + phraseLen, i + phraseLen * 2).map(w => w.toLowerCase()).join(' ');
        if (phraseA === phraseB) {
          tokens.splice(i + phraseLen, phraseLen);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return tokens.join(' ');
}

// Detects genuine "Hey JARVIS", "Ok JARVIS", "Okay JARVIS", "Hi JARVIS", or "Hello JARVIS"
export function detectWakeWordPhrase(text: string): { detected: boolean; trailingText: string } {
  if (!text) return { detected: false, trailingText: '' };
  // Requires explicit greeting prefix (hey, ok, okay, hi, hello) before "jarvis" to prevent false positives from background chatter or assistant responses
  const wakeWordRegex = /\b(?:hey|ok|okay|hi|hello)\b[,\s]*\bjarvis\b/i;
  const match = text.match(wakeWordRegex);
  if (match && match.index !== undefined) {
    const after = text.slice(match.index + match[0].length).trim();
    const cleanTrailing = after.replace(/^[,.:;!?-]+\s*/, '').trim();
    return { detected: true, trailingText: cleanTrailing };
  }
  return { detected: false, trailingText: '' };
}

// Safely obtain the vendor-prefixed SpeechRecognition constructor
function getSpeechRecognitionClass(): (new () => any) | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

function getConstructorName(): string {
  if (typeof window === 'undefined') return 'None (SSR)';
  if ((window as any).SpeechRecognition) return 'window.SpeechRecognition';
  if ((window as any).webkitSpeechRecognition) return 'window.webkitSpeechRecognition';
  return 'None (Not Supported)';
}

function checkIsSecure(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function checkIsInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function getFormattedTime(): string {
  const d = new Date();
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function useSpeechRecognition({
  onFinalTranscript,
  onWakeWordDetected,
  wakeWordEnabled = false,
  isSpeaking = false,
  onCommandListeningStart,
  onPipelineTransition,
  preferredInputDeviceId,
}: UseSpeechRecognitionOptions = {}) {
  const preferredInputDeviceIdRef = useRef<string | null>(preferredInputDeviceId || null);
  useEffect(() => {
    preferredInputDeviceIdRef.current = preferredInputDeviceId || null;
  }, [preferredInputDeviceId]);

  // Operational states
  const [isListening, setIsListening] = useState(false);
  // Explicit command listening state: true ONLY when actively listening for command directive
  const [commandListeningActive, setCommandListeningActive] = useState(false);
  const commandListeningActiveRef = useRef(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  // Pipeline status state: STANDBY -> WAKE_DETECTED -> LISTENING -> PROCESSING -> SPEAKING
  const [pipelineStatus, setPipelineStatus] = useState<JarvisPipelineStatus>('STANDBY');
  const pipelineStatusRef = useRef<JarvisPipelineStatus>('STANDBY');

  // Track assistant speech synthesis state to reject mic feedback/echo during speaking
  const isSpeakingRef = useRef(isSpeaking);
  const speechEndTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isSpeakingRef.current && !isSpeaking) {
      speechEndTimeRef.current = Date.now();
    }
    isSpeakingRef.current = Boolean(isSpeaking);
  }, [isSpeaking]);

  // Active engine mode: 'webspeech' (browser API) vs 'fallback' (MediaRecorder + Gemini)
  const [activeMode, setActiveMode] = useState<'webspeech' | 'fallback'>('webspeech');
  const [isTranscribingFallback, setIsTranscribingFallback] = useState(false);

  // Comprehensive diagnostic telemetry
  const [diagnostics, setDiagnostics] = useState<SpeechDiagnostics>(() => {
    const hasStd = typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition);
    const hasWebkit = typeof window !== 'undefined' && Boolean((window as any).webkitSpeechRecognition);
    return {
      hasSpeechRecognition: hasStd,
      hasWebkitSpeechRecognition: hasWebkit,
      constructorUsed: getConstructorName(),
      micPermission: 'checking',
      isSecureContext: checkIsSecure(),
      isInIframe: checkIsInIframe(),
      exactError: null,
      lastEvent: null,
      lastEventTimestamp: null,
      lastInterim: '',
      lastFinal: '',
      confidenceScore: null,
      detectedLanguage: 'en-US',
      eventCounts: {
        onstart: 0,
        onaudiostart: 0,
        onsoundstart: 0,
        onspeechstart: 0,
        onresult: 0,
        onspeechend: 0,
        onsoundend: 0,
        onaudioend: 0,
        onerror: 0,
        onend: 0,
      },
      eventLogs: [],
      zeroWordsCaptured: false,
      isWebSpeechUnavailable: false,
      unavailableReason: null,
    };
  });

  // Persistent callback refs
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onWakeWordDetectedRef = useRef(onWakeWordDetected);
  const onCommandListeningStartRef = useRef(onCommandListeningStart);
  const onPipelineTransitionRef = useRef(onPipelineTransition);
  const wakeWordEnabledRef = useRef(wakeWordEnabled);
  const activeModeRef = useRef(activeMode);

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    onWakeWordDetectedRef.current = onWakeWordDetected;
  }, [onWakeWordDetected]);

  useEffect(() => {
    onCommandListeningStartRef.current = onCommandListeningStart;
  }, [onCommandListeningStart]);

  useEffect(() => {
    onPipelineTransitionRef.current = onPipelineTransition;
  }, [onPipelineTransition]);

  // Wake word standby state: true when listening for "Hey JARVIS", false when recording command
  const isWakeWordStandbyRef = useRef(wakeWordEnabled);
  const [isWakeWordStandby, setIsWakeWordStandby] = useState(wakeWordEnabled);

  // Active recognition session manager with strict token cancellation to guarantee mutual exclusivity
  const currentSessionRef = useRef<{
    id: number;
    token: string;
    type: 'wake_word' | 'command';
    instance: any;
    ended: boolean;
  } | null>(null);
  const sessionSequenceRef = useRef(0);
  const currentSessionIdRef = useRef<number>(0);
  const sessionTokenRef = useRef<string>('');
  const finalizedSessionTokenRef = useRef<string>('');
  const isCommandFinalizedRef = useRef<boolean>(false);

  // Timers
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeToCommandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session state tracking
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const isStartingRef = useRef(false);
  const isExplicitStopRef = useRef(false);
  const hasDispatchedRef = useRef(false);
  const pendingFinalDirectiveRef = useRef<string>('');
  const sessionResultCountRef = useRef(0);
  const sessionHadAudioStartRef = useRef(false);

  // Wake-word backoff & permission tracking refs
  const wakeWordRetryCountRef = useRef<number>(0);
  const lastWakeErrorRef = useRef<string | null>(null);
  const isMicPermissionCheckingRef = useRef<boolean>(false);
  const micAccessGrantedRef = useRef<boolean>(false);
  const wakeRecognizerRef = useRef<any>(null);
  // Keep a short rolling FINAL-result buffer so a wake phrase split across
  // recognition result events (e.g. "hey" -> "jarvis") can still be detected.
  const wakeTranscriptBufferRef = useRef<string>('');

  // Cross-session triggers to guarantee mutual exclusivity without circular callbacks
  const startWakeWordSessionRef = useRef<() => void>(() => {});
  const startCommandSessionRef = useRef<() => void>(() => {});

  // Fallback MediaRecorder state references
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animTimerRef = useRef<number | null>(null);

  // Logger helper to push to diagnostic logs
  const logEvent = useCallback(
    (
      eventName: keyof SpeechDiagnostics['eventCounts'] | string,
      details: string,
      level: 'info' | 'success' | 'warn' | 'error' = 'info',
      exactErrorValue?: string
    ) => {
      const time = getFormattedTime();
      const id = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      setDiagnostics(prev => {
        const nextCounts = { ...prev.eventCounts };
        if (eventName in nextCounts) {
          nextCounts[eventName as keyof typeof nextCounts] =
            (nextCounts[eventName as keyof typeof nextCounts] || 0) + 1;
        }

        const newLog: DiagnosticEventLog = {
          id,
          time,
          event: eventName,
          details,
          level,
        };

        return {
          ...prev,
          lastEvent: eventName,
          lastEventTimestamp: time,
          exactError: exactErrorValue !== undefined ? exactErrorValue : prev.exactError,
          eventCounts: nextCounts,
          eventLogs: [newLog, ...prev.eventLogs.slice(0, 49)], // Keep latest 50 logs
        };
      });
    },
    []
  );

  // Query microphone permission state on mount
  useEffect(() => {
    const SpeechClass = getSpeechRecognitionClass();
    if (!SpeechClass) {
      setIsSupported(false);
      setDiagnostics(prev => ({
        ...prev,
        isWebSpeechUnavailable: true,
        unavailableReason: 'Speech recognition constructor not supported in this browser.',
      }));
    }

    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then(status => {
          if (status.state === 'granted') {
            micAccessGrantedRef.current = true;
          }
          setDiagnostics(prev => ({
            ...prev,
            micPermission: status.state as any,
          }));
          status.onchange = () => {
            if (status.state === 'granted') {
              micAccessGrantedRef.current = true;
            } else if (status.state === 'denied') {
              micAccessGrantedRef.current = false;
            }
            setDiagnostics(prev => ({
              ...prev,
              micPermission: status.state as any,
            }));
          };
        })
        .catch(() => {
          setDiagnostics(prev => ({ ...prev, micPermission: 'query_unsupported' }));
        });
    } else {
      setDiagnostics(prev => ({ ...prev, micPermission: 'query_unsupported' }));
    }
  }, []);

  // Safe visualizer stop
  const stopAudioTelemetry = useCallback(() => {
    if (animTimerRef.current !== null) {
      window.clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      } catch {}
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Lightweight procedural audio visualizer for WebSpeech (avoids mic hardware contention)
  const startProceduralAudioPulse = useCallback(() => {
    let phase = 0;
    const pulse = () => {
      if (!isListeningRef.current) return;
      phase += 0.25;
      const wave = 0.35 + Math.sin(phase) * 0.25 + Math.sin(phase * 2.1) * 0.15;
      setAudioLevel(Math.max(0.15, Math.min(0.9, wave)));
      animTimerRef.current = window.setTimeout(pulse, 85);
    };
    pulse();
  }, []);

  // Helper to emit pipeline state transition and record telemetry
  const emitPipelineTransition = useCallback(
    (from: JarvisPipelineStatus, to: JarvisPipelineStatus, reason?: string) => {
      pipelineStatusRef.current = to;
      setPipelineStatus(to);

      const logMsg = `[TELEMETRY] Pipeline: ${from} → ${to}${reason ? ` (${reason})` : ''}`;
      console.log(logMsg);

      logEvent(
        'telemetry',
        `${from} → ${to}${reason ? ` — ${reason}` : ''}`,
        to === 'WAKE_DETECTED' || to === 'WAKE DETECTED'
          ? 'success'
          : to === 'PROCESSING'
          ? 'warn'
          : 'info'
      );

      onPipelineTransitionRef.current?.(from, to, reason);
    },
    [logEvent]
  );

  // Android native speech service events (foreground-service bridge).
  useEffect(() => {
    const native = getNativeJarvisBridge();
    if (!native) return;
    return native.onEvent(event => {
      if (event.type === 'wake') {
        setIsWakeWordStandby(false);
        setIsListening(true);
        isListeningRef.current = true;
        commandListeningActiveRef.current = true;
        setCommandListeningActive(true);
        setInterimTranscript('Listening...');
        emitPipelineTransition('STANDBY', 'WAKE_DETECTED', 'Native Android wake word detected');
        onWakeWordDetectedRef.current?.('');
        onCommandListeningStartRef.current?.();
        emitPipelineTransition('WAKE_DETECTED', 'LISTENING', 'Native Android command channel open');
      } else if (event.type === 'partial') {
        setInterimTranscript(event.text);
      } else if (event.type === 'command') {
        const clean = cleanTranscriptRepetitions(event.text);
        if (!clean) return;
        setTranscript(clean);
        setInterimTranscript('');
        setIsListening(false);
        isListeningRef.current = false;
        setCommandListeningActive(false);
        commandListeningActiveRef.current = false;
        emitPipelineTransition('LISTENING', 'PROCESSING', `Native command finalized: "${clean}"`);
        onFinalTranscriptRef.current?.(clean);
      } else if (event.type === 'error') {
        setError(event.text);
        setIsListening(false);
        isListeningRef.current = false;
        setCommandListeningActive(false);
        commandListeningActiveRef.current = false;
      }
    });
  }, [emitPipelineTransition]);

  // Terminate any active recognition session safely to guarantee mutual exclusivity
  const terminateActiveSession = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (wakeToCommandTimerRef.current) {
      clearTimeout(wakeToCommandTimerRef.current);
      wakeToCommandTimerRef.current = null;
    }
    if (commandTimeoutRef.current) {
      clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = null;
    }
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    sessionTokenRef.current = '';
    commandListeningActiveRef.current = false;
    setCommandListeningActive(false);

    const current = currentSessionRef.current;
    if (current) {
      current.ended = true;
      try {
        const inst = current.instance;
        inst.onstart = null;
        inst.onaudiostart = null;
        inst.onsoundstart = null;
        inst.onspeechstart = null;
        inst.onresult = null;
        inst.onspeechend = null;
        inst.onsoundend = null;
        inst.onaudioend = null;
        inst.onerror = null;
        inst.onend = null;
        inst.abort();
      } catch {}
      currentSessionRef.current = null;
    }

    if (wakeRecognizerRef.current) {
      try {
        const inst = wakeRecognizerRef.current;
        inst.onstart = null;
        inst.onaudiostart = null;
        inst.onsoundstart = null;
        inst.onspeechstart = null;
        inst.onresult = null;
        inst.onspeechend = null;
        inst.onsoundend = null;
        inst.onaudioend = null;
        inst.onerror = null;
        inst.onend = null;
        inst.abort();
      } catch {}
      wakeRecognizerRef.current = null;
    }
  }, []);

  // Explicitly request microphone permission before launching wake-word recognition (ONLY ONCE)
  const ensureMicrophonePermission = useCallback(async (): Promise<boolean> => {
    // Reuse granted state if already confirmed in this session
    if (micAccessGrantedRef.current) {
      return true;
    }

    logEvent('telemetry', 'MIC_PERMISSION_INITIAL_CHECK: Verifying microphone hardware permission once...', 'info');

    // Query navigator.permissions.query({name:'microphone'}) where supported
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (status.state === 'granted') {
          micAccessGrantedRef.current = true;
          setDiagnostics(prev => ({
            ...prev,
            micPermission: 'granted',
            isWebSpeechUnavailable: false,
            unavailableReason: null,
          }));
          logEvent('telemetry', 'MIC_PERMISSION_GRANTED: Permission confirmed via permissions API', 'success');
          return true;
        }
      } catch {
        // Query unsupported or rejected in this browser; continue to getUserMedia
      }
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const reason = 'Microphone API (navigator.mediaDevices.getUserMedia) not supported in this browser.';
      setError(reason);
      setDiagnostics(prev => ({
        ...prev,
        micPermission: 'denied',
        isWebSpeechUnavailable: true,
        unavailableReason: reason,
      }));
      logEvent('error', reason, 'error', 'getUserMedia unsupported');
      logEvent('telemetry', 'MIC_PERMISSION_DENIED: getUserMedia API unsupported', 'error', 'unsupported');
      return false;
    }

    try {
      isMicPermissionCheckingRef.current = true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop audio tracks to release microphone hardware for Web Speech API engine
      stream.getTracks().forEach(t => t.stop());
      await new Promise(r => setTimeout(r, 150));
      isMicPermissionCheckingRef.current = false;
      micAccessGrantedRef.current = true;
      setDiagnostics(prev => ({
        ...prev,
        micPermission: 'granted',
        isWebSpeechUnavailable: false,
        unavailableReason: null,
        exactError: null,
      }));
      logEvent('telemetry', 'MIC_PERMISSION_GRANTED: Microphone access verified and granted', 'success');
      return true;
    } catch (err: any) {
      isMicPermissionCheckingRef.current = false;
      const errName = err?.name || '';
      const isDenied =
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        err?.message?.includes('Permission');

      // Treat NotAllowedError from getUserMedia() as a true microphone permission denial ONLY when getUserMedia() rejects
      if (isDenied) {
        micAccessGrantedRef.current = false;
        const errMessage =
          'Microphone permission denied. Please allow microphone access in your browser settings to enable wake-word monitoring.';
        setError(errMessage);
        setDiagnostics(prev => ({
          ...prev,
          micPermission: 'denied',
          exactError: 'not-allowed',
          isWebSpeechUnavailable: true,
          unavailableReason: errMessage,
        }));
        logEvent(
          'telemetry',
          `MIC_PERMISSION_DENIED: Microphone access DENIED (${errName || 'NotAllowedError'})`,
          'error',
          'not-allowed'
        );
        return false;
      }

      // If not denied (e.g. device in use or NotFoundError), log warning but do not mark permanently denied
      logEvent('telemetry', `MIC_PERMISSION_CHECK: Hardware access warning (${errName || 'Error'})`, 'warn', errName);
      return false;
    }
  }, [logEvent]);

  // --- SESSION 1: AMBIENT WAKE-WORD MONITOR (Listens exclusively for "Hey JARVIS") ---
  const startWakeWordSession = useCallback(async () => {
    if (!wakeWordEnabledRef.current) return;

    // Do not start wake recognition while command recognition, processing, or speaking is active
    if (
      commandListeningActiveRef.current ||
      currentSessionRef.current?.type === 'command' ||
      pipelineStatusRef.current === 'LISTENING' ||
      pipelineStatusRef.current === 'PROCESSING' ||
      pipelineStatusRef.current === 'SPEAKING' ||
      isSpeakingRef.current
    ) {
      logEvent('telemetry', 'WAKE_MONITOR bypassed: Command or assistant output is currently active', 'info');
      return;
    }

    // Ensure SpeechRecognition constructor is available
    const SpeechClass = getSpeechRecognitionClass();
    if (!SpeechClass) {
      setIsSupported(false);
      setError('Speech Recognition unavailable in this browser/Preview');
      setDiagnostics(prev => ({
        ...prev,
        isWebSpeechUnavailable: true,
        unavailableReason: 'SpeechRecognition API constructor not found in window.',
      }));
      logEvent('error', 'SpeechRecognition class not available', 'error', 'Constructor missing');
      return;
    }

    // 1. Perform microphone permission acquisition/check ONLY when WAKE WORD MODE is initially enabled or not yet granted
    // 2. Once microphone access has been successfully granted, reuse micAccessGrantedRef.current
    // 5. If microphone permission is already granted, reuse that state and don't repeatedly call getUserMedia
    // 6. Never request microphone permission repeatedly during every wake recognition restart
    if (!micAccessGrantedRef.current) {
      const hasMicPermission = await ensureMicrophonePermission();
      if (!hasMicPermission || !wakeWordEnabledRef.current) {
        return;
      }
    }

    // Secondary check to ensure command recognition or speaking hasn't started during permission request
    if (
      commandListeningActiveRef.current ||
      currentSessionRef.current?.type === 'command' ||
      pipelineStatusRef.current === 'LISTENING' ||
      pipelineStatusRef.current === 'PROCESSING' ||
      pipelineStatusRef.current === 'SPEAKING' ||
      isSpeakingRef.current ||
      !wakeWordEnabledRef.current
    ) {
      return;
    }

    // 7. Ensure only ONE wake recognition instance exists and manage its lifecycle
    terminateActiveSession();

    // 11. Use a recognition session ID/token so stale callbacks cannot restart old sessions
    const sessionId = ++sessionSequenceRef.current;
    const sessionToken = `wake_${sessionId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    sessionTokenRef.current = sessionToken;

    setError(null);
    hasDispatchedRef.current = false;
    isExplicitStopRef.current = false;
    isWakeWordStandbyRef.current = true;
    setIsWakeWordStandby(true);
    wakeTranscriptBufferRef.current = '';
    // 13. Wake-word monitoring must remain silent and must NOT trigger listening indicators
    isListeningRef.current = false;
    setIsListening(false);
    commandListeningActiveRef.current = false;
    setCommandListeningActive(false);

    try {
      const recognition = new SpeechClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      currentSessionRef.current = {
        id: sessionId,
        token: sessionToken,
        type: 'wake_word',
        instance: recognition,
        ended: false,
      };
      recognitionRef.current = recognition;
      wakeRecognizerRef.current = recognition;

      // Telemetry: WAKE_MONITOR_STARTED and WAKE_RECOGNITION_STARTED
      logEvent('telemetry', 'WAKE_MONITOR_STARTED: Listening for "Hey JARVIS"', 'info');
      logEvent('telemetry', 'WAKE_RECOGNITION_STARTED: Ambient Web Speech recognizer active [lang: en-US]', 'info');

      recognition.onstart = () => {
        if (sessionTokenRef.current !== sessionToken || currentSessionRef.current?.ended) return;
        isStartingRef.current = false;
        // Silent ambient standby
        isListeningRef.current = false;
        setIsListening(false);
        commandListeningActiveRef.current = false;
        setCommandListeningActive(false);
        setError(null);
        lastWakeErrorRef.current = null;
        wakeWordRetryCountRef.current = 0;
        setDiagnostics(prev => ({
          ...prev,
          exactError: null,
          isWebSpeechUnavailable: false,
          unavailableReason: null,
        }));
        logEvent('onstart', 'Wake-word monitor active in STANDBY (silent) — listening for "Hey JARVIS" [lang: en-US]', 'info');
      };

      // Rule 13: AUDIO_START
      recognition.onaudiostart = () => {
        if (sessionTokenRef.current !== sessionToken || currentSessionRef.current?.ended) return;
        lastWakeErrorRef.current = null;
        wakeWordRetryCountRef.current = 0;
        setDiagnostics(prev => ({
          ...prev,
          exactError: null,
        }));
        logEvent('onaudiostart', 'Microphone audio capture hardware started [AUDIO_START]', 'info');
        logEvent('telemetry', 'AUDIO_START: Hardware microphone streaming to wake engine', 'success');
      };

      recognition.onsoundstart = () => {
        if (sessionTokenRef.current !== sessionToken || currentSessionRef.current?.ended) return;
        logEvent('onsoundstart', 'Acoustic sound sensed on wake input channel', 'info');
      };

      recognition.onspeechstart = () => {
        if (sessionTokenRef.current !== sessionToken || currentSessionRef.current?.ended) return;
        logEvent('onspeechstart', 'Human speech pattern sensed in ambient audio', 'info');
      };

      recognition.onspeechend = () => {
        if (sessionTokenRef.current !== sessionToken || currentSessionRef.current?.ended) return;
        logEvent('onspeechend', 'Speech vocalization paused in ambient audio', 'info');
      };

      recognition.onsoundend = () => {
        if (sessionTokenRef.current !== sessionToken || currentSessionRef.current?.ended) return;
        logEvent('onsoundend', 'Acoustic sound wave finished', 'info');
      };

      recognition.onaudioend = () => {
        if (sessionTokenRef.current !== sessionToken || currentSessionRef.current?.ended) return;
        logEvent('onaudioend', 'Hardware microphone audio capture cycle halted', 'info');
      };

      recognition.onerror = (event: any) => {
        if (sessionTokenRef.current !== sessionToken || currentSessionRef.current?.ended) return;
        const errCode = event.error || 'unknown_error';
        if (errCode === 'no-speech' || errCode === 'aborted') {
          // Normal background lifecycle; not an error
          return;
        }

        lastWakeErrorRef.current = errCode;

        // 2. Do NOT infer microphone permission denial merely from a Web Speech onerror event.
        // 3. Do NOT overwrite a previously confirmed microphone permission state with denied unless a real permission API result or actual getUserMedia rejection confirms it.
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          wakeWordRetryCountRef.current = (wakeWordRetryCountRef.current || 0) + 1;
          const retries = wakeWordRetryCountRef.current;

          if (!micAccessGrantedRef.current) {
            setDiagnostics(prev => ({
              ...prev,
              micPermission: 'denied',
              exactError: errCode,
            }));
            logEvent('onerror', `Microphone access denied: ${errCode}`, 'warn', errCode);
            logEvent('telemetry', `MIC_PERMISSION_DENIED: ${errCode}`, 'warn', errCode);
            return;
          }

          // Microphone permission is already granted; this is browser audio engine contention
          // Throttled logging to avoid spamming the diagnostics log
          if (retries === 1 || retries === 3) {
            logEvent('onerror', `Web Speech audio engine contention (${errCode}), retry #${retries}`, 'warn', errCode);
            logEvent('telemetry', `WAKE_RECOGNITION_NOTICE: Engine contention (${errCode}), retry #${retries}`, 'warn', errCode);
          }
          return;
        }

        // Network error handling with backoff
        if (errCode === 'network') {
          wakeWordRetryCountRef.current = (wakeWordRetryCountRef.current || 0) + 1;
          const retries = wakeWordRetryCountRef.current;
          if (retries === 1 || retries === 3) {
            logEvent('onerror', `Web Speech cloud network notice (attempt #${retries})`, 'warn', 'network');
            logEvent('telemetry', `WAKE_RECOGNITION_NOTICE: Speech cloud socket dropped (attempt #${retries})`, 'warn', 'network');
          }
          return;
        }

        wakeWordRetryCountRef.current = (wakeWordRetryCountRef.current || 0) + 1;
        logEvent('onerror', `Wake-word monitor event: ${errCode}`, 'warn', errCode);
        logEvent('telemetry', `WAKE_RECOGNITION_ERROR: ${errCode}`, 'warn', errCode);
      };

      recognition.onend = () => {
        if (sessionTokenRef.current !== sessionToken || currentSessionRef.current?.ended) return;
        currentSessionRef.current = null;
        isListeningRef.current = false;
        logEvent('onend', 'Wake-word recognition stream cycle ended', 'info');

        // Check if wake mode is still enabled and should restart
        if (
          !wakeWordEnabledRef.current ||
          isExplicitStopRef.current ||
          pipelineStatusRef.current !== 'STANDBY' ||
          commandListeningActiveRef.current ||
          isSpeakingRef.current
        ) {
          return;
        }

        // If mic is explicitly denied via getUserMedia, do NOT restart
        if (!micAccessGrantedRef.current && lastWakeErrorRef.current === 'not-allowed') {
          logEvent('telemetry', 'WAKE_MONITOR_STOPPED: Microphone permission required', 'warn');
          return;
        }

        const currentRetries = wakeWordRetryCountRef.current || 0;
        const lastErr = lastWakeErrorRef.current;

        // If error occurred and exceeded max consecutive retries (3 retries):
        // Pause the ambient loop to prevent battery/network drain and log flooding
        if (lastErr && currentRetries > 3) {
          logEvent(
            'telemetry',
            `WAKE_MONITOR_PAUSED: Reached retry limit for [${lastErr}]. Ambient loop resting; push-to-talk core active.`,
            'warn'
          );
          restartTimeoutRef.current = setTimeout(() => {
            if (
              wakeWordEnabledRef.current &&
              pipelineStatusRef.current === 'STANDBY' &&
              !isExplicitStopRef.current &&
              !commandListeningActiveRef.current &&
              !isSpeakingRef.current
            ) {
              wakeWordRetryCountRef.current = 1;
              startWakeWordSessionRef.current();
            }
          }, 15000);
          return;
        }

        // Controlled delay calculation:
        // Normal cycle (no error): 400ms buffer
        // 'not-allowed' / 'service-not-allowed': 2500ms, 4500ms, 8100ms
        // 'network': 3000ms, 5400ms, 9700ms
        let delay = 400;
        if (lastErr === 'not-allowed' || lastErr === 'service-not-allowed') {
          delay = Math.min(2500 * Math.pow(1.8, Math.max(0, currentRetries - 1)), 15000);
        } else if (lastErr === 'network') {
          delay = Math.min(3000 * Math.pow(1.8, Math.max(0, currentRetries - 1)), 20000);
        } else if (lastErr) {
          delay = 2000;
        }

        logEvent(
          'telemetry',
          `WAKE_MONITOR_RESTART_SCHEDULED: Next ambient cycle in ${Math.round(delay)}ms${lastErr ? ` (recovering from ${lastErr})` : ''}`,
          'info'
        );

        restartTimeoutRef.current = setTimeout(() => {
          if (
            wakeWordEnabledRef.current &&
            pipelineStatusRef.current === 'STANDBY' &&
            !isExplicitStopRef.current &&
            !commandListeningActiveRef.current &&
            !isSpeakingRef.current
          ) {
            startWakeWordSessionRef.current();
          }
        }, delay);
      };

      // Rule 12: Only transition to command LISTENING after an actual Hey JARVIS result is received
      // Rule 13: Detailed telemetry RESULT
      recognition.onresult = (event: any) => {
        if (
          sessionTokenRef.current !== sessionToken ||
          currentSessionRef.current?.ended ||
          isSpeakingRef.current ||
          Date.now() - speechEndTimeRef.current < 600
        ) {
          return;
        }

        let compositeText = '';
        let hasFinalResult = false;
        const resultsLen = event.results?.length || 0;
        for (let i = event.resultIndex || 0; i < resultsLen; ++i) {
          const result = event.results[i];
          const text = result?.[0]?.transcript || '';
          compositeText += text;
          if (result?.isFinal) hasFinalResult = true;
        }
        compositeText = compositeText.trim();
        if (!compositeText) return;

        logEvent('onresult', `Wake monitor recognized ${hasFinalResult ? 'final' : 'interim'} audio: "${compositeText}"`, 'info');
        logEvent('telemetry', `RESULT: Sensed phrase: "${compositeText}"`, 'info');

        // Do not fire the wake transition from an interim result. Android/Web
        // Speech can revise interim text, and triggering there can cut off
        // the phrase before the engine has actually heard "JARVIS".
        if (!hasFinalResult) return;

        const finalWakeText = cleanTranscriptRepetitions(compositeText);
        wakeTranscriptBufferRef.current = cleanTranscriptRepetitions(
          `${wakeTranscriptBufferRef.current} ${finalWakeText}`
        )
          .split(' ')
          .slice(-12)
          .join(' ');

        const wakeCheck = detectWakeWordPhrase(wakeTranscriptBufferRef.current);
        if (wakeCheck.detected) {
          // Telemetry: WAKE_WORD_DETECTED
          logEvent('telemetry', `WAKE_WORD_DETECTED: Recognized "${compositeText}"`, 'success');

          wakeTranscriptBufferRef.current = '';
          terminateActiveSession();
          isListeningRef.current = false;
          setIsListening(false);
          commandListeningActiveRef.current = false;
          setCommandListeningActive(false);
          isWakeWordStandbyRef.current = false;
          setIsWakeWordStandby(false);
          wakeWordRetryCountRef.current = 0;
          lastWakeErrorRef.current = null;

          emitPipelineTransition(
            'STANDBY',
            'WAKE_DETECTED',
            `Genuine wake phrase recognized: "${compositeText}"`
          );

          onWakeWordDetectedRef.current?.(wakeCheck.trailingText);

          const trailing = cleanTranscriptRepetitions(wakeCheck.trailingText).trim();
          if (trailing.length > 2) {
            wakeToCommandTimerRef.current = setTimeout(() => {
              emitPipelineTransition(
                'WAKE_DETECTED',
                'LISTENING',
                `Directive extracted from trailing speech: "${trailing}"`
              );
              onCommandListeningStartRef.current?.();
              setTranscript(trailing);

              wakeToCommandTimerRef.current = setTimeout(() => {
                emitPipelineTransition('LISTENING', 'PROCESSING', `Direct dispatch: "${trailing}"`);
                onFinalTranscriptRef.current?.(trailing);
              }, 400);
            }, 300);
          } else {
            wakeToCommandTimerRef.current = setTimeout(() => {
              emitPipelineTransition(
                'WAKE_DETECTED',
                'LISTENING',
                'Starting command-listening recognition session'
              );
              onCommandListeningStartRef.current?.();
              startCommandSessionRef.current();
            }, 550);
          }
        }
      };

      recognitionRef.current = recognition;
      isStartingRef.current = true;
      recognition.start();
    } catch (err: any) {
      logEvent('error', `Failed starting wake-word monitor: ${err?.message}`, 'warn', err?.message);
      logEvent('telemetry', `WAKE_ENGINE_START → ERROR(${err?.name || 'Exception'}) → RETRY_BACKOFF`, 'warn', err?.message);
    }
  }, [terminateActiveSession, ensureMicrophonePermission, logEvent, emitPipelineTransition]);

  // --- SESSION 2: COMMAND-LISTENING RECOGNITION (Records user's directive sentence) ---
  const startCommandSession = useCallback(() => {
    // Cleanly terminate wake-word monitor first so they never run concurrently
    terminateActiveSession();

    const sessionId = ++sessionSequenceRef.current;
    currentSessionIdRef.current = sessionId;
    const sessionToken = `cmd_${sessionId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    sessionTokenRef.current = sessionToken;
    isCommandFinalizedRef.current = false;
    finalizedSessionTokenRef.current = '';

    const SpeechClass = getSpeechRecognitionClass();
    if (!SpeechClass) {
      setIsSupported(false);
      setError('Speech Recognition unavailable in this browser/Preview');
      return;
    }

    setError(null);
    setTranscript('');
    setInterimTranscript('');
    pendingFinalDirectiveRef.current = '';
    hasDispatchedRef.current = false;
    isExplicitStopRef.current = false;
    isWakeWordStandbyRef.current = false;
    setIsWakeWordStandby(false);
    isListeningRef.current = true;
    setIsListening(true);
    commandListeningActiveRef.current = true;
    setCommandListeningActive(true);
    startProceduralAudioPulse();

    // Command inactivity timeout: if no speech within 7.5s, return to STANDBY
    commandTimeoutRef.current = setTimeout(() => {
      if (
        sessionTokenRef.current === sessionToken &&
        currentSessionIdRef.current === sessionId &&
        !hasDispatchedRef.current &&
        !isCommandFinalizedRef.current
      ) {
        logEvent('telemetry', 'Command recognition timed out without speech', 'warn');
        terminateActiveSession();
        setIsListening(false);
        isListeningRef.current = false;
        stopAudioTelemetry();
        emitPipelineTransition('LISTENING', 'STANDBY', 'Command listening timed out with silence');
        logEvent('telemetry', 'STANDBY ENTERED', 'info');
        if (wakeWordEnabledRef.current) {
          restartTimeoutRef.current = setTimeout(() => {
            if (wakeWordEnabledRef.current && pipelineStatusRef.current === 'STANDBY') {
              startWakeWordSessionRef.current();
            }
          }, 350);
        }
      }
    }, 7500);

    setTimeout(() => {
      if (sessionTokenRef.current !== sessionToken || currentSessionIdRef.current !== sessionId) return;

      try {
        const recognition = new SpeechClass();
        // Continuous = false for individual commands to prevent engine compounding loops
        recognition.continuous = false;
        // interimResults = true to display interim stream separately
        recognition.interimResults = true;
        // en-US as primary language
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        currentSessionRef.current = {
          id: sessionId,
          token: sessionToken,
          type: 'command',
          instance: recognition,
          ended: false,
        };

        recognition.onstart = () => {
          if (
            sessionTokenRef.current !== sessionToken ||
            currentSessionIdRef.current !== sessionId ||
            currentSessionRef.current?.ended ||
            isCommandFinalizedRef.current
          ) {
            return;
          }
          isStartingRef.current = false;
          isListeningRef.current = true;
          setIsListening(true);
          commandListeningActiveRef.current = true;
          setCommandListeningActive(true);
          setError(null);
          setDiagnostics(prev => ({
            ...prev,
            exactError: null,
            isWebSpeechUnavailable: false,
            unavailableReason: null,
          }));
          logEvent('onstart', 'Command recognition active [lang: en-US, continuous: false] — recording directive', 'success');
          // Telemetry: COMMAND_LISTENING_STARTED
          logEvent('telemetry', 'COMMAND_LISTENING_STARTED: Listening for user directive', 'success');
        };

        recognition.onaudiostart = () => {
          if (
            sessionTokenRef.current !== sessionToken ||
            currentSessionIdRef.current !== sessionId ||
            currentSessionRef.current?.ended
          ) {
            return;
          }
          setDiagnostics(prev => ({
            ...prev,
            exactError: null,
          }));
          logEvent('onaudiostart', 'Microphone audio capture hardware started [AUDIO_START]', 'info');
          logEvent('telemetry', 'AUDIO_START: Command recording microphone active', 'success');
        };

        recognition.onsoundstart = () => {
          if (
            sessionTokenRef.current !== sessionToken ||
            currentSessionIdRef.current !== sessionId ||
            currentSessionRef.current?.ended
          ) {
            return;
          }
          logEvent('onsoundstart', 'Sound energy detected on command channel', 'info');
        };

        recognition.onspeechstart = () => {
          if (
            sessionTokenRef.current !== sessionToken ||
            currentSessionIdRef.current !== sessionId ||
            currentSessionRef.current?.ended ||
            isCommandFinalizedRef.current
          ) {
            return;
          }
          logEvent('onspeechstart', 'User speech utterance detected', 'info');
          if (commandTimeoutRef.current) {
            clearTimeout(commandTimeoutRef.current);
            commandTimeoutRef.current = null;
          }
        };

        recognition.onspeechend = () => {
          if (
            sessionTokenRef.current !== sessionToken ||
            currentSessionIdRef.current !== sessionId ||
            currentSessionRef.current?.ended
          ) {
            return;
          }
          logEvent('onspeechend', 'Speech vocalization concluded', 'info');
        };

        recognition.onsoundend = () => {
          if (
            sessionTokenRef.current !== sessionToken ||
            currentSessionIdRef.current !== sessionId ||
            currentSessionRef.current?.ended
          ) {
            return;
          }
          logEvent('onsoundend', 'Sound wave finished', 'info');
        };

        recognition.onaudioend = () => {
          if (
            sessionTokenRef.current !== sessionToken ||
            currentSessionIdRef.current !== sessionId ||
            currentSessionRef.current?.ended
          ) {
            return;
          }
          logEvent('onaudioend', 'Hardware audio input closed for command session', 'info');
        };

        recognition.onresult = (event: any) => {
          // Ignore any callbacks if session token or ID mismatch, or if already finalized
          if (
            sessionTokenRef.current !== sessionToken ||
            currentSessionIdRef.current !== sessionId ||
            currentSessionRef.current?.ended ||
            isCommandFinalizedRef.current ||
            finalizedSessionTokenRef.current === sessionToken
          ) {
            return;
          }

          let finalChunk = '';
          let interimChunk = '';
          let totalConfidence = 0;
          let confidenceCount = 0;
          const resultsLen = event.results?.length || 0;

          // Parse results cleanly: isolate final from interim to prevent duplicate appending
          for (let i = 0; i < resultsLen; ++i) {
            const res = event.results[i];
            if (!res || !res[0]) continue;
            const text = res[0].transcript || '';
            if (res[0].confidence !== undefined && res[0].confidence > 0) {
              totalConfidence += res[0].confidence;
              confidenceCount++;
            }
            if (res.isFinal) {
              finalChunk += (finalChunk ? ' ' : '') + text;
            } else {
              interimChunk += (interimChunk ? ' ' : '') + text;
            }
          }

          finalChunk = finalChunk.trim();
          interimChunk = interimChunk.trim();

          const confidenceScore = confidenceCount > 0
            ? Number((totalConfidence / confidenceCount).toFixed(2))
            : (finalChunk ? 0.96 : null);

          // Update telemetry diagnostics showing INTERIM, FINAL, confidence score, and detected language
          setDiagnostics(prev => ({
            ...prev,
            lastInterim: interimChunk,
            lastFinal: finalChunk,
            confidenceScore,
            detectedLanguage: 'en-US',
          }));

          // Display interim transcript separately from final command
          if (interimChunk) {
            setInterimTranscript(interimChunk);
          } else if (finalChunk) {
            setInterimTranscript('');
          }

          // Once a FINAL transcript is received, immediately finalize command session
          if (finalChunk) {
            const deduplicatedFinal = cleanTranscriptRepetitions(finalChunk);
            const cleanDirective = deduplicatedFinal
              .replace(/\b(?:hey|ok|okay|hi|hello)?[,\s]*\bjarvis\b/gi, '')
              .replace(/^[,.:;!?-]+\s*/, '')
              .trim();

            if (cleanDirective) {
              // 1. Immediately mark the command session as FINALIZED
              isCommandFinalizedRef.current = true;
              finalizedSessionTokenRef.current = sessionToken;
              hasDispatchedRef.current = true;
              setTranscript(cleanDirective);
              setInterimTranscript('');

              // 2. Cancel all pending timers when a final result is received
              if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
              }
              if (commandTimeoutRef.current) {
                clearTimeout(commandTimeoutRef.current);
                commandTimeoutRef.current = null;
              }
              if (restartTimeoutRef.current) {
                clearTimeout(restartTimeoutRef.current);
                restartTimeoutRef.current = null;
              }
              if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
              }
              if (wakeToCommandTimerRef.current) {
                clearTimeout(wakeToCommandTimerRef.current);
                wakeToCommandTimerRef.current = null;
              }

              // Telemetry: COMMAND_FINALIZED
              logEvent('telemetry', `COMMAND_FINALIZED: "${cleanDirective}"`, 'success');

              // 3. Stop the command SpeechRecognition instance immediately
              try {
                if (typeof recognition.abort === 'function') {
                  recognition.abort();
                } else if (typeof recognition.stop === 'function') {
                  recognition.stop();
                }
              } catch {}

              terminateActiveSession();
              setIsListening(false);
              isListeningRef.current = false;
              stopAudioTelemetry();

              // Telemetry: COMMAND RECOGNITION STOPPED
              logEvent('telemetry', 'COMMAND RECOGNITION STOPPED', 'info');

              // 4. Do NOT transition back to LISTENING. Transition directly: LISTENING -> PROCESSING
              emitPipelineTransition('LISTENING', 'PROCESSING', `Final command confirmed: "${cleanDirective}"`);

              // Telemetry: PROCESSING_STARTED
              logEvent('telemetry', 'PROCESSING_STARTED', 'info');

              // 5. Submit command
              onFinalTranscriptRef.current?.(cleanDirective);
              return;
            }
          }
        };

        recognition.onerror = (event: any) => {
          if (
            sessionTokenRef.current !== sessionToken ||
            currentSessionIdRef.current !== sessionId ||
            currentSessionRef.current?.ended ||
            isCommandFinalizedRef.current ||
            finalizedSessionTokenRef.current === sessionToken
          ) {
            return;
          }
          const errCode = event.error || 'unknown_error';
          if (errCode === 'no-speech' || errCode === 'aborted') return;
          logEvent('onerror', `Command recognition error: ${errCode}`, 'warn', errCode);

          if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
            if (!micAccessGrantedRef.current) {
              const permMsg = 'Microphone permission denied. Please allow microphone access in your browser settings to command JARVIS.';
              setError(permMsg);
              setDiagnostics(prev => ({
                ...prev,
                micPermission: 'denied',
                exactError: errCode,
                isWebSpeechUnavailable: true,
                unavailableReason: permMsg,
              }));
              logEvent('telemetry', `COMMAND_ERROR: ${errCode} — Microphone permission denied`, 'warn', errCode);
            } else {
              setDiagnostics(prev => ({
                ...prev,
                exactError: errCode,
              }));
              logEvent('telemetry', `COMMAND_NOTICE: ${errCode} — Audio hardware contention notice`, 'warn', errCode);
            }
          } else if (errCode === 'network') {
            setDiagnostics(prev => ({
              ...prev,
              exactError: 'network',
            }));
            logEvent('telemetry', `COMMAND_NOTICE: ${errCode} — Speech cloud socket notice`, 'warn', errCode);
          } else {
            setDiagnostics(prev => ({
              ...prev,
              exactError: errCode,
            }));
            logEvent('telemetry', `COMMAND_ERROR: ${errCode}`, 'warn', errCode);
          }
        };

        recognition.onend = () => {
          // Ignore any subsequent onend, onresult, or restart callbacks belonging to that command session
          if (
            sessionTokenRef.current !== sessionToken ||
            currentSessionIdRef.current !== sessionId ||
            currentSessionRef.current?.ended ||
            isCommandFinalizedRef.current ||
            finalizedSessionTokenRef.current === sessionToken ||
            hasDispatchedRef.current
          ) {
            return;
          }

          // If a pending directive was recorded before onend:
          if (pendingFinalDirectiveRef.current && !hasDispatchedRef.current) {
            const toDispatch = pendingFinalDirectiveRef.current;
            isCommandFinalizedRef.current = true;
            finalizedSessionTokenRef.current = sessionToken;
            hasDispatchedRef.current = true;

            if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
            if (commandTimeoutRef.current) { clearTimeout(commandTimeoutRef.current); commandTimeoutRef.current = null; }
            if (restartTimeoutRef.current) { clearTimeout(restartTimeoutRef.current); restartTimeoutRef.current = null; }

            logEvent('telemetry', `COMMAND_FINALIZED: "${toDispatch}"`, 'success');
            terminateActiveSession();
            setIsListening(false);
            isListeningRef.current = false;
            stopAudioTelemetry();
            logEvent('telemetry', 'COMMAND RECOGNITION STOPPED', 'info');
            emitPipelineTransition('LISTENING', 'PROCESSING', `Final command confirmed on engine completion: "${toDispatch}"`);
            logEvent('telemetry', 'PROCESSING_STARTED', 'info');
            onFinalTranscriptRef.current?.(toDispatch);
            return;
          }

          // If no words were captured at all, return to STANDBY
          terminateActiveSession();
          setIsListening(false);
          isListeningRef.current = false;
          stopAudioTelemetry();
          emitPipelineTransition('LISTENING', 'STANDBY', 'Command session ended with no speech');
          logEvent('telemetry', 'STANDBY ENTERED', 'info');

          // Never automatically restart command recognition from recognition.onend!
          // Only start ambient wake-word session if enabled
          if (wakeWordEnabledRef.current && !isExplicitStopRef.current) {
            restartTimeoutRef.current = setTimeout(() => {
              if (wakeWordEnabledRef.current && pipelineStatusRef.current === 'STANDBY' && !isExplicitStopRef.current && !isListeningRef.current) {
                startWakeWordSessionRef.current();
              }
            }, 400);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err: any) {
        logEvent('error', `Failed starting command recognition: ${err?.message}`, 'warn', err?.message);
      }
    }, 100);
  }, [terminateActiveSession, logEvent, emitPipelineTransition, startProceduralAudioPulse, stopAudioTelemetry]);

  // Keep references synced to avoid circular dependency problems across sessions
  startWakeWordSessionRef.current = startWakeWordSession;
  startCommandSessionRef.current = startCommandSession;

  // --- AUDIO STREAM FALLBACK (MediaRecorder + Gemini Multimodal Audio) ---
  const startFallbackRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    setInterimTranscript('');
    setIsTranscribingFallback(false);
    recordedChunksRef.current = [];
    isExplicitStopRef.current = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Audio recording (navigator.mediaDevices.getUserMedia) is not supported in this browser.';
      setError(msg);
      logEvent('error', msg, 'error', 'getUserMedia unsupported');
      return;
    }

    try {
      logEvent('fallback', 'Requesting microphone via getUserMedia for Audio Stream Fallback', 'info');
      const audioConstraints: MediaTrackConstraints | boolean = preferredInputDeviceIdRef.current
        ? { deviceId: { ideal: preferredInputDeviceIdRef.current } }
        : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      mediaStreamRef.current = stream;

      // Audio analysis for real visualizer waveform
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioContextRef.current = ctx;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyserRef.current = analyser;
          const source = ctx.createMediaStreamSource(stream);
          source.connect(analyser);

          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          let lastUpdate = 0;

          const pollAudio = () => {
            if (!isListeningRef.current) return;
            const now = Date.now();
            if (now - lastUpdate >= 75) {
              lastUpdate = now;
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
              const avg = sum / bufferLength;
              setAudioLevel(Math.max(0.2, Math.min(1, avg / 70)));
            }
            animTimerRef.current = window.setTimeout(pollAudio, 75);
          };
          pollAudio();
        }
      } catch (err) {
        console.warn('Analyser setup error:', err);
      }

      // Configure MediaRecorder
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstart = () => {
        isListeningRef.current = true;
        setIsListening(true);
        commandListeningActiveRef.current = true;
        setCommandListeningActive(true);
        setInterimTranscript('Recording voice directive (Fallback mode)...');
        logEvent('fallback', `MediaRecorder active [MIME: ${mimeType}]`, 'info');
      };

      recorder.onstop = async () => {
        isListeningRef.current = false;
        setIsListening(false);
        commandListeningActiveRef.current = false;
        setCommandListeningActive(false);
        stopAudioTelemetry();

        const chunks = recordedChunksRef.current;
        if (chunks.length === 0) {
          logEvent('fallback', 'Zero audio chunks captured on recorder stop', 'warn');
          setInterimTranscript('');
          return;
        }

        const audioBlob = new Blob(chunks, { type: mimeType });
        logEvent('fallback', `Audio blob finalized: ${audioBlob.size} bytes. Transcribing via Gemini...`, 'info');
        setInterimTranscript('Transcribing audio via Gemini...');
        setIsTranscribingFallback(true);

        try {
          // Convert Blob to base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result as string;

            try {
              const res = await fetch(apiUrl('/api/jarvis/transcribe'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  audioData: base64Audio,
                  mimeType,
                }),
              });

              const data = await res.json();
              setIsTranscribingFallback(false);

              if (data.transcript && data.transcript.trim()) {
                const clean = data.transcript.trim();
                setTranscript(clean);
                setInterimTranscript('');
                logEvent('fallback', `Gemini Transcribed: "${clean}"`, 'success');
                onFinalTranscriptRef.current?.(clean);
              } else {
                setInterimTranscript('');
                logEvent('fallback', 'Gemini returned empty transcript (no speech detected in recording).', 'warn');
                setError('No words detected in audio recording.');
              }
            } catch (postErr: any) {
              setIsTranscribingFallback(false);
              setInterimTranscript('');
              const msg = `Audio transcription server error: ${postErr.message || postErr}`;
              setError(msg);
              logEvent('error', msg, 'error', msg);
            }
          };
        } catch (readErr: any) {
          setIsTranscribingFallback(false);
          setInterimTranscript('');
          const msg = `Failed to process audio recording: ${readErr.message || readErr}`;
          setError(msg);
          logEvent('error', msg, 'error', msg);
        }
      };

      recorder.start(250); // Slice chunks every 250ms
    } catch (micErr: any) {
      isListeningRef.current = false;
      setIsListening(false);
      stopAudioTelemetry();
      const msg = `Microphone access error for Audio Stream Fallback: ${micErr.message || micErr}`;
      setError(msg);
      logEvent('error', msg, 'error', msg);
    }
  }, [logEvent, stopAudioTelemetry]);

  // React to wakeWordEnabled changes: manage wake-word standby loop
  useEffect(() => {
    wakeWordEnabledRef.current = wakeWordEnabled;
    if (wakeWordEnabled) {
      wakeWordRetryCountRef.current = 0;
      lastWakeErrorRef.current = null;
      isExplicitStopRef.current = false;
      isWakeWordStandbyRef.current = true;
      setIsWakeWordStandby(true);
      emitPipelineTransition('STANDBY', 'STANDBY', 'Wake word mode activated');
      startWakeWordSession();
    } else {
      wakeWordRetryCountRef.current = 0;
      lastWakeErrorRef.current = null;
      isWakeWordStandbyRef.current = false;
      setIsWakeWordStandby(false);
      terminateActiveSession();
      setIsListening(false);
      isListeningRef.current = false;
      stopAudioTelemetry();
      emitPipelineTransition(pipelineStatusRef.current, 'STANDBY', 'Wake word mode disabled');
    }
  }, [wakeWordEnabled, startWakeWordSession, terminateActiveSession, stopAudioTelemetry, emitPipelineTransition]);

  // Main start controller (forceCommandMode skips wake-word standby to record directive immediately)
  const startListening = useCallback(
    (forceCommandMode = false) => {
      const native = getNativeJarvisBridge();
      if (native) {
        isExplicitStopRef.current = false;
        hasDispatchedRef.current = false;
        native.start(forceCommandMode || !wakeWordEnabledRef.current ? 'command' : 'wake');
        emitPipelineTransition('STANDBY', forceCommandMode ? 'LISTENING' : 'STANDBY', 'Native Android speech service started');
        if (forceCommandMode) {
          setIsWakeWordStandby(false);
          setIsListening(true);
          isListeningRef.current = true;
          setCommandListeningActive(true);
          commandListeningActiveRef.current = true;
        }
        return;
      }

      isExplicitStopRef.current = false;
      hasDispatchedRef.current = false;

      if (activeModeRef.current === 'fallback') {
        startFallbackRecording();
        return;
      }

      if (forceCommandMode || !wakeWordEnabledRef.current) {
        emitPipelineTransition('STANDBY', 'LISTENING', 'Direct command session started');
        startCommandSession();
      } else {
        startWakeWordSession();
      }
    },
    [startFallbackRecording, emitPipelineTransition, startCommandSession, startWakeWordSession]
  );

  // Restores wake word standby monitoring after directive execution or speaking finishes
  const resumeWakeWordStandby = useCallback(() => {
    // 1. Stop command recognition completely and cancel any lingering tokens/timers
    terminateActiveSession();
    setIsListening(false);
    isListeningRef.current = false;
    commandListeningActiveRef.current = false;
    setCommandListeningActive(false);
    stopAudioTelemetry();
    setTranscript('');
    setInterimTranscript('');
    pendingFinalDirectiveRef.current = '';
    hasDispatchedRef.current = false;
    isExplicitStopRef.current = false;
    isCommandFinalizedRef.current = false;
    finalizedSessionTokenRef.current = '';
    isWakeWordStandbyRef.current = wakeWordEnabledRef.current;
    setIsWakeWordStandby(wakeWordEnabledRef.current);

    // 2. Return to STANDBY
    emitPipelineTransition('SPEAKING', 'STANDBY', 'Directive complete — resting in STANDBY');
    logEvent('telemetry', 'STANDBY ENTERED', 'info');

    // 3. Only resume the wake-word detector if WAKE WORD MODE is enabled
    // Do NOT start the command listener automatically!
    // Do NOT play the listening sound while in STANDBY!
    if (wakeWordEnabledRef.current) {
      wakeWordRetryCountRef.current = 0;
      lastWakeErrorRef.current = null;
      setDiagnostics(prev => ({
        ...prev,
        exactError: null,
      }));
      restartTimeoutRef.current = setTimeout(() => {
        if (wakeWordEnabledRef.current && pipelineStatusRef.current === 'STANDBY' && !isExplicitStopRef.current) {
          startWakeWordSession();
        }
      }, 500); // 500ms safety buffer to ensure speaker output has completely ceased
    }
  }, [terminateActiveSession, stopAudioTelemetry, emitPipelineTransition, startWakeWordSession, logEvent]);

  // High-fidelity full flow test simulator:
  // "Hey JARVIS" -> command -> response -> return to standby
  const triggerWakeWordTest = useCallback(
    (customDirective = 'Report status of all systems') => {
      terminateActiveSession();
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      isListeningRef.current = false;
      setIsListening(false);
      commandListeningActiveRef.current = false;
      setCommandListeningActive(false);
      isWakeWordStandbyRef.current = false;
      setIsWakeWordStandby(false);
      wakeWordRetryCountRef.current = 0;
      lastWakeErrorRef.current = null;
      setDiagnostics(prev => ({
        ...prev,
        exactError: null,
      }));

      logEvent('telemetry', 'SIMULATED_TEST: Initiating "Hey JARVIS" pipeline flow verification', 'info');
      logEvent('telemetry', 'WAKE_WORD_DETECTED: Recognized "Hey JARVIS"', 'success');
      emitPipelineTransition('STANDBY', 'WAKE_DETECTED', 'Triggered test wake phrase: "Hey JARVIS"');
      onWakeWordDetectedRef.current?.('');

      wakeToCommandTimerRef.current = setTimeout(() => {
        emitPipelineTransition('WAKE_DETECTED', 'LISTENING', 'Directive channel open — listening for user speech');
        onCommandListeningStartRef.current?.();
        isListeningRef.current = true;
        setIsListening(true);
        commandListeningActiveRef.current = true;
        setCommandListeningActive(true);
        setInterimTranscript(customDirective);
        logEvent('telemetry', `COMMAND_LISTENING_STARTED: Capturing directive "${customDirective}"`, 'info');

        wakeToCommandTimerRef.current = setTimeout(() => {
          setIsListening(false);
          isListeningRef.current = false;
          commandListeningActiveRef.current = false;
          setCommandListeningActive(false);
          setTranscript(customDirective);
          setInterimTranscript('');
          logEvent('telemetry', `COMMAND_FINALIZED: "${customDirective}"`, 'success');
          emitPipelineTransition('LISTENING', 'PROCESSING', `Direct dispatch: "${customDirective}"`);
          logEvent('telemetry', 'PROCESSING_STARTED: Executing directive with neural core', 'info');
          onFinalTranscriptRef.current?.(customDirective);
        }, 800);
      }, 600);
    },
    [terminateActiveSession, emitPipelineTransition, logEvent]
  );

  // Main stop controller
  const stopListening = useCallback(() => {
    isExplicitStopRef.current = true;
    getNativeJarvisBridge()?.stop();
    terminateActiveSession();

    if (activeModeRef.current === 'fallback') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
    }

    isStartingRef.current = false;
    isListeningRef.current = false;
    setIsListening(false);
    commandListeningActiveRef.current = false;
    setCommandListeningActive(false);
    stopAudioTelemetry();
    emitPipelineTransition(pipelineStatusRef.current, 'STANDBY', 'Explicit halt');
  }, [terminateActiveSession, stopAudioTelemetry, emitPipelineTransition]);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListeningRef.current || isStartingRef.current) {
      stopListening();
    } else {
      startListening(true);
    }
  }, [startListening, stopListening]);

  // Clear diagnostic logs
  const clearDiagnosticLogs = useCallback(() => {
    wakeWordRetryCountRef.current = 0;
    lastWakeErrorRef.current = null;
    setDiagnostics(prev => ({
      ...prev,
      exactError: null,
      eventLogs: [],
      eventCounts: {
        onstart: 0,
        onaudiostart: 0,
        onsoundstart: 0,
        onspeechstart: 0,
        onresult: 0,
        onspeechend: 0,
        onsoundend: 0,
        onaudioend: 0,
        onerror: 0,
        onend: 0,
      },
    }));
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isExplicitStopRef.current = true;
      terminateActiveSession();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      stopAudioTelemetry();
    };
  }, [terminateActiveSession, stopAudioTelemetry]);

  return {
    isListening,
    commandListeningActive,
    transcript,
    interimTranscript,
    isSupported,
    error,
    clearError,
    audioLevel,
    activeMode,
    setActiveMode,
    isTranscribingFallback,
    speechDiagnostics: diagnostics,
    clearDiagnosticLogs,
    startListening,
    stopListening,
    toggleListening,
    resumeWakeWordStandby,
    isWakeWordStandby,
    pipelineStatus,
    logTelemetry: (msg: string, level: 'info' | 'success' | 'warn' | 'error' = 'info') => logEvent('telemetry', msg, level),
    emitPipelineTransition,
    triggerWakeWordTest,
  };
}
