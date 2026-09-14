import { useCallback, useEffect, useRef, useState } from 'react';
import { JarvisPipelineStatus } from '../types/jarvis';
import { getNativeJarvisBridge } from './nativeBridge';

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
  microphonePermission: 'granted' | 'denied' | 'prompt' | 'unknown';
  secureContext: boolean;
  userAgent: string;
  lastError: string | null;
  lastTranscript: string;
  confidence: number | null;
  events: DiagnosticEventLog[];
}

export interface UseSpeechRecognitionOptions {
  wakeWordEnabled?: boolean;
  apiUrl?: string;
  onFinalTranscript?: (text: string) => void;
  onWakeWordDetected?: () => void;
  onPipelineStatusChange?: (status: JarvisPipelineStatus) => void;
}

type RecognitionMode = 'wake' | 'command';

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: any;
}

interface SpeechRecognitionErrorEventLike {
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
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
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

const NORMALIZED_WAKE_WORD = 'jarvis';

const normalizeText = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const containsWakeWord = (value: string): boolean => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return false;
  }

  return WAKE_PHRASES.some((phrase) => {
    return normalized.includes(phrase);
  });
};

const removeWakeWord = (value: string): string => {
  let result = value;

  for (const phrase of WAKE_PHRASES) {
    const index = normalizeText(result).indexOf(phrase);

    if (index >= 0) {
      const lower = result.toLowerCase();
      const actualIndex = lower.indexOf(phrase);

      if (actualIndex >= 0) {
        result =
          result.slice(0, actualIndex) +
          result.slice(actualIndex + phrase.length);
      }
    }
  }

  return result
    .replace(/^[\s,!.?-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const createEventId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
} 
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
) {
  const {
    wakeWordEnabled = true,
    onFinalTranscript,
    onWakeWordDetected,
    onPipelineStatusChange,
  } = options;

  const native = getNativeJarvisBridge();

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sessionIdRef = useRef(0);
  const mountedRef = useRef(true);

  const modeRef = useRef<RecognitionMode>('wake');
  const wakeWordEnabledRef = useRef(wakeWordEnabled);
  const explicitStopRef = useRef(false);
  const restartingRef = useRef(false);

  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onWakeWordDetectedRef = useRef(onWakeWordDetected);
  const onPipelineStatusChangeRef =
    useRef(onPipelineStatusChange);

  const [isListening, setIsListening] = useState(false);
  const [commandListeningActive, setCommandListeningActive] =
    useState(false);

  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] =
    useState('');

  const [error, setError] = useState<string | null>(null);

  const [audioLevel, setAudioLevel] = useState(0);

  const [activeMode, setActiveModeState] =
    useState<RecognitionMode>('wake');

  const [isWakeWordStandby, setIsWakeWordStandby] =
    useState(false);

  const [isTranscribingFallback, setIsTranscribingFallback] =
    useState(false);

  const [pipelineStatus, setPipelineStatus] =
    useState<JarvisPipelineStatus>(
      JarvisPipelineStatus.IDLE,
    );

  const [diagnosticLogs, setDiagnosticLogs] =
    useState<DiagnosticEventLog[]>([]);

  const [speechDiagnostics, setSpeechDiagnostics] =
    useState<SpeechDiagnostics>({
      hasSpeechRecognition:
        typeof window !== 'undefined' &&
        !!(
          window.SpeechRecognition ||
          window.webkitSpeechRecognition
        ),

      hasWebkitSpeechRecognition:
        typeof window !== 'undefined' &&
        !!window.webkitSpeechRecognition,

      microphonePermission: 'unknown',

      secureContext:
        typeof window !== 'undefined'
          ? window.isSecureContext
          : false,

      userAgent:
        typeof navigator !== 'undefined'
          ? navigator.userAgent
          : '',

      lastError: null,
      lastTranscript: '',
      confidence: null,
      events: [],
    });

  useEffect(() => {
    wakeWordEnabledRef.current = wakeWordEnabled;
  }, [wakeWordEnabled]);

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    onWakeWordDetectedRef.current =
      onWakeWordDetected;
  }, [onWakeWordDetected]);

  useEffect(() => {
    onPipelineStatusChangeRef.current =
      onPipelineStatusChange;
  }, [onPipelineStatusChange]);

  const logTelemetry = useCallback(
    (
      event: string,
      details: string,
      level: DiagnosticEventLog['level'] = 'info',
    ) => {
      if (!mountedRef.current) {
        return;
      }

      const entry: DiagnosticEventLog = {
        id: createEventId(),
        time: new Date().toISOString(),
        event,
        details,
        level,
      };

      setDiagnosticLogs((previous) => {
        const next = [...previous, entry];

        return next.slice(-100);
      });

      setSpeechDiagnostics((previous) => ({
        ...previous,
        events: [
          ...previous.events,
          entry,
        ].slice(-100),
      }));
    },
    [],
  );

  const emitPipelineTransition = useCallback(
    (
      status: JarvisPipelineStatus,
      details = '',
    ) => {
      if (!mountedRef.current) {
        return;
      }

      setPipelineStatus(status);

      onPipelineStatusChangeRef.current?.(
        status,
      );

      logTelemetry(
        'PIPELINE',
        details
          ? `${status}: ${details}`
          : status,
        status === JarvisPipelineStatus.ERROR
          ? 'error'
          : status === JarvisPipelineStatus.IDLE
            ? 'info'
            : 'success',
      );
    },
    [logTelemetry],
  );

  const clearError = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    setError(null);

    setSpeechDiagnostics((previous) => ({
      ...previous,
      lastError: null,
    }));
  }, []);

  const clearDiagnosticLogs = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    setDiagnosticLogs([]);

    setSpeechDiagnostics((previous) => ({
      ...previous,
      events: [],
    }));
  }, []);

  const setActiveMode = useCallback(
    (mode: RecognitionMode) => {
      modeRef.current = mode;
      setActiveModeState(mode);

      if (mode === 'wake') {
        setCommandListeningActive(false);
      } else {
        setCommandListeningActive(true);
      }

      logTelemetry(
        'MODE_CHANGED',
        `Recognition mode changed to ${mode}.`,
        'info',
      );
    },
    [logTelemetry],
  );
    const checkMicrophonePermission = useCallback(
    async (): Promise<boolean> => {
      // Android native bridge is the primary permission source.
      if (native) {
        try {
          const permission =
            native.hasMicrophonePermission();

          if (permission === true) {
            setSpeechDiagnostics((previous) => ({
              ...previous,
              microphonePermission: 'granted',
            }));

            logTelemetry(
              'MIC_PERMISSION',
              'Android microphone permission is already granted.',
              'success',
            );

            return true;
          }

          if (permission === false) {
            setSpeechDiagnostics((previous) => ({
              ...previous,
              microphonePermission: 'denied',
            }));

            logTelemetry(
              'MIC_PERMISSION',
              'Android microphone permission is not granted.',
              'warn',
            );

            return false;
          }
        } catch (nativeError) {
          logTelemetry(
            'MIC_PERMISSION',
            `Native permission check failed: ${String(nativeError)}`,
            'warn',
          );
        }
      }

      // Browser/WebView fallback.
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setSpeechDiagnostics((previous) => ({
          ...previous,
          microphonePermission: 'unknown',
        }));

        logTelemetry(
          'MIC_PERMISSION',
          'getUserMedia is unavailable.',
          'error',
        );

        return false;
      }

      try {
        const stream =
          await navigator.mediaDevices.getUserMedia({
            audio: true,
          });

        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // Ignore cleanup errors.
          }
        });

        setSpeechDiagnostics((previous) => ({
          ...previous,
          microphonePermission: 'granted',
        }));

        logTelemetry(
          'MIC_PERMISSION',
          'Browser microphone permission granted.',
          'success',
        );

        return true;
      } catch (permissionError) {
        setSpeechDiagnostics((previous) => ({
          ...previous,
          microphonePermission: 'denied',
          lastError: String(permissionError),
          lastErrorTime: new Date().toISOString(),
        }));

        logTelemetry(
          'MIC_PERMISSION',
          `Microphone permission failed: ${String(
            permissionError,
          )}`,
          'error',
        );

        return false;
      }
    },
    [native, logTelemetry],
  );

  const getSpeechRecognitionConstructor =
    useCallback((): SpeechRecognitionConstructor | null => {
      if (typeof window === 'undefined') {
        return null;
      }

      return (
        window.SpeechRecognition ||
        window.webkitSpeechRecognition ||
        null
      );
    }, []);

  const destroyRecognition = useCallback(() => {
    const recognition = recognitionRef.current;

    recognitionRef.current = null;

    if (!recognition) {
      return;
    }

    try {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.onnomatch = null;
      recognition.onspeechstart = null;
      recognition.onspeechend = null;
    } catch {
      // Ignore handler cleanup errors.
    }

    try {
      recognition.abort();
    } catch {
      // Ignore recognition cleanup errors.
    }
  }, []);

  const stopListening = useCallback(() => {
    explicitStopRef.current = true;
    restartingRef.current = false;

    sessionIdRef.current += 1;

    destroyRecognition();

    if (native) {
      try {
        native.stop();
      } catch (nativeError) {
        logTelemetry(
          'NATIVE_STOP',
          `Native stop failed: ${String(nativeError)}`,
          'warn',
        );
      }
    }

    if (!mountedRef.current) {
      return;
    }

    setIsListening(false);
    setCommandListeningActive(false);
    setIsWakeWordStandby(false);
    setIsTranscribingFallback(false);
    setAudioLevel(0);

    emitPipelineTransition(
      JarvisPipelineStatus.IDLE,
      'Speech recognition stopped.',
    );
  }, [
    destroyRecognition,
    emitPipelineTransition,
    logTelemetry,
    native,
  ]);

  const handleWakeWord = useCallback(
    (spokenText: string) => {
      if (!containsWakeWord(spokenText)) {
        return false;
      }

      logTelemetry(
        'WAKE_WORD',
        `Wake phrase detected from: "${spokenText}"`,
        'success',
      );

      setIsWakeWordStandby(false);

      emitPipelineTransition(
        JarvisPipelineStatus.WAKE_DETECTED,
        'Hey JARVIS detected.',
      );

      onWakeWordDetectedRef.current?.();

      const commandAfterWake =
        removeWakeWord(spokenText);

      if (commandAfterWake) {
        setTranscript(commandAfterWake);
        setInterimTranscript('');

        emitPipelineTransition(
          JarvisPipelineStatus.LISTENING,
          'Command detected together with wake phrase.',
        );

        onFinalTranscriptRef.current?.(
          commandAfterWake,
        );
      }

      return true;
    },
    [emitPipelineTransition, logTelemetry],
  );
    const startNativeSession = useCallback(
    (mode: RecognitionMode) => {
      if (!native) {
        return false;
      }

      explicitStopRef.current = false;
      modeRef.current = mode;
      setActiveModeState(mode);

      if (mode === 'wake') {
        setIsWakeWordStandby(true);
        setCommandListeningActive(false);

        emitPipelineTransition(
          JarvisPipelineStatus.STANDBY,
          'Starting native Android wake-word standby.',
        );
      } else {
        setIsWakeWordStandby(false);
        setCommandListeningActive(true);

        emitPipelineTransition(
          JarvisPipelineStatus.LISTENING,
          'Starting native Android command listening.',
        );
      }

      setIsListening(true);
      setError(null);
      setAudioLevel(0);

      try {
        native.start(mode);

        logTelemetry(
          'NATIVE_START',
          `Android native speech session started in ${mode} mode.`,
          'success',
        );

        return true;
      } catch (nativeError) {
        const message = String(nativeError);

        setError(message);

        logTelemetry(
          'NATIVE_START',
          `Android native speech start failed: ${message}`,
          'error',
        );

        emitPipelineTransition(
          JarvisPipelineStatus.ERROR,
          message,
        );

        setIsListening(false);
        setCommandListeningActive(false);
        setIsWakeWordStandby(false);

        return false;
      }
    },
    [
      emitPipelineTransition,
      logTelemetry,
      native,
    ],
  );

  const startWebRecognition = useCallback(
    async (mode: RecognitionMode) => {
      const Constructor =
        getSpeechRecognitionConstructor();

      if (!Constructor) {
        setError(
          'Speech recognition is not available on this device.',
        );

        logTelemetry(
          'WEB_SPEECH',
          'SpeechRecognition API is unavailable.',
          'error',
        );

        emitPipelineTransition(
          JarvisPipelineStatus.ERROR,
          'SpeechRecognition API unavailable.',
        );

        return false;
      }

      const permissionGranted =
        await checkMicrophonePermission();

      if (!permissionGranted) {
        setError(
          'Microphone permission is required for JARVIS voice control.',
        );

        emitPipelineTransition(
          JarvisPipelineStatus.ERROR,
          'Microphone permission was not granted.',
        );

        return false;
      }

      explicitStopRef.current = false;

      const sessionId =
        ++sessionIdRef.current;

      destroyRecognition();

      modeRef.current = mode;
      setActiveModeState(mode);

      setIsListening(true);
      setCommandListeningActive(
        mode === 'command',
      );

      setIsWakeWordStandby(
        mode === 'wake',
      );

      setTranscript('');
      setInterimTranscript('');
      setError(null);
      setAudioLevel(0);
      setIsTranscribingFallback(false);

      if (mode === 'wake') {
        emitPipelineTransition(
          JarvisPipelineStatus.STANDBY,
          'Web speech wake-word standby started.',
        );
      } else {
        emitPipelineTransition(
          JarvisPipelineStatus.LISTENING,
          'Web speech command listening started.',
        );
      }

      const recognition =
        new Constructor();

      recognitionRef.current =
        recognition;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 3;

      recognition.onstart = () => {
        if (
          sessionId !==
          sessionIdRef.current
        ) {
          return;
        }

        setIsListening(true);

        logTelemetry(
          'RECOGNITION_START',
          `Web recognition started in ${mode} mode.`,
          'success',
        );
      };

      recognition.onresult = (
        event: SpeechRecognitionEventLike,
      ) => {
        if (
          sessionId !==
          sessionIdRef.current
        ) {
          return;
        }

        let finalText = '';
        let interimText = '';

        for (
          let i =
            event.resultIndex || 0;
          i < event.results.length;
          i++
        ) {
          const result =
            event.results[i];

          if (
            !result ||
            !result[0]
          ) {
            continue;
          }

          const text =
            result[0].transcript || '';

          if (result.isFinal) {
            finalText += ` ${text}`;

            const confidence =
              typeof result[0]
                .confidence === 'number'
                ? result[0].confidence
                : null;

            setSpeechDiagnostics(
              (previous) => ({
                ...previous,
                confidence,
                lastTranscript:
                  text,
              }),
            );
          } else {
            interimText += ` ${text}`;
          }
        }

        finalText =
          normalizeText(finalText);

        interimText =
          normalizeText(interimText);

        if (interimText) {
          setInterimTranscript(
            interimText,
          );

          if (
            modeRef.current ===
            'wake'
          ) {
            setAudioLevel(
              Math.min(
                1,
                Math.max(
                  0.15,
                  interimText.length /
                    40,
                ),
              ),
            );
          }
        }

        if (!finalText) {
          return;
        }

        setTranscript(finalText);
        setInterimTranscript('');
        setAudioLevel(0);

        logTelemetry(
          'FINAL_TRANSCRIPT',
          `Recognized: "${finalText}"`,
          'success',
        );

        if (
          modeRef.current ===
          'wake'
        ) {
          if (
            containsWakeWord(
              finalText,
            )
          ) {
            handleWakeWord(
              finalText,
            );
          }

          return;
        }

        emitPipelineTransition(
          JarvisPipelineStatus.LISTENING,
          'Final command received.',
        );

        onFinalTranscriptRef.current?.(
          finalText,
        );
      };

      recognition.onerror = (
        event: SpeechRecognitionErrorEventLike,
      ) => {
        if (
          sessionId !==
          sessionIdRef.current
        ) {
          return;
        }

        const errorCode =
          event.error ||
          'unknown';

        const message =
          event.message ||
          `Speech recognition error: ${errorCode}`;

        setSpeechDiagnostics(
          (previous) => ({
            ...previous,
            lastError: message,
            lastErrorTime:
              new Date().toISOString(),
          }),
        );

        logTelemetry(
          'RECOGNITION_ERROR',
          `${errorCode}: ${message}`,
          errorCode === 'no-speech'
            ? 'warn'
            : 'error',
        );

        if (
          errorCode ===
          'not-allowed' ||
          errorCode ===
          'service-not-allowed'
        ) {
          setError(
            'Microphone permission was denied or speech recognition is blocked.',
          );

          setIsListening(false);
          setCommandListeningActive(false);
          setIsWakeWordStandby(false);

          emitPipelineTransition(
            JarvisPipelineStatus.ERROR,
            message,
          );
        }
      };
            recognition.onend = () => {
        if (
          sessionId !== sessionIdRef.current
        ) {
          return;
        }

        recognitionRef.current = null;
        setAudioLevel(0);

        if (explicitStopRef.current) {
          setIsListening(false);
          setCommandListeningActive(false);
          setIsWakeWordStandby(false);
          return;
        }

        /*
         * Web Speech can end by itself even when continuous=true.
         * Restart only when JARVIS is still supposed to be listening.
         */
        if (
          wakeWordEnabledRef.current ||
          modeRef.current === 'command'
        ) {
          if (restartingRef.current) {
            return;
          }

          restartingRef.current = true;

          window.setTimeout(() => {
            restartingRef.current = false;

            if (
              !mountedRef.current ||
              explicitStopRef.current ||
              sessionId !==
                sessionIdRef.current
            ) {
              return;
            }

            startWebRecognition(
              modeRef.current,
            );
          }, 500);
        } else {
          setIsListening(false);
          setCommandListeningActive(false);
          setIsWakeWordStandby(false);

          emitPipelineTransition(
            JarvisPipelineStatus.IDLE,
            'Speech recognition ended.',
          );
        }
      };

      recognition.onspeechstart = () => {
        if (
          sessionId !==
          sessionIdRef.current
        ) {
          return;
        }

        setAudioLevel(0.65);

        if (
          modeRef.current ===
          'command'
        ) {
          emitPipelineTransition(
            JarvisPipelineStatus.LISTENING,
            'Speech detected.',
          );
        }
      };

      recognition.onspeechend = () => {
        if (
          sessionId !==
          sessionIdRef.current
        ) {
          return;
        }

        setAudioLevel(0);
      };

      recognition.onnomatch = () => {
        if (
          sessionId !==
          sessionIdRef.current
        ) {
          return;
        }

        logTelemetry(
          'NO_MATCH',
          'Speech was heard but no matching recognition result was returned.',
          'warn',
        );
      };

      try {
        recognition.start();

        logTelemetry(
          'WEB_RECOGNITION_START',
          `Started Web Speech in ${mode} mode.`,
          'success',
        );

        return true;
      } catch (startError) {
        const message =
          String(startError);

        setError(message);

        logTelemetry(
          'WEB_RECOGNITION_START',
          `Failed to start Web Speech: ${message}`,
          'error',
        );

        emitPipelineTransition(
          JarvisPipelineStatus.ERROR,
          message,
        );

        recognitionRef.current = null;

        return false;
      }
    },
    [
      checkMicrophonePermission,
      destroyRecognition,
      emitPipelineTransition,
      getSpeechRecognitionConstructor,
      handleWakeWord,
      logTelemetry,
    ],
  );

  const startListening = useCallback(
    async (
      forceCommand = false,
    ) => {
      explicitStopRef.current = false;

      clearError();

      const mode: RecognitionMode =
        forceCommand ||
        !wakeWordEnabledRef.current
          ? 'command'
          : 'wake';

      /*
       * Android native implementation has priority.
       * This is what makes:
       *
       * Hey JARVIS
       *      ↓
       * Android SpeechRecognizer
       *      ↓
       * command
       *
       * work inside the APK.
       */
      if (native) {
        const permission =
          native.hasMicrophonePermission();

        if (permission === false) {
          setSpeechDiagnostics(
            (previous) => ({
              ...previous,
              microphonePermission:
                'denied',
            }),
          );

          setError(
            'Android microphone permission is required.',
          );

          emitPipelineTransition(
            JarvisPipelineStatus.ERROR,
            'Android microphone permission is not granted.',
          );

          return;
        }

        if (permission === true) {
          startNativeSession(mode);
          return;
        }
      }

      /*
       * If native Android is unavailable,
       * use the browser/WebView recognition
       * implementation as a fallback.
       */
      await startWebRecognition(mode);
    },
    [
      clearError,
      emitPipelineTransition,
      native,
      startNativeSession,
      startWebRecognition,
    ],
  );
    const resumeWakeWordStandby = useCallback(() => {
    explicitStopRef.current = false;

    setTranscript('');
    setInterimTranscript('');
    setError(null);
    setAudioLevel(0);

    if (!wakeWordEnabledRef.current) {
      logTelemetry(
        'WAKE_STANDBY',
        'Wake-word standby was requested, but wake word is disabled.',
        'warn',
      );

      return;
    }

    logTelemetry(
      'WAKE_STANDBY',
      'Resuming Hey JARVIS standby.',
      'info',
    );

    startListening(false);
  }, [
    logTelemetry,
    startListening,
  ]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
      return;
    }

    startListening(
      !wakeWordEnabledRef.current,
    );
  }, [
    isListening,
    startListening,
    stopListening,
  ]);

  const triggerWakeWordTest = useCallback(() => {
    logTelemetry(
      'WAKE_TEST',
      'Manual wake-word test triggered.',
      'info',
    );

    setIsWakeWordStandby(false);

    emitPipelineTransition(
      JarvisPipelineStatus.WAKE_DETECTED,
      'Manual wake-word test.',
    );

    onWakeWordDetectedRef.current?.();
  }, [
    emitPipelineTransition,
    logTelemetry,
  ]);

  /*
   * Listen for events coming from the native
   * Android JarvisSpeechService.
   */
  useEffect(() => {
    if (!native) {
      return;
    }

    const removeListener =
      native.onEvent((event) => {
        if (!mountedRef.current) {
          return;
        }

        switch (event.type) {
          case 'wake': {
            setIsWakeWordStandby(false);
            setIsListening(true);
            setCommandListeningActive(true);

            modeRef.current = 'command';
            setActiveModeState('command');

            setTranscript('');
            setInterimTranscript('');

            emitPipelineTransition(
              JarvisPipelineStatus.WAKE_DETECTED,
              'Android detected Hey JARVIS.',
            );

            onWakeWordDetectedRef.current?.();

            logTelemetry(
              'NATIVE_WAKE',
              'Android native wake-word event received.',
              'success',
            );

            break;
          }

          case 'partial': {
            setInterimTranscript(
              normalizeText(event.text),
            );

            setAudioLevel(0.55);

            logTelemetry(
              'NATIVE_PARTIAL',
              `Android partial result: "${event.text}"`,
              'info',
            );

            break;
          }

          case 'command': {
            const command =
              normalizeText(event.text);

            if (!command) {
              break;
            }

            setTranscript(command);
            setInterimTranscript('');
            setAudioLevel(0);

            setIsListening(true);
            setCommandListeningActive(true);

            modeRef.current = 'command';
            setActiveModeState('command');

            emitPipelineTransition(
              JarvisPipelineStatus.LISTENING,
              'Android native command received.',
            );

            logTelemetry(
              'NATIVE_COMMAND',
              `Android command: "${command}"`,
              'success',
            );

            onFinalTranscriptRef.current?.(
              command,
            );

            break;
          }

          case 'error': {
            const message =
              event.text ||
              'Android speech recognition failed.';

            setError(message);

            setSpeechDiagnostics(
              (previous) => ({
                ...previous,
                lastError: message,
                lastErrorTime:
                  new Date().toISOString(),
              }),
            );

            logTelemetry(
              'NATIVE_ERROR',
              message,
              'error',
            );

            emitPipelineTransition(
              JarvisPipelineStatus.ERROR,
              message,
            );

            break;
          }

          case 'microphone-granted': {
            setSpeechDiagnostics(
              (previous) => ({
                ...previous,
                microphonePermission:
                  'granted',
              }),
            );

            setError(null);

            logTelemetry(
              'MIC_PERMISSION',
              'Android microphone permission granted.',
              'success',
            );

            break;
          }

          case 'microphone-denied': {
            const message =
              event.text ||
              'Android microphone permission was denied.';

            setSpeechDiagnostics(
              (previous) => ({
                ...previous,
                microphonePermission:
                  'denied',
                lastError: message,
                lastErrorTime:
                  new Date().toISOString(),
              }),
            );

            setError(message);

            logTelemetry(
              'MIC_PERMISSION',
              message,
              'error',
            );

            emitPipelineTransition(
              JarvisPipelineStatus.ERROR,
              message,
            );

            break;
          }

          default:
            break;
        }
      });

    return removeListener;
  }, [
    emitPipelineTransition,
    logTelemetry,
    native,
  ]);

  useEffect(() => {
    if (
      wakeWordEnabled &&
      !isListening &&
      !explicitStopRef.current
    ) {
      setIsWakeWordStandby(false);
    }
  }, [
    isListening,
    wakeWordEnabled,
  ]);

  const isSupported =
    !!native ||
    !!getSpeechRecognitionConstructor();

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
