import { useCallback, useEffect, useRef, useState } from 'react';
import type { JarvisPipelineStatus } from '../types/jarvis';
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
  isWebSpeechUnavailable: boolean;
  micPermission: 'granted' | 'denied' | 'prompt' | 'unknown';
  microphonePermission: 'granted' | 'denied' | 'prompt' | 'unknown';
  exactError: string | null;
  lastError: string | null;
  lastErrorTime: string | null;
  lastTranscript: string;
  confidence: number | null;
  secureContext: boolean;
  userAgent: string;
  events: DiagnosticEventLog[];
}

export interface UseSpeechRecognitionOptions {
  wakeWordEnabled?: boolean;
  isSpeaking?: boolean;
  preferredInputDeviceId?: string | null;
  apiUrl?: string;
  onCommandListeningStart?: () => void;
  onFinalTranscript?: (text: string) => void;
  onWakeWordDetected?: (trailingCommand?: string) => void;
  onPipelineTransition?: ( from: JarvisPipelineStatus, to: JarvisPipelineStatus, reason?: string, ) => void;
}

type RecognitionMode = 'wake' | 'command';

interface RecognitionResultLike {
  transcript?: string;
  confidence?: number;
}

interface RecognitionEventLike {
  resultIndex?: number;
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: RecognitionResultLike;
  }>;
}

interface RecognitionErrorEventLike {
  error?: string;
  message?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onnomatch: ((event: Event) => void) | null;
  onspeechstart: ((event: Event) => void) | null;
  onspeechend: ((event: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const WAKE_PHRASES = [
  'hey jarvis',
  'okay jarvis',
  'ok jarvis',
  'hi jarvis',
  'hello jarvis',
];

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const containsWakeWord = (value: string): boolean => {
  const normalized = normalizeText(value);
  return WAKE_PHRASES.some((phrase) => normalized.includes(phrase));
};

const removeWakeWord = (value: string): string => {
  const normalized = normalizeText(value);
  const phrase = WAKE_PHRASES.find((item) => normalized.includes(item));

  if (!phrase) return '';

  const normalizedIndex = normalized.indexOf(phrase);
  const normalizedTail = normalized.slice(normalizedIndex + phrase.length);

  return normalizedTail.replace(/^[\s,!.?-]+/, '').trim();
};

const createEventId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useSpeechRecognition( options: UseSpeechRecognitionOptions = {}, ) {
  const {
    wakeWordEnabled = true,
    isSpeaking = false,
    preferredInputDeviceId = null,
    onCommandListeningStart,
    onFinalTranscript,
    onWakeWordDetected,
    onPipelineTransition,
  } = options;

  const native = getNativeJarvisBridge();

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sessionIdRef = useRef(0);
  const mountedRef = useRef(true);
  const restartTimerRef = useRef<number | null>(null);

  const modeRef = useRef<RecognitionMode>('wake');
  const wakeWordEnabledRef = useRef(wakeWordEnabled);
  const explicitStopRef = useRef(false);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onWakeWordDetectedRef = useRef(onWakeWordDetected);
  const onPipelineTransitionRef = useRef(onPipelineTransition);
  const onCommandListeningStartRef = useRef(onCommandListeningStart);
  const previousPipelineRef = useRef<JarvisPipelineStatus>('STANDBY');

  const [isListening, setIsListening] = useState(false);
  const [commandListeningActive, setCommandListeningActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [activeMode, setActiveModeState] = useState<RecognitionMode>('wake');
  const [isWakeWordStandby, setIsWakeWordStandby] = useState(false);
  const [isTranscribingFallback, setIsTranscribingFallback] = useState(false);
  const [pipelineStatus, setPipelineStatus] =
    useState<JarvisPipelineStatus>('STANDBY');

  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticEventLog[]>([]);
  const [speechDiagnostics, setSpeechDiagnostics] = useState<SpeechDiagnostics>(() => ({
    hasSpeechRecognition:
      typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    hasWebkitSpeechRecognition:
      typeof window !== 'undefined' && !!window.webkitSpeechRecognition,
    isWebSpeechUnavailable:
      typeof window === 'undefined' ||
      !(window.SpeechRecognition || window.webkitSpeechRecognition),
    micPermission: 'unknown',
    microphonePermission: 'unknown',
    exactError: null,
    lastError: null,
    lastErrorTime: null,
    lastTranscript: '',
    confidence: null,
    secureContext:
      typeof window !== 'undefined' ? window.isSecureContext : false,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    events: [],
  }));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    wakeWordEnabledRef.current = wakeWordEnabled;
  }, [wakeWordEnabled]);

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    onWakeWordDetectedRef.current = onWakeWordDetected;
  }, [onWakeWordDetected]);

