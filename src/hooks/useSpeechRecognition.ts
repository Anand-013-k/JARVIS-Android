import { useCallback, useEffect, useRef, useState } from 'react';
import { getNativeJarvisBridge } from '../services/nativeBridge';
import type { JarvisPipelineStatus } from '../types/jarvis';

export type SpeechRecognitionMode = 'wake' | 'command';

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
  micPermission: 'granted' | 'denied' | 'prompt' | 'unknown';
  isSecureContext: boolean;
  isInIframe: boolean;
  exactError: string | null;

  lastEvent: string;
  lastEventTimestamp: number | null;
  lastInterim: string;
  lastFinal: string;

  confidenceScore: number | null;
  detectedLanguage: string | null;
  zeroWordsCaptured: boolean;

  isWebSpeechUnavailable: boolean;
  unavailableReason: string | null;

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
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface SpeechRecognitionEventMap {
  result: SpeechRecognitionEvent;
  error: SpeechRecognitionErrorEvent;
}

interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;

  start(): void;
  stop(): void;
  abort(): void;

  onstart: ((event: Event) => void) | null;
  onaudiostart: ((event: Event) => void) | null;
  onsoundstart: ((event: Event) => void) | null;
  onspeechstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onspeechend: ((event: Event) => void) | null;
  onsoundend: ((event: Event) => void) | null;
  onaudioend: ((event: Event) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const WAKE_WORD_PATTERN =
  /\b(?:hey|okay|ok|hi|hello)\s+jarvis\b/i;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsWakeWord(text: string): boolean {
  return WAKE_WORD_PATTERN.test(normalizeText(text));
}

function extractCommandAfterWakeWord(text: string): string {
  const match = normalizeText(text).match(
    /\b(?:hey|okay|ok|hi|hello)\s+jarvis\b(.*)$/i
  );

  return match?.[1]?.trim() ?? '';
}

function createEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
const initialEventCounts: SpeechDiagnostics['eventCounts'] = {
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
};

const initialDiagnostics: SpeechDiagnostics = {
  hasSpeechRecognition: false,
  hasWebkitSpeechRecognition: false,
  constructorUsed: 'none',
  micPermission: 'unknown',
  isSecureContext: false,
  isInIframe: false,
  exactError: null,

  lastEvent: '',
  lastEventTimestamp: null,
  lastInterim: '',
  lastFinal: '',

  confidenceScore: null,
  detectedLanguage: null,
  zeroWordsCaptured: false,

  isWebSpeechUnavailable: false,
  unavailableReason: null,

  eventCounts: initialEventCounts,
  eventLogs: [],
};

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (
    window.SpeechRecognition ??
    window.webkitSpeechRecognition ??
    null
  );
} 
function isAndroidNativeBridgeAvailable(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    (window as any).JARVIS_ANDROID
  );
}
function getConstructorName(): string {
  if (typeof window === 'undefined') {
    return 'none';
  }

  if (window.SpeechRecognition) {
    return 'SpeechRecognition';
  }

  if (window.webkitSpeechRecognition) {
    return 'webkitSpeechRecognition';
  }

  return 'none';
}

function getInitialDiagnostics(): SpeechDiagnostics {
  const constructor = getRecognitionConstructor();

  return {
    ...initialDiagnostics,
    hasSpeechRecognition: Boolean(constructor),
    hasWebkitSpeechRecognition: Boolean(
      typeof window !== 'undefined' &&
      window.webkitSpeechRecognition
    ),
    constructorUsed: getConstructorName(),
    isSecureContext:
      typeof window !== 'undefined'
        ? window.isSecureContext
        : false,
    isInIframe:
      typeof window !== 'undefined'
        ? window.self !== window.top
        : false,
    isWebSpeechUnavailable: !constructor,
    unavailableReason: constructor
      ? null
      : 'Web Speech API is unavailable on this device.',
    eventCounts: { ...initialEventCounts },
    eventLogs: [],
  };
}
export interface UseSpeechRecognitionOptions {
  wakeWordEnabled?: boolean;
  isSpeaking?: boolean;
  preferredInputDeviceId?: string | null;

