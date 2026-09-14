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


         
           