  useEffect(() => {
    onPipelineTransitionRef.current = onPipelineTransition;
  }, [onPipelineTransition]);

  useEffect(() => {
    onCommandListeningStartRef.current = onCommandListeningStart;
  }, [onCommandListeningStart]);

  const logTelemetry = useCallback(
    ( message: string, level: DiagnosticEventLog['level'] = 'info', details = '', ) => {
      if (!mountedRef.current) return;

      const entry: DiagnosticEventLog = {
        id: createEventId(),
        time: new Date().toISOString(),
        event: message,
        details,
        level,
      };

      setDiagnosticLogs((previous) => [...previous, entry].slice(-100));
      setSpeechDiagnostics((previous) => ({
        ...previous,
        events: [...previous.events, entry].slice(-100),
      }));
    },
    [],
  );

  const emitPipelineTransition = useCallback(
    ( fromOrTo: JarvisPipelineStatus, toOrReason?: JarvisPipelineStatus, reason = '', ) => {
      if (!mountedRef.current) return;

      const from =
        toOrReason !== undefined
          ? fromOrTo
          : previousPipelineRef.current;

      const to =
        toOrReason !== undefined
          ? toOrReason
          : fromOrTo;

      previousPipelineRef.current = to;
      setPipelineStatus(to);

      onPipelineTransitionRef.current?.(from, to, reason);
      logTelemetry(
        'PIPELINE',
        to === 'STANDBY' ? 'info' : 'success',
        reason || `${from} → ${to}`,
      );
    },
    [logTelemetry],
  );

  const clearError = useCallback(() => {
    setError(null);
    setSpeechDiagnostics((previous) => ({
      ...previous,
      exactError: null,
      lastError: null,
      lastErrorTime: null,
    }));
  }, []);

  const clearDiagnosticLogs = useCallback(() => {
    setDiagnosticLogs([]);
    setSpeechDiagnostics((previous) => ({ ...previous, events: [] }));
  }, []);

  const setActiveMode = useCallback(
    (mode: RecognitionMode) => {
      modeRef.current = mode;
      setActiveModeState(mode);
      setCommandListeningActive(mode === 'command');
      logTelemetry(
        'MODE_CHANGED',
        'info',
        `Recognition mode changed to ${mode}.`,
      );
    },
    [logTelemetry],
  );