  onCommandListeningStart?: () => void;
  onFinalTranscript?: (text: string) => void;
  onWakeWordDetected?: (trailingCommand?: string) => void;
  onPipelineTransition?: (
    from: JarvisPipelineStatus,
    to: JarvisPipelineStatus,
    reason?: string,
  ) => void;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
) {
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

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const sessionIdRef = useRef(0);
  const mountedRef = useRef(true);
  const restartTimerRef = useRef<number | null>(null);

  const modeRef = useRef<SpeechRecognitionMode>('wake');
  const wakeWordEnabledRef = useRef(wakeWordEnabled);
  const explicitStopRef = useRef(false);

  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onWakeWordDetectedRef = useRef(onWakeWordDetected);
  const onPipelineTransitionRef = useRef(onPipelineTransition);
  const onCommandListeningStartRef = useRef(
    onCommandListeningStart,
  );

  const previousPipelineRef = useRef<JarvisPipelineStatus>('STANDBY');

  const [isListening, setIsListening] = useState(false);
  const [commandListeningActive, setCommandListeningActive] =
    useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const [activeMode, setActiveModeState] =
    useState<SpeechRecognitionMode>('wake');

  const [isWakeWordStandby, setIsWakeWordStandby] =
    useState(false);

  const [isTranscribingFallback, setIsTranscribingFallback] =
    useState(false);

  const [pipelineStatus, setPipelineStatus] =
    useState<JarvisPipelineStatus>('STANDBY');

  const [diagnosticLogs, setDiagnosticLogs] = useState<
    DiagnosticEventLog[]
  >([]);

  const [speechDiagnostics, setSpeechDiagnostics] =
    useState<SpeechDiagnostics>(() => getInitialDiagnostics());

  useEffect(() => {
    wakeWordEnabledRef.current = wakeWordEnabled;
  }, [wakeWordEnabled]);

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
    onWakeWordDetectedRef.current = onWakeWordDetected;
    onPipelineTransitionRef.current = onPipelineTransition;
    onCommandListeningStartRef.current = onCommandListeningStart;
  }, [
    onFinalTranscript,
    onWakeWordDetected,
    onPipelineTransition,
    onCommandListeningStart,
  ]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }

      try {
        recognitionRef.current?.abort();
      } catch {
        // Ignore cleanup errors.
      }

      recognitionRef.current = null;
    };
  }, []);
    const logDiagnostic = useCallback(
    (
      event: string,
      details: string,
      level: DiagnosticEventLog['level'] = 'info',
    ) => {
      const entry: DiagnosticEventLog = {
        id: createEventId(),
        time: new Date().toLocaleTimeString(),
        event,
        details,
        level,
      };

      setDiagnosticLogs(prev => [
        ...prev.slice(-99),
        entry,
      ]);

      setSpeechDiagnostics(prev => ({
        ...prev,
        lastEvent: event,
        lastEventTimestamp: Date.now(),
        eventLogs: [
          ...prev.eventLogs.slice(-99),
          entry,
        ],
      }));
    },
    [],
  );

  const incrementEvent = useCallback(
    (
      event: keyof SpeechDiagnostics['eventCounts'],
    ) => {
      setSpeechDiagnostics(prev => ({
        ...prev,
        eventCounts: {
          ...prev.eventCounts,
          [event]: prev.eventCounts[event] + 1,
        },
        lastEvent: event,
        lastEventTimestamp: Date.now(),
      }));
    },
    [],
  );

  const transitionPipeline = useCallback(
    (
      next: JarvisPipelineStatus,
      reason?: string,
    ) => {
      const previous = previousPipelineRef.current;

      if (previous === next) {
        return;
      }

      previousPipelineRef.current = next;
      setPipelineStatus(next);

      onPipelineTransitionRef.current?.(
        previous,
        next,
        reason,
      );

      logDiagnostic(
        'pipeline',
        `${previous} → ${next}${
          reason ? ` (${reason})` : ''
        }`,
        'info',
      );
    },
    [logDiagnostic],
  );

  const updateDiagnostics = useCallback(
    (patch: Partial<SpeechDiagnostics>) => {
      setSpeechDiagnostics(prev => ({
        ...prev,
        ...patch,
      }));
    },
    [],
  );

  const clearError = useCallback(() => {
    setError(null);

    updateDiagnostics({
      exactError: null,
      zeroWordsCaptured: false,
    });
  }, [updateDiagnostics]);

  const clearDiagnosticLogs = useCallback(() => {
    setDiagnosticLogs([]);

    setSpeechDiagnostics(prev => ({
      ...prev,
      eventLogs: [],
      eventCounts: {
        ...initialEventCounts,
      },
    }));
  }, []);

  const setActiveMode = useCallback(
    (mode: SpeechRecognitionMode) => {
      modeRef.current = mode;
      setActiveModeState(mode);

      logDiagnostic(
        'mode-change',
        `Recognition mode changed to ${mode}.`,
        'info',
      );
    },
    [logDiagnostic],
  );

  const stopRecognitionInternal = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(
        restartTimerRef.current,
      );
      restartTimerRef.current = null;
    }

    const recognizer = recognitionRef.current;

    recognitionRef.current = null;

    if (recognizer) {
      try {
        recognizer.abort();
      } catch {
        // Ignore cleanup errors.
      }
    }

    setIsListening(false);
    setCommandListeningActive(false);
    setAudioLevel(0);
  }, []);
    const getPermissionState = useCallback(
    async (): Promise<
      'granted' | 'denied' | 'prompt' | 'unknown'
    > => {
      if (typeof navigator === 'undefined') {
        return 'unknown';
      }

      try {
        if (navigator.permissions?.query) {
          const permission =
            await navigator.permissions.query({
              name: 'microphone' as PermissionName,
            });

          if (permission.state === 'granted') {
            return 'granted';
          }

          if (permission.state === 'denied') {
            return 'denied';
          }

          return 'prompt';
        }
      } catch {
        // Some Android WebViews do not expose
        // microphone permission through Permissions API.
      }

      if (native) {
        try {
          const granted =
            native.hasMicrophonePermission();

          if (granted === true) {
            return 'granted';
          }

          if (granted === false) {
            return 'denied';
          }
        } catch {
          // Fall through to unknown.
        }
      }

      return 'unknown';
    },
    [native],
  );

  const refreshPermissionState = useCallback(
    async () => {
      const permission =
        await getPermissionState();

      updateDiagnostics({
        micPermission: permission,
      });

      logDiagnostic(
        'microphone-permission',
        `Microphone permission: ${permission}.`,
        permission === 'granted'
          ? 'success'
          : permission === 'denied'
            ? 'error'
            : 'info',
      );

      return permission;
    },
    [
      getPermissionState,
      updateDiagnostics,
      logDiagnostic,
    ],
  );

  const scheduleRestart = useCallback(
    (delay = 350) => {
      if (explicitStopRef.current) {
        return;
      }

      if (!wakeWordEnabledRef.current) {
        return;
      }

      if (isSpeaking) {
        return;
      }

      if (restartTimerRef.current !== null) {
        window.clearTimeout(
          restartTimerRef.current,
        );
      }

      restartTimerRef.current =
        window.setTimeout(() => {
          restartTimerRef.current = null;

          if (
            explicitStopRef.current ||
            !wakeWordEnabledRef.current ||
            isSpeaking ||
            !mountedRef.current
          ) {
            return;
          }

          startRecognition();
        }, delay);
    },
    [isSpeaking],
  );
    const createRecognizer = useCallback(
    (): SpeechRecognition | null => {
      const Constructor =
        getRecognitionConstructor();

      if (!Constructor) {
        updateDiagnostics({
          hasSpeechRecognition: false,
          isWebSpeechUnavailable: true,
          unavailableReason:
            'Web Speech API is unavailable on this device.',
          constructorUsed: 'none',
        });

        return null;
      }

      const recognizer = new Constructor();

      recognizer.continuous = false;
      recognizer.interimResults = true;
      recognizer.lang = 'en-US';
      recognizer.maxAlternatives = 3;

      updateDiagnostics({
        hasSpeechRecognition: true,
        hasWebkitSpeechRecognition:
          typeof window !== 'undefined' &&
          Boolean(window.webkitSpeechRecognition),
        constructorUsed: getConstructorName(),
        isWebSpeechUnavailable: false,
        unavailableReason: null,
        isSecureContext:
          typeof window !== 'undefined'
            ? window.isSecureContext
            : false,
        isInIframe:
          typeof window !== 'undefined'
            ? window.self !== window.top
            : false,
      });

      return recognizer;
    },
    [updateDiagnostics],
  );

  const handleFinalResult = useCallback(
    (text: string) => {
      const cleanText = text.trim();

      if (!cleanText) {
        updateDiagnostics({
          zeroWordsCaptured: true,
        });

        return;
      }

      setTranscript(cleanText);

      updateDiagnostics({
        lastFinal: cleanText,
        confidenceScore:
          speechDiagnostics.confidenceScore,
        zeroWordsCaptured: false,
      });

      logDiagnostic(
        'final-transcript',
        cleanText,
        'success',
      );

      if (modeRef.current === 'wake') {
        if (!wakeWordEnabledRef.current) {
          return;
        }

        if (!containsWakeWord(cleanText)) {
          return;
        }

        const trailingCommand =
          extractCommandAfterWakeWord(cleanText);

        transitionPipeline(
          'WAKE_DETECTED',
          'Wake phrase recognized.',
        );

        setIsWakeWordStandby(false);

        onWakeWordDetectedRef.current?.(
          trailingCommand || undefined,
        );

                        if (trailingCommand) {
          onFinalTranscriptRef.current?.(
            trailingCommand,
          );
        }

        return;
      }

      transitionPipeline(
        'PROCESSING',
        'Final command captured.',
      );

      onFinalTranscriptRef.current?.(
        cleanText,
      );
    },
    [
      logDiagnostic,
      speechDiagnostics.confidenceScore,
      transitionPipeline,
      updateDiagnostics,
    ],
  );
        const startRecognition = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    if (explicitStopRef.current) {
      return;
    }

    if (isSpeaking) {
      return;
    }
    if (native) {
      const mode = modeRef.current;

      setError(null);
      setTranscript('');
      setInterimTranscript('');
      setAudioLevel(0);

      if (mode === 'wake') {
        setIsWakeWordStandby(true);
        setCommandListeningActive(false);

        transitionPipeline(
          'STANDBY',
          'Starting Android native wake-word standby.',
        );
      } else {
        setIsWakeWordStandby(false);
        setCommandListeningActive(true);

        transitionPipeline(
          'LISTENING',
          'Starting Android native command listening.',
        );

        onCommandListeningStartRef.current?.();
      }

      try {
        native.start(mode);

        setIsListening(true);

        logDiagnostic(
          'native-start',
          `Android native speech service started in ${mode} mode.`,
          'success',
        );
      } catch (startError) {
        const message =
          startError instanceof Error
            ? startError.message
            : 'Unable to start Android native speech service.';

        setError(message);

        updateDiagnostics({
          exactError: message,
        });

        logDiagnostic(
          'native-start-error',
          message,
          'error',
        );

        transitionPipeline(
          'STANDBY',
          'Android native speech service failed to start.',
        );
      }

      return;
    }
    if (
      modeRef.current === 'wake' &&
      !wakeWordEnabledRef.current
    ) {
      setIsWakeWordStandby(false);
      return;
    }

    stopRecognitionInternal();

    const recognizer = createRecognizer();

    if (!recognizer) {
      setError(
        'Speech recognition is unavailable.',
      );

      transitionPipeline(
        'STANDBY',
        'No speech recognition engine available.',
      );

      return;
    }

    const sessionId =
      ++sessionIdRef.current;

    recognitionRef.current = recognizer;

    const mode =
      modeRef.current;

    setError(null);
    setTranscript('');
    setInterimTranscript('');
    setAudioLevel(0);

    if (mode === 'wake') {
      setIsWakeWordStandby(true);
      setCommandListeningActive(false);

      transitionPipeline(
        'STANDBY',
        'Starting wake-word standby.',
      );
    } else {
      setIsWakeWordStandby(false);
      setCommandListeningActive(true);

      transitionPipeline(
        'LISTENING',
        'Starting command listening.',
      );

      onCommandListeningStartRef.current?.();
    }

    const isCurrentSession = () =>
      mountedRef.current &&
      sessionId === sessionIdRef.current;

    recognizer.onstart = () => {
      if (!isCurrentSession()) {
        return;
      }

      incrementEvent('onstart');

      setIsListening(true);

      logDiagnostic(
        'onstart',
        `Speech recognition started in ${mode} mode.`,
        'success',
      );
    };

    recognizer.onaudiostart = () => {
      if (!isCurrentSession()) {
        return;
      }

      incrementEvent('onaudiostart');

      logDiagnostic(
        'onaudiostart',
        'Audio capture started.',
        'info',
      );
    };

    recognizer.onsoundstart = () => {
      if (!isCurrentSession()) {
        return;
      }

      incrementEvent('onsoundstart');

      setAudioLevel(prev =>
        Math.max(prev, 0.15),
      );
    };

    recognizer.onspeechstart = () => {
      if (!isCurrentSession()) {
        return;
      }

      incrementEvent('onspeechstart');

      setAudioLevel(prev =>
        Math.max(prev, 0.35),
      );

      logDiagnostic(
        'onspeechstart',
        'Speech detected.',
        'info',
      );
    };      
              recognizer.onresult = event => {
      if (!isCurrentSession()) {
        return;
      }

      incrementEvent('onresult');

      let finalText = '';
      let interimText = '';
      let bestConfidence: number | null = null;

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i += 1
      ) {
        const result = event.results[i];

        if (!result || result.length === 0) {
          continue;
        }

        const alternative = result[0];

        if (!alternative) {
          continue;
        }

        const text =
          alternative.transcript.trim();

        if (!text) {
          continue;
        }

        if (
          typeof alternative.confidence ===
            'number' &&
          alternative.confidence >= 0
        ) {
          bestConfidence =
            alternative.confidence;
        }

        if (result.isFinal) {
          finalText +=
            `${text} `;
        } else {
          interimText +=
            `${text} `;
        }
      }

      const cleanInterim =
        interimText.trim();

      const cleanFinal =
        finalText.trim();

      if (cleanInterim) {
        setInterimTranscript(
          cleanInterim,
        );

        updateDiagnostics({
          lastInterim: cleanInterim,
          zeroWordsCaptured: false,
          confidenceScore:
            bestConfidence,
        });

        setAudioLevel(0.65);

        logDiagnostic(
          'interim-result',
          cleanInterim,
          'info',
        );

        if (
          mode === 'wake' &&
          containsWakeWord(cleanInterim)
        ) {
          const trailingCommand =
            extractCommandAfterWakeWord(
              cleanInterim,
            );

          transitionPipeline(
            'WAKE_DETECTED',
            'Wake phrase detected in interim speech.',
          );

          setIsWakeWordStandby(false);

          onWakeWordDetectedRef.current?.(
            trailingCommand ||
              undefined,
          );

          if (trailingCommand) {
            onFinalTranscriptRef.current?.(
              trailingCommand,
            );
          }
        }
      }

      if (cleanFinal) {
        setInterimTranscript('');

        if (
          bestConfidence !== null
        ) {
          updateDiagnostics({
            confidenceScore:
              bestConfidence,
          });
        }

        handleFinalResult(
          cleanFinal,
        );
      }
    };

    recognizer.onspeechend = () => {
      if (!isCurrentSession()) {
        return;
      }

      incrementEvent('onspeechend');

      setAudioLevel(0.2);

      logDiagnostic(
        'onspeechend',
        'Speech input ended.',
        'info',
      );
    };

    recognizer.onsoundend = () => {
      if (!isCurrentSession()) {
        return;
      }

      incrementEvent('onsoundend');

      setAudioLevel(0);
    };

    recognizer.onaudioend = () => {
      if (!isCurrentSession()) {
        return;
      }

      incrementEvent('onaudioend');

      setAudioLevel(0);

      logDiagnostic(
        'onaudioend',
        'Audio capture ended.',
        'info',
      );
    };
             recognizer.onerror = event => {
      if (!isCurrentSession()) {
        return;
      }

      incrementEvent('onerror');

      const errorCode =
        event?.error || 'unknown';

      const errorMessage =
        event?.message ||
        `Speech recognition error: ${errorCode}`;

      updateDiagnostics({
        exactError: errorMessage,
        zeroWordsCaptured:
          !transcript.trim() &&
          !interimTranscript.trim(),
      });

      setError(errorMessage);

      logDiagnostic(
        'onerror',
        errorMessage,
        'error',
      );

      if (
        errorCode === 'not-allowed' ||
        errorCode === 'service-not-allowed'
      ) {
        updateDiagnostics({
          micPermission: 'denied',
        });

        setIsListening(false);
        setCommandListeningActive(false);
        setIsWakeWordStandby(false);

        transitionPipeline(
          'STANDBY',
          'Microphone permission was denied.',
        );

        return;
      }

      if (
        errorCode === 'audio-capture'
      ) {
        logDiagnostic(
          'audio-capture-error',
          'The microphone could not be opened.',
          'error',
        );
      }

      if (
        errorCode === 'no-speech'
      ) {
        logDiagnostic(
          'no-speech',
          'No speech was detected.',
          'warn',
        );
      }

      if (
        errorCode === 'network'
      ) {
        logDiagnostic(
          'network-error',
          'Speech recognition service reported a network error.',
          'warn',
        );
      }
    };

    recognizer.onend = () => {
      if (!isCurrentSession()) {
        return;
      }

      incrementEvent('onend');

      recognitionRef.current = null;

      setIsListening(false);
      setAudioLevel(0);

      logDiagnostic(
        'onend',
        `Recognition session ended in ${mode} mode.`,
        'info',
      );

      if (
        explicitStopRef.current
      ) {
        setCommandListeningActive(false);
        setIsWakeWordStandby(false);

        transitionPipeline(
          'STANDBY',
          'Recognition stopped explicitly.',
        );

        return;
      }

      if (!mountedRef.current) {
        return;
      }

      if (isSpeaking) {
        setCommandListeningActive(false);
        setIsWakeWordStandby(false);

        transitionPipeline(
          'SPEAKING',
          'Waiting while JARVIS is speaking.',
        );

        return;
      }

      if (mode === 'command') {
        setCommandListeningActive(false);

        transitionPipeline(
          'STANDBY',
          'Command recognition session ended.',
        );

        setIsWakeWordStandby(false);

        return;
      }

      if (
        mode === 'wake' &&
        wakeWordEnabledRef.current
      ) {
        setCommandListeningActive(false);
        setIsWakeWordStandby(true);

        transitionPipeline(
          'STANDBY',
          'Restarting wake-word standby.',
        );

        scheduleRestart(400);
      }
    };

    try {
      recognizer.start();

      logDiagnostic(
        'recognizer-start',
        `Recognizer start requested for ${mode} mode.`,
        'info',
      );
    } catch (startError) {
      if (!isCurrentSession()) {
        return;
      }

      const message =
        startError instanceof Error
          ? startError.message
          : 'Unable to start speech recognition.';

      setError(message);

      updateDiagnostics({
        exactError: message,
      });

      logDiagnostic(
        'start-failed',
        message,
        'error',
      );

      recognitionRef.current = null;
      setIsListening(false);
      setCommandListeningActive(false);

      transitionPipeline(
        'STANDBY',
        'Recognizer failed to start.',
      );

      scheduleRestart(1000);
    }, [
    native,
    createRecognizer,
    handleFinalResult,
    incrementEvent,
    isSpeaking,
    logDiagnostic,
    scheduleRestart,
    stopRecognitionInternal,
    transitionPipeline,
    transcript,
    interimTranscript,
    updateDiagnostics,
  ]);
        const startCommandListening = useCallback(
    () => {
      if (!mountedRef.current) {
        return;
      }

      if (isSpeaking) {
        return;
      }

      explicitStopRef.current = false;
      modeRef.current = 'command';
      setActiveModeState('command');

      setIsWakeWordStandby(false);
      setCommandListeningActive(true);
      setTranscript('');
      setInterimTranscript('');
      setError(null);

      transitionPipeline(
        'LISTENING',
        'Command listening started.',
      );

      onCommandListeningStartRef.current?.();

      logDiagnostic(
        'command-start',
        'Starting command recognition.',
        'success',
      );

      startRecognition();
    },
    [
      isSpeaking,
      logDiagnostic,
      startRecognition,
      transitionPipeline,
    ],
  );

  const resumeWakeWordStandby =
    useCallback(() => {
      if (!mountedRef.current) {
        return;
      }

      if (isSpeaking) {
        return;
      }

      if (!wakeWordEnabledRef.current) {
        setIsWakeWordStandby(false);
        setCommandListeningActive(false);

        transitionPipeline(
          'STANDBY',
          'Wake-word standby disabled.',
        );

        return;
      }

      explicitStopRef.current = false;
      modeRef.current = 'wake';
      setActiveModeState('wake');

      setCommandListeningActive(false);
      setIsWakeWordStandby(true);
      setTranscript('');
      setInterimTranscript('');
      setError(null);

      transitionPipeline(
        'STANDBY',
        'Wake-word standby resumed.',
      );

      logDiagnostic(
        'wake-standby',
        'Resuming wake-word standby.',
        'success',
      );

      startRecognition();
    },
    [
      isSpeaking,
      logDiagnostic,
      startRecognition,
      transitionPipeline,
    ],
  );

  const stopListening =
    useCallback(() => {
      explicitStopRef.current = true;

      sessionIdRef.current += 1;

      stopRecognitionInternal();

      modeRef.current = 'wake';
      setActiveModeState('wake');

      setIsWakeWordStandby(false);
      setCommandListeningActive(false);
      setInterimTranscript('');
      setAudioLevel(0);

      transitionPipeline(
        'STANDBY',
        'Listening stopped by user.',
      );

      logDiagnostic(
        'manual-stop',
        'Speech recognition stopped.',
        'warn',
      );
    }, [
      logDiagnostic,
      stopRecognitionInternal,
      transitionPipeline,
    ]);

  const startListening =
    useCallback(() => {
      explicitStopRef.current = false;

      if (
        wakeWordEnabledRef.current
      ) {
        modeRef.current = 'wake';
        setActiveModeState('wake');
        startRecognition();
        return;
      }

      startCommandListening();
    }, [
      startCommandListening,
      startRecognition,
    ]);

  const toggleListening =
    useCallback(() => {
      if (isListening) {
        stopListening();
        return;
      }

      startListening();
    }, [
      isListening,
      startListening,
      stopListening,
    ]);

  const triggerWakeWordTest =
    useCallback(() => {
      if (!mountedRef.current) {
        return;
      }

      logDiagnostic(
        'wake-test',
        'Manual wake-word test triggered.',
        'success',
      );

      transitionPipeline(
        'WAKE_DETECTED',
        'Manual wake-word test.',
      );

      setIsWakeWordStandby(false);

      onWakeWordDetectedRef.current?.();
    }, [
      logDiagnostic,
      transitionPipeline,
    ]);
             useEffect(() => {
    let cancelled = false;

    const checkPermission = async () => {
      const permission =
        await getPermissionState();

      if (cancelled) {
        return;
      }

      updateDiagnostics({
        micPermission: permission,
      });
    };

    checkPermission();

    return () => {
      cancelled = true;
    };
  }, [
    getPermissionState,
    updateDiagnostics,
  ]);

  useEffect(() => {
    if (!wakeWordEnabled) {
      explicitStopRef.current = true;

      sessionIdRef.current += 1;

      stopRecognitionInternal();

      modeRef.current = 'wake';

      setActiveModeState('wake');
      setIsWakeWordStandby(false);
      setCommandListeningActive(false);

      transitionPipeline(
        'STANDBY',
        'Wake-word detection disabled.',
      );

      logDiagnostic(
        'wake-disabled',
        'Wake-word standby disabled.',
        'warn',
      );

      return;
    }

    if (
      isSpeaking ||
      explicitStopRef.current
    ) {
      return;
    }

    if (
      modeRef.current === 'wake' &&
      !isListening &&
      !isWakeWordStandby
    ) {
      explicitStopRef.current = false;

      logDiagnostic(
        'wake-enabled',
        'Wake-word standby enabled.',
        'success',
      );

      startRecognition();
    }
  }, [
    isSpeaking,
    isListening,
    isWakeWordStandby,
    wakeWordEnabled,
    startRecognition,
    stopRecognitionInternal,
    transitionPipeline,
    logDiagnostic,
  ]);

  useEffect(() => {
    if (!isSpeaking) {
      return;
    }

    if (
      recognitionRef.current
    ) {
      sessionIdRef.current += 1;

      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore recognition cleanup errors.
      }

      recognitionRef.current = null;
    }

    setIsListening(false);
    setCommandListeningActive(false);
    setIsWakeWordStandby(false);
    setAudioLevel(0);

    transitionPipeline(
      'SPEAKING',
      'Recognition paused while JARVIS is speaking.',
    );
  }, [
    isSpeaking,
    transitionPipeline,
  ]);

  useEffect(() => {
    if (
      !preferredInputDeviceId ||
      typeof navigator === 'undefined'
    ) {
      return;
    }

    logDiagnostic(
      'input-device',
      `Preferred input device: ${preferredInputDeviceId}`,
      'info',
    );
  }, [
    preferredInputDeviceId,
    logDiagnostic,
  ]);
  useEffect(() => {
    if (!native) {
      return;
    }

    const unsubscribe =
      native.onEvent(event => {
        if (!mountedRef.current) {
          return;
        }

        if (event.type === 'listening') {
          const nativeMode =
            event.text === 'command'
              ? 'command'
              : 'wake';

          modeRef.current = nativeMode;
          setActiveModeState(nativeMode);
          setIsListening(true);

          if (nativeMode === 'wake') {
            setIsWakeWordStandby(true);
            setCommandListeningActive(false);

            transitionPipeline(
              'STANDBY',
              'Android native wake standby is listening.',
            );
          } else {
            setIsWakeWordStandby(false);
            setCommandListeningActive(true);

            transitionPipeline(
              'LISTENING',
              'Android native command recognizer is listening.',
            );
          }

          logDiagnostic(
            'native-listening',
            `Android native recognizer listening in ${nativeMode} mode.`,
            'success',
          );
        }

        if (event.type === 'partial') {
          setInterimTranscript(event.text);
          setAudioLevel(0.65);

          updateDiagnostics({
            lastInterim: event.text,
            zeroWordsCaptured: false,
          });

          logDiagnostic(
            'native-partial',
            event.text,
            'info',
          );
        }

                if (event.type === 'wake') {
          setIsListening(true);
          setIsWakeWordStandby(false);
          setCommandListeningActive(true);

          transitionPipeline(
            'WAKE_DETECTED',
            'Android native wake phrase detected.',
          );

          logDiagnostic(
            'native-wake',
            'Android native wake phrase detected.',
            'success',
          );

          onWakeWordDetectedRef.current?.();
          }

                if (event.type === 'command') {
          const commandText = event.text.trim();

          setTranscript(commandText);
          setInterimTranscript('');
          setIsListening(false);
          setCommandListeningActive(false);
          setIsWakeWordStandby(false);
          setAudioLevel(0);

          updateDiagnostics({
            lastFinal: commandText,
            zeroWordsCaptured: !commandText,
          });

          transitionPipeline(
            'PROCESSING',
            'Android native command captured.',
          );

          logDiagnostic(
            'native-command',
            commandText,
            'success',
          );

          if (commandText) {
            onFinalTranscriptRef.current?.(commandText);
          }
                }

        if (event.type === 'error') {
          setError(event.text);

          updateDiagnostics({
            exactError: event.text,
          });

          logDiagnostic(
            'native-error',
            event.text,
            'error',
          );
        }

        if (event.type === 'microphone-granted') {
          updateDiagnostics({
            micPermission: 'granted',
            exactError: null,
          });

          logDiagnostic(
            'native-microphone',
            'Android microphone permission granted.',
            'success',
          );
        }

        if (
          event.type ===
          'microphone-denied'
        ) {
          updateDiagnostics({
            micPermission: 'denied',
            exactError:
              event.text ||
              'Android microphone permission denied.',
          });

          setError(
            event.text ||
              'Android microphone permission denied.',
          );

          logDiagnostic(
            'native-microphone',
            event.text ||
              'Android microphone permission denied.',
            'error',
          );
        }
      });

    return unsubscribe;
  }, [
    native,
    updateDiagnostics,
    logDiagnostic,
    transitionPipeline,
  ]);
              const logTelemetry = useCallback(
    (
      message: string,
      level:
        | 'info'
        | 'success'
        | 'warn'
        | 'error' = 'info',
    ) => {
      logDiagnostic(
        'telemetry',
        message,
        level,
      );
    },
    [logDiagnostic],
  );

  const emitPipelineTransition =
    useCallback(
      (
        from: JarvisPipelineStatus,
        to: JarvisPipelineStatus,
        reason?: string,
      ) => {
        const current =
          previousPipelineRef.current;

        if (current !== from) {
          logDiagnostic(
            'pipeline-sync',
            `Expected ${from}, current ${current}.`,
            'warn',
          );
        }

        transitionPipeline(
          to,
          reason,
        );
      },
      [
        logDiagnostic,
        transitionPipeline,
      ],
    );

  const resumeAfterSpeaking =
    useCallback(() => {
      if (!mountedRef.current) {
        return;
      }

      if (isSpeaking) {
        return;
      }

      if (
        wakeWordEnabledRef.current
      ) {
        resumeWakeWordStandby();
        return;
      }

      transitionPipeline(
        'STANDBY',
        'Ready for manual command input.',
      );

      logDiagnostic(
        'ready',
        'JARVIS is ready for the next command.',
        'success',
      );
    }, [
      isSpeaking,
      logDiagnostic,
      resumeWakeWordStandby,
      transitionPipeline,
    ]);

  const resetRecognitionState =
    useCallback(() => {
      setTranscript('');
      setInterimTranscript('');
      setAudioLevel(0);
      setError(null);

      updateDiagnostics({
        lastInterim: '',
        lastFinal: '',
        zeroWordsCaptured: false,
        exactError: null,
      });
    }, [updateDiagnostics]);

  const getPipelineStatus =
    useCallback(() => {
      return pipelineStatus;
    }, [pipelineStatus]);

  const isCommandListening =
    useCallback(() => {
      return (
        modeRef.current ===
          'command' &&
        commandListeningActive
      );
    }, [
      commandListeningActive,
    ]);

  const isWakeStandbyActive =
    useCallback(() => {
      return (
        modeRef.current === 'wake' &&
        isWakeWordStandby &&
        wakeWordEnabledRef.current
      );
    }, [
      isWakeWordStandby,
    ]);

  useEffect(() => {
    if (
      pipelineStatus ===
        'PROCESSING'
    ) {
      logDiagnostic(
        'processing',
        'Speech input has been handed to JARVIS processing.',
        'info',
      );
    }

    if (
      pipelineStatus ===
        'SPEAKING'
    ) {
      logDiagnostic(
        'speaking',
        'JARVIS is speaking. Microphone recognition remains paused.',
        'info',
      );
    }
  }, [
    pipelineStatus,
    logDiagnostic,
  ]);
            const requestMicrophone =
    useCallback(async () => {
      const permission =
        await getPermissionState();

      if (permission === 'granted') {
        updateDiagnostics({
          micPermission: 'granted',
        });

        return true;
      }

      if (
        native &&
        permission !== 'denied'
      ) {
        try {
          native.start('wake');

          logDiagnostic(
            'native-microphone-request',
            'Requested Android microphone access.',
            'info',
          );

          return true;
        } catch (requestError) {
          const message =
            requestError instanceof Error
              ? requestError.message
              : 'Unable to request microphone access.';

          setError(message);

          updateDiagnostics({
            exactError: message,
          });

          logDiagnostic(
            'native-microphone-error',
            message,
            'error',
          );
        }
      }

      if (
        typeof navigator !==
          'undefined' &&
        navigator.mediaDevices?.getUserMedia
      ) {
        try {
          const stream =
            await navigator.mediaDevices.getUserMedia(
              { audio: true },
            );

          stream
            .getTracks()
            .forEach(track => track.stop());

          updateDiagnostics({
            micPermission: 'granted',
            exactError: null,
          });

          logDiagnostic(
            'microphone-request',
            'Browser microphone access granted.',
            'success',
          );

          return true;
        } catch (requestError) {
          const errorName =
            requestError &&
            typeof requestError === 'object' &&
            'name' in requestError
              ? String(
                  (
                    requestError as {
                      name?: string;
                    }
                  ).name ?? '',
                )
              : '';

          const message =
            requestError instanceof Error
              ? requestError.message
              : 'Microphone permission was not granted.';

          updateDiagnostics({
            micPermission:
              errorName === 'NotAllowedError'
                ? 'denied'
                : 'unknown',
            exactError: message,
          });

          setError(message);

          logDiagnostic(
            'microphone-request-error',
            message,
            'error',
          );

          return false;
        }
      }

      const unavailable =
        'Microphone access is unavailable on this device.';

      updateDiagnostics({
        exactError: unavailable,
        isWebSpeechUnavailable: true,
        unavailableReason: unavailable,
      });

      setError(unavailable);

      logDiagnostic(
        'microphone-unavailable',
        unavailable,
        'error',
      );

      return false;
    }, [
      getPermissionState,
      logDiagnostic,
      native,
      updateDiagnostics,
    ]);

  const setWakeWordEnabled =
    useCallback(
      (enabled: boolean) => {
        wakeWordEnabledRef.current =
          enabled;

        if (!enabled) {
          explicitStopRef.current =
            true;

          sessionIdRef.current += 1;

          stopRecognitionInternal();

          modeRef.current = 'wake';

          setActiveModeState('wake');
          setIsWakeWordStandby(false);
          setCommandListeningActive(
            false,
          );

          transitionPipeline(
            'STANDBY',
            'Wake-word detection disabled.',
          );

          logDiagnostic(
            'wake-toggle',
            'Wake-word detection disabled.',
            'warn',
          );

          return;
        }

        explicitStopRef.current =
          false;

        modeRef.current = 'wake';

        setActiveModeState('wake');
        setIsWakeWordStandby(true);

        logDiagnostic(
          'wake-toggle',
          'Wake-word detection enabled.',
          'success',
        );

        startRecognition();
      },
      [
        logDiagnostic,
        startRecognition,
        stopRecognitionInternal,
        transitionPipeline,
      ],
    );
           useEffect(() => {
    if (!mountedRef.current) {
      return;
    }

    if (
      !wakeWordEnabled ||
      isSpeaking
    ) {
      return;
    }

    if (
      modeRef.current !== 'wake'
    ) {
      return;
    }

    if (
      isListening ||
      isWakeWordStandby
    ) {
      return;
    }

    explicitStopRef.current = false;

    setIsWakeWordStandby(true);

    logDiagnostic(
      'wake-auto-resume',
      'Wake-word standby is being restored.',
      'info',
    );

    startRecognition();
  }, [
    wakeWordEnabled,
    isSpeaking,
    isListening,
    isWakeWordStandby,
    startRecognition,
    logDiagnostic,
  ]);

  useEffect(() => {
    if (!mountedRef.current) {
      return;
    }

    if (
      pipelineStatus !==
      'WAKE_DETECTED'
    ) {
      return;
    }

    if (
      modeRef.current !== 'wake'
    ) {
      return;
    }

    modeRef.current = 'command';
    setActiveModeState('command');
    setIsWakeWordStandby(false);

    if (
      !isListening &&
      !isSpeaking
    ) {
      startRecognition();
    }
  }, [
    pipelineStatus,
    isListening,
    isSpeaking,
    startRecognition,
  ]);

  useEffect(() => {
    if (
      pipelineStatus !==
      'LISTENING'
    ) {
      return;
    }

    setCommandListeningActive(
      modeRef.current === 'command',
    );
  }, [pipelineStatus]);

  useEffect(() => {
    if (
      pipelineStatus ===
      'STANDBY'
    ) {
      setAudioLevel(0);
    }
  }, [pipelineStatus]);

  useEffect(() => {
    const constructor =
      getRecognitionConstructor();

    const unavailable =
      !constructor;

    updateDiagnostics({
      hasSpeechRecognition:
        !unavailable,
      hasWebkitSpeechRecognition:
        typeof window !==
          'undefined' &&
        Boolean(
          window.webkitSpeechRecognition,
        ),
      constructorUsed:
        getConstructorName(),
      isWebSpeechUnavailable:
        unavailable,
      unavailableReason:
        unavailable
          ? 'Web Speech API is unavailable on this device.'
          : null,
    });
  }, [updateDiagnostics]);

  useEffect(() => {
    if (
      typeof document ===
      'undefined'
    ) {
      return;
    }

    const handleVisibility =
      () => {
        if (
          document.hidden
        ) {
          logDiagnostic(
            'visibility',
            'JARVIS web interface became hidden.',
            'info',
          );
        } else {
          logDiagnostic(
            'visibility',
            'JARVIS web interface became visible.',
            'info',
          );
        }
      };

    document.addEventListener(
      'visibilitychange',
      handleVisibility,
    );

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleVisibility,
      );
    };
  }, [logDiagnostic]);

  return {
    isListening,
    commandListeningActive,
    transcript,
    interimTranscript,
    isSupported:
      speechDiagnostics.hasSpeechRecognition,
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
    startCommandListening,
    resumeWakeWordStandby,
    resumeAfterSpeaking,
    isWakeWordStandby,
    pipelineStatus,
    hookPipelineStatus:
      pipelineStatus,
    logTelemetry,
    emitPipelineTransition,
    triggerWakeWordTest,
    refreshPermissionState,
    requestMicrophone,
    setWakeWordEnabled,
    resetRecognitionState,
    getPipelineStatus,
    isCommandListening,
    isWakeStandbyActive,
  };
}