  const getSpeechRecognitionConstructor = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }, []);

  const destroyRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (!recognition) return;

    try {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.onnomatch = null;
      recognition.onspeechstart = null;
      recognition.onspeechend = null;
      recognition.abort();
    } catch {
      // Ignore cleanup failures.
    }
  }, []);

  const checkMicrophonePermission = useCallback(async (): Promise<boolean> => {
    if (native) {
      try {
        const permission = native.hasMicrophonePermission();

        if (permission === true) {
          setSpeechDiagnostics((previous) => ({
            ...previous,
            micPermission: 'granted',
            microphonePermission: 'granted',
          }));
          return true;
        }

        if (permission === false) {
          setSpeechDiagnostics((previous) => ({
            ...previous,
            micPermission: 'denied',
            microphonePermission: 'denied',
          }));
          return false;
        }
      } catch {
        // Fall through to browser permission handling.
      }
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: preferredInputDeviceId
          ? { deviceId: { exact: preferredInputDeviceId } }
          : true,
      });

      stream.getTracks().forEach((track) => track.stop());

      setSpeechDiagnostics((previous) => ({
        ...previous,
        micPermission: 'granted',
        microphonePermission: 'granted',
      }));

      return true;
    } catch (permissionError) {
      const message = String(permissionError);

      setSpeechDiagnostics((previous) => ({
        ...previous,
        micPermission: 'denied',
        microphonePermission: 'denied',
        exactError: message,
        lastError: message,
        lastErrorTime: new Date().toISOString(),
      }));

      return false;
    }
  }, [native, preferredInputDeviceId]);

  const stopListening = useCallback(() => {
    explicitStopRef.current = true;
    sessionIdRef.current += 1;

    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    destroyRecognition();

    if (native) {
      try {
        native.stop();
      } catch {
        // Ignore native stop failures.
      }
    }

    setIsListening(false);
    setCommandListeningActive(false);
    setIsWakeWordStandby(false);
    setIsTranscribingFallback(false);
    setAudioLevel(0);
    emitPipelineTransition(
      pipelineStatus,
      'STANDBY',
      'Speech recognition stopped.',
    );
  }, [destroyRecognition, emitPipelineTransition, native, pipelineStatus]);

  const handleWakeWord = useCallback(
    (spokenText: string) => {
      if (!containsWakeWord(spokenText)) return false;

      const trailingCommand = removeWakeWord(spokenText);

      setIsWakeWordStandby(false);
      setCommandListeningActive(true);
      setActiveModeState('command');
      modeRef.current = 'command';

      emitPipelineTransition(
        'STANDBY',
        'WAKE_DETECTED',
        'Hey JARVIS detected.',
      );

      onWakeWordDetectedRef.current?.(trailingCommand || undefined);

      if (trailingCommand) {
        setTranscript(trailingCommand);
        setInterimTranscript('');
        emitPipelineTransition(
          'WAKE_DETECTED',
          'LISTENING',
          'Command detected with wake phrase.',
        );
        onFinalTranscriptRef.current?.(trailingCommand);
      } else {
        emitPipelineTransition(
          'WAKE_DETECTED',
          'LISTENING',
          'Listening for command.',
        );
        onCommandListeningStartRef.current?.();
      }

      return true;
    },
    [emitPipelineTransition],
  );

  const startNativeSession = useCallback(
    (mode: RecognitionMode) => {
      if (!native) return false;

      explicitStopRef.current = false;
      modeRef.current = mode;
      setActiveModeState(mode);
      setIsListening(true);
      setError(null);
      setAudioLevel(0);

      if (mode === 'wake') {
        setIsWakeWordStandby(true);
        setCommandListeningActive(false);
        emitPipelineTransition(
          'STANDBY',
          'STANDBY',
          'Starting Android wake-word standby.',
        );
      } else {
        setIsWakeWordStandby(false);
        setCommandListeningActive(true);
        emitPipelineTransition(
          pipelineStatus,
          'LISTENING',
          'Starting Android command listening.',
        );
        onCommandListeningStartRef.current?.();
      }

      try {
        native.start(mode);
        logTelemetry(
          'NATIVE_START',
          'success',
          `Android native speech session started in ${mode} mode.`,
        );
        return true;
      } catch (nativeError) {
        const message = String(nativeError);
        setError(message);
        setSpeechDiagnostics((previous) => ({
          ...previous,
          exactError: message,
          lastError: message,
          lastErrorTime: new Date().toISOString(),
        }));
        emitPipelineTransition(
          pipelineStatus,
          'STANDBY',
          message,
        );
        setIsListening(false);
        return false;
      }
    },
    [emitPipelineTransition, logTelemetry, native, pipelineStatus],
  );

  const startWebRecognition = useCallback(
    async (mode: RecognitionMode): Promise<boolean> => {
      const Constructor = getSpeechRecognitionConstructor();

      if (!Constructor) {
        const message =
          'Speech recognition is not available on this device.';

        setError(message);
        setSpeechDiagnostics((previous) => ({
          ...previous,
          isWebSpeechUnavailable: true,
          exactError: message,
          lastError: message,
          lastErrorTime: new Date().toISOString(),
        }));
        emitPipelineTransition(
          pipelineStatus,
          'STANDBY',
          message,
        );
        return false;
      }

      const permissionGranted = await checkMicrophonePermission();

      if (!permissionGranted) {
        const message =
          'Microphone permission is required for JARVIS voice control.';

        setError(message);
        setSpeechDiagnostics((previous) => ({
          ...previous,
          exactError: message,
          lastError: message,
          lastErrorTime: new Date().toISOString(),
        }));
        emitPipelineTransition(
          pipelineStatus,
          'STANDBY',
          message,
        );
        return false;
      }

      explicitStopRef.current = false;
      const sessionId = ++sessionIdRef.current;

      destroyRecognition();

      modeRef.current = mode;
      setActiveModeState(mode);
      setIsListening(true);
      setCommandListeningActive(mode === 'command');
      setIsWakeWordStandby(mode === 'wake');
      setTranscript('');
      setInterimTranscript('');
      setError(null);
      setAudioLevel(0);

      emitPipelineTransition(
        pipelineStatus,
        mode === 'wake' ? 'STANDBY' : 'LISTENING',
        mode === 'wake'
          ? 'Web speech wake-word standby started.'
          : 'Web speech command listening started.',
      );

      if (mode === 'command') {
        onCommandListeningStartRef.current?.();
      }

      const recognition = new Constructor();
      recognitionRef.current = recognition;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 3;

      recognition.onstart = () => {
        if (sessionId !== sessionIdRef.current) return;
        setIsListening(true);
        logTelemetry(
          'RECOGNITION_START',
          'success',
          `Web recognition started in ${mode} mode.`,
        );
      };

      recognition.onresult = (event) => {
        if (sessionId !== sessionIdRef.current) return;

        let finalText = '';
        let interimText = '';

        for (
          let index = event.resultIndex || 0;
          index < event.results.length;
          index += 1
        ) {
          const result = event.results[index];
          if (!result?.[0]) continue;

          const text = result[0].transcript || '';

          if (result.isFinal) {
            finalText += ` ${text}`;
            setSpeechDiagnostics((previous) => ({
              ...previous,
              confidence:
                typeof result[0].confidence === 'number'
                  ? result[0].confidence
                  : null,
              lastTranscript: text,
            }));
          } else {
            interimText += ` ${text}`;
          }
        }

        finalText = normalizeText(finalText);
        interimText = normalizeText(interimText);

        if (interimText) {
          setInterimTranscript(interimText);
          setAudioLevel(Math.min(1, Math.max(0.15, interimText.length / 40)));

          if (
            modeRef.current === 'wake' &&
            containsWakeWord(interimText)
          ) {
            handleWakeWord(interimText);
          }
        }

        if (!finalText) return;

        setTranscript(finalText);
        setInterimTranscript('');
        setAudioLevel(0);

        if (modeRef.current === 'wake') {
          handleWakeWord(finalText);
          return;
        }

        emitPipelineTransition(
          'LISTENING',
          'LISTENING',
          'Final command received.',
        );
        onFinalTranscriptRef.current?.(finalText);
      };

      recognition.onerror = (event) => {
        if (sessionId !== sessionIdRef.current) return;

        const code = event.error || 'unknown';
        const message =
          event.message || `Speech recognition error: ${code}`;

        setSpeechDiagnostics((previous) => ({
          ...previous,
          exactError: message,
          lastError: message,
          lastErrorTime: new Date().toISOString(),
        }));

        logTelemetry(
          'RECOGNITION_ERROR',
          code === 'no-speech' ? 'warn' : 'error',
          `${code}: ${message}`,
        );

        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setError(
            'Microphone permission was denied or speech recognition is blocked.',
          );
          setSpeechDiagnostics((previous) => ({
            ...previous,
            micPermission: 'denied',
            microphonePermission: 'denied',
          }));
          emitPipelineTransition(
            pipelineStatus,
            'STANDBY',
            message,
          );
        }
      };

      recognition.onend = () => {
        if (sessionId !== sessionIdRef.current) return;

        recognitionRef.current = null;
        setAudioLevel(0);

        if (explicitStopRef.current || isSpeaking) return;

        if (modeRef.  }, [isListening, startListening, stopListening]);

  const triggerWakeWordTest = useCallback(() => {
    setIsWakeWordStandby(false);
    emitPipelineTransition(
      'STANDBY',
      'WAKE_DETECTED',
      'Manual wake-word test.',
    );
    onWakeWordDetectedRef.current?.();
  }, [emitPipelineTransition]);

  useEffect(() => {
    if (!native) return;

    const removeListener = native.onEvent((event) => {
      if (!mountedRef.current) return;

      switch (event.type) {
        case 'wake':
          modeRef.current = 'command';
          setActiveModeState('command');
          setIsListening(true);
          setIsWakeWordStandby(false);
          setCommandListeningActive(true);
          setTranscript('');
          setInterimTranscript('');

          emitPipelineTransition(
            'STANDBY',
            'WAKE_DETECTED',
            'Android detected Hey JARVIS.',
          );

          onWakeWordDetectedRef.current?.();
          onCommandListeningStartRef.current?.();

          emitPipelineTransition(
            'WAKE_DETECTED',
            'LISTENING',
            'Listening for command.',
          );
          break;

        case 'partial':
          setInterimTranscript(normalizeText(event.text));
          setAudioLevel(0.55);
          break;

        case 'command': {
          const command = normalizeText(event.text);
          if (!command) break;

          setTranscript(command);
          setInterimTranscript('');
          setAudioLevel(0);
          setIsListening(true);
          setCommandListeningActive(true);
          modeRef.current = 'command';
          setActiveModeState('command');

          emitPipelineTransition(
            'LISTENING',
            'LISTENING',
            'Android native command received.',
          );

          onFinalTranscriptRef.current?.(command);
          break;
        }

        case 'error': {
          const message =
            event.text || 'Android speech recognition failed.';

          setError(message);
          setSpeechDiagnostics((previous) => ({
            ...previous,
            exactError: message,
            lastError: message,
            lastErrorTime: new Date().toISOString(),
          }));

          emitPipelineTransition(
            pipelineStatus,
            'STANDBY',
            message,
          );
          break;
        }

        case 'microphone-granted':
          setSpeechDiagnostics((previous) => ({
            ...previous,
            micPermission: 'granted',
            microphonePermission: 'granted',
            exactError: null,
            lastError: null,
            lastErrorTime: null,
          }));
          setError(null);
          break;

        case 'microphone-denied': {
          const message =
            event.text || 'Android microphone permission was denied.';

          setSpeechDiagnostics((previous) => ({
            ...previous,
            micPermission: 'denied',
            microphonePermission: 'denied',
            exactError: message,
            lastError: message,
            lastErrorTime: new Date().toISOString(),
          }));

          setError(message);
          emitPipelineTransition(
            pipelineStatus,
            'STANDBY',
            message,
          );
          break;
        }

        default:
          break;
      }
    });

    return removeListener;
  }, [emitPipelineTransition, native, pipelineStatus]);

  useEffect(() => {
    if (wakeWordEnabled && !isListening && !explicitStopRef.current) {
      setIsWakeWordStandby(false);
    }
  }, [isListening, wakeWordEnabled]);

  const isSupported =
    !!native || !!getSpeechRecognitionConstructor();

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
    speechDiagnostics,
    diagnosticLogs,
    clearDiagnosticLogs,
    startListening,
    stopListening,
    toggleListening,
    resumeWakeWordStandby,
    isWakeWordStandby,
    pipelineStatus,
    logTelemetry,
    emitPipelineTransition,
    triggerWakeWordTest,
  };
      }
