import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Radio,
  Sliders,
  Smartphone,
  Maximize2,
  Minimize2,
  BrainCircuit,
  Bell,
  Layers,
  Terminal,
  Volume2,
  VolumeX,
  Sparkles,
  Shield,
  Activity,
  AlertCircle,
  MessageSquare,
  Bug,
} from 'lucide-react';
import {
  AssistantState,
  DeviceState,
  MemoryItem,
  ReminderItem,
  JarvisNote,
  Message,
  JarvisContext,
  JarvisPipelineStatus,
} from './types/jarvis';
import { toolRegistry } from './services/toolRegistry';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { useAudioRouting } from './hooks/useAudioRouting';
import { ArcReactorCore } from './components/ArcReactorCore';
import { AndroidStatusBar } from './components/AndroidStatusBar';
import { DeviceControlsCard } from './components/DeviceControlsCard';
import { MemoryBankCard } from './components/MemoryBankCard';
import { RemindersCard } from './components/RemindersCard';
import { ModularToolsDrawer } from './components/ModularToolsDrawer';
import { ConversationHUD } from './components/ConversationHUD';
import { SpeechDiagnosticPanel } from './components/SpeechDiagnosticPanel';
import { WakeWordControlCard } from './components/WakeWordControlCard';
import { apiUrl } from './services/api';
import { installNativeJarvisBridge } from './services/nativeBridge';

// Web Audio API sci-fi cybernetic sound generator
function playSciFiChime(type: 'activate' | 'acknowledge' | 'alert' | 'wakeword') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'wakeword' || type === 'activate') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'acknowledge') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'alert') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.setValueAtTime(600, now + 0.1);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch {}
}

export default function App() {
  // State: Messages & Chat history
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg_welcome',
      role: 'assistant',
      content:
        "Good day, sir. Subsystems are online and operating within nominal parameters.",
      timestamp: Date.now(),
    },
  ]);

  // State: Android Simulated Hardware
  const [deviceState, setDeviceState] = useState<DeviceState>({
    flashlight: false,
    volume: 75,
    wifi: true,
    bluetooth: true,
    brightness: 80,
    batteryLevel: 88,
    batterySaver: false,
    activeApp: null,
    doNotDisturb: false,
  });

  // State: Long-term Memory Bank
  const [memories, setMemories] = useState<MemoryItem[]>([
    {
      id: 'mem_1',
      key: 'user_designation',
      value: 'Tony',
      category: 'personal',
      timestamp: Date.now() - 3600000,
    },
    {
      id: 'mem_2',
      key: 'coffee_preference',
      value: 'Double espresso with no sugar',
      category: 'preference',
      timestamp: Date.now() - 7200000,
    },
  ]);

  // State: Reminders & Alarms
  const [reminders, setReminders] = useState<ReminderItem[]>([
    {
      id: 'rem_1',
      title: 'Review flight telemetry & diagnostics',
      dueTimestamp: Date.now() + 25 * 60 * 1000,
      completed: false,
      priority: 'normal',
      createdAt: Date.now() - 10000,
    },
  ]);

  // State: Notes
  const [notes, setNotes] = useState<JarvisNote[]>([]);

  // State: Navigation & View Layout
  const [viewMode, setViewMode] = useState<'mobile' | 'fullscreen'>('mobile');
  const [activeTab, setActiveTab] = useState<'core' | 'device' | 'memory' | 'reminders' | 'modular'>('core');
  const [toastNotification, setToastNotification] = useState<{ title: string; message: string } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(true);

  // State: Wake Word ("Hey JARVIS") - defaults to true so JARVIS is ALWAYS READY
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [wakeDetected, setWakeDetected] = useState(false);
  const resumeWakeWordStandbyRef = useRef<() => void>(() => {});
  const logTelemetryRef = useRef<((msg: string, level?: 'info' | 'success' | 'warn' | 'error') => void) | null>(null);
  const emitPipelineTransitionRef = useRef<((from: JarvisPipelineStatus, to: JarvisPipelineStatus, reason?: string) => void) | null>(null);

  // Audio Routing Hook (Bluetooth-aware, hands-free always-ready)
  const audioRouting = useAudioRouting({
    onTelemetry: (event, detail, level = 'info') => {
      logTelemetryRef.current?.(`${event}: ${detail}`, level);
    },
  });

  // State: Assistant Process status
  const [isProcessing, setIsProcessing] = useState(false);
  const handleProcessDirectiveRef = useRef<((text: string) => void) | null>(null);

  // Notification helper
  const notify = useCallback((title: string, message: string) => {
    setToastNotification({ title, message });
    setTimeout(() => {
      setToastNotification(null);
    }, 4000);
  }, []);

  // Context for modular tools
  const jarvisContext: JarvisContext = {
    deviceState,
    setDeviceState,
    memories,
    setMemories,
    reminders,
    setReminders,
    notes,
    setNotes,
    notify,
  };

  // Natural Speech Synthesis Hook
  const {
    speak,
    stop: stopSpeaking,
    isSpeaking,
    isMuted,
    toggleMute,
    speakingPulse,
    rate: speechRate,
    setRate: setSpeechRate,
    pitch: speechPitch,
    setPitch: setSpeechPitch,
  } = useSpeechSynthesis();

  // Assistant overall state calculation
  const assistantState: AssistantState = isSpeaking
    ? 'speaking'
    : isProcessing
    ? 'processing'
    : 'idle';

  // Handle message submission to server
  const handleProcessDirective = useCallback(
    async (text: string) => {
      if (!text || !text.trim() || isProcessing) return;

      const userText = text.trim();
      stopSpeaking();

      // Append user message to stream
      const userMsg: Message = {
        id: `usr_${Date.now()}`,
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);
      setIsProcessing(true);
      playSciFiChime('acknowledge');

      try {
        const response = await fetch(apiUrl('/api/jarvis/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userText,
            history: messages.slice(-8),
            deviceState,
            memories,
          }),
        });

        const data = await response.json();
        const responseText = data.text || 'Directive acknowledged, sir.';
        const toolCalls = data.toolCalls || [];

        // Execute any returned modular tools
        const executedCalls: any[] = [];
        for (const tc of toolCalls) {
          const res = await toolRegistry.execute(tc, jarvisContext);
          executedCalls.push({
            ...tc,
            result: res.output,
            status: res.success ? 'success' : 'failed',
          });
        }

        const jarvisMsg: Message = {
          id: `jarvis_${Date.now()}`,
          role: 'assistant',
          content: responseText,
          timestamp: Date.now(),
          toolCalls: executedCalls,
        };

        setMessages(prev => [...prev, jarvisMsg]);
        setIsProcessing(false);

        // Transition: PROCESSING -> SPEAKING
        emitPipelineTransitionRef.current?.('PROCESSING', 'SPEAKING', 'Vocalizing response');
        logTelemetryRef.current?.('SPEAKING_STARTED', 'info');

        // Vocalize response naturally with British JARVIS cadence
        await speak(responseText);

        logTelemetryRef.current?.('SPEAKING_FINISHED', 'info');

        // Return to wake-word standby once vocalization finishes
        if (wakeWordEnabled) {
          resumeWakeWordStandbyRef.current?.();
        } else {
          emitPipelineTransitionRef.current?.('SPEAKING', 'STANDBY', 'Directive complete — resting in STANDBY');
          logTelemetryRef.current?.('STANDBY ENTERED', 'info');
        }
      } catch (err: any) {
        console.error('Directive dispatch failure:', err);
        const fallbackMsg: Message = {
          id: `jarvis_err_${Date.now()}`,
          role: 'assistant',
          content:
            "I apologize, sir. A momentary packet desynchronization occurred. Subsystems are re-aligning.",
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, fallbackMsg]);
        setIsProcessing(false);

        emitPipelineTransitionRef.current?.('PROCESSING', 'SPEAKING', 'Vocalizing system alert');
        logTelemetryRef.current?.('SPEAKING_STARTED', 'info');

        await speak(fallbackMsg.content);

        logTelemetryRef.current?.('SPEAKING_FINISHED', 'info');

        // Return to wake-word standby once vocalization finishes
        if (wakeWordEnabled) {
          resumeWakeWordStandbyRef.current?.();
        } else {
          emitPipelineTransitionRef.current?.('SPEAKING', 'STANDBY', 'Directive complete — resting in STANDBY');
          logTelemetryRef.current?.('STANDBY ENTERED', 'info');
        }
      }
    },
    [isProcessing, messages, deviceState, memories, jarvisContext, speak, stopSpeaking, wakeWordEnabled]
  );

  handleProcessDirectiveRef.current = handleProcessDirective;

  useEffect(() => {
    return installNativeJarvisBridge({
      onCommand: text => handleProcessDirectiveRef.current?.(text),
      onWake: () => {
        setWakeDetected(true);
        notify('Wake Word Detected', '“Hey JARVIS” recognized by Android.');
      },
    });
  }, [notify]);

  // Explicit listening sound player adhering to strict trigger constraints:
  // ONLY execute when:
  // 1. The user manually presses SPEAK (SPEAK_BUTTON -> LISTENING), OR
  // 2. A genuine "Hey JARVIS" wake-word detection transitions into command LISTENING (WAKE_DETECTED -> LISTENING).
  const playListeningSound = useCallback((source: 'SPEAK_BUTTON' | 'WAKE_DETECTED') => {
    if (source !== 'SPEAK_BUTTON' && source !== 'WAKE_DETECTED') {
      console.warn(`[AudioCue] Blocked unauthorized sound cue invocation from: ${source}`);
      return;
    }
    playSciFiChime('activate');
  }, []);

  // Speech Recognition Hook
  const {
    isListening,
    commandListeningActive,
    transcript,
    interimTranscript,
    isSupported: isSpeechSupported,
    error: speechError,
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
    pipelineStatus: hookPipelineStatus,
    logTelemetry,
    emitPipelineTransition,
    triggerWakeWordTest,
  } = useSpeechRecognition({
    wakeWordEnabled,
    isSpeaking,
    preferredInputDeviceId: audioRouting.preferredInputDeviceId,
    // Strict Rule 2: A genuine "Hey JARVIS" wake-word detection transitions into command LISTENING
    onCommandListeningStart: () => playListeningSound('WAKE_DETECTED'),
    onFinalTranscript: finalTranscript => {
      // Command session is already stopped and finalized in hook, directly process directive
      handleProcessDirective(finalTranscript);
    },
    onWakeWordDetected: (_trailingCommand) => {
      setWakeDetected(true);
      notify('Wake Word Detected', '“Hey JARVIS” recognized.');
    },
    onPipelineTransition: (_from, to) => {
      if (to === 'WAKE_DETECTED' || to === 'WAKE DETECTED') {
        setWakeDetected(true);
      } else {
        setWakeDetected(false);
      }
    },
  });

  // Keep standby resume and telemetry refs synchronized
  useEffect(() => {
    resumeWakeWordStandbyRef.current = resumeWakeWordStandby;
    logTelemetryRef.current = logTelemetry;
    emitPipelineTransitionRef.current = emitPipelineTransition;
  }, [resumeWakeWordStandby, logTelemetry, emitPipelineTransition]);

  // Calculate composite state for reactor visuals and animations
  const computedState: AssistantState = isSpeaking
    ? 'speaking'
    : isProcessing || isTranscribingFallback
    ? 'processing'
    : wakeDetected || hookPipelineStatus === 'WAKE_DETECTED' || hookPipelineStatus === 'WAKE DETECTED'
    ? 'wake_detected'
    : commandListeningActive || hookPipelineStatus === 'LISTENING' || (isListening && !isWakeWordStandby)
    ? 'listening'
    : 'idle';

  // Live pipeline status: STANDBY → WAKE_DETECTED → LISTENING → PROCESSING → SPEAKING → STANDBY
  const currentPipelineStatus: JarvisPipelineStatus = !wakeWordEnabled
    ? computedState === 'listening'
      ? 'LISTENING'
      : computedState === 'processing'
      ? 'PROCESSING'
      : computedState === 'speaking'
      ? 'SPEAKING'
      : 'STANDBY'
    : isSpeaking
    ? 'SPEAKING'
    : isProcessing || isTranscribingFallback
    ? 'PROCESSING'
    : hookPipelineStatus === 'WAKE_DETECTED' || hookPipelineStatus === 'WAKE DETECTED' || wakeDetected
    ? 'WAKE_DETECTED'
    : commandListeningActive || hookPipelineStatus === 'LISTENING' || (isListening && !isWakeWordStandby)
    ? 'LISTENING'
    : 'STANDBY';

  // Hands-free wake word mode toggle handler
  const handleToggleWakeWord = async () => {
    if (wakeWordEnabled) {
      setWakeWordEnabled(false);
      stopListening();
      notify('Wake Word Mode', 'Wake Word Mode OFF. Ambient audio listener halted.');
    } else {
      let permitted = false;
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          testStream.getTracks().forEach(t => t.stop());
          permitted = true;
        } else {
          notify('Microphone Unavailable', 'Microphone API is not supported in this browser.', 'error');
          return;
        }
      } catch (permErr: any) {
        console.warn('Microphone permission check warning:', permErr);
        notify(
          'Microphone Permission Required',
          'Please allow microphone access in your browser address bar/settings to enable wake-word monitoring.',
          'error'
        );
        return;
      }
      if (permitted) {
        setWakeWordEnabled(true);
        notify('Wake Word Mode ON', 'Hands-free monitoring active. Say "Hey JARVIS" to command.');
      }
    }
  };

  // Arc reactor button click handler (Manual push-to-talk button)
  const handleCoreClick = () => {
    if (isSpeaking) {
      stopSpeaking();
      if (wakeWordEnabled) {
        resumeWakeWordStandby();
      }
      return;
    }
    if (commandListeningActive || (isListening && !isWakeWordStandby)) {
      stopListening();
    } else {
      // Strict Rule 1: The user manually presses SPEAK
      playListeningSound('SPEAK_BUTTON');
      // Pass true to force command mode (bypasses wake-word standby to record directive directly)
      startListening(true);
    }
  };

  // Periodic Reminder Checker
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      reminders.forEach(r => {
        if (!r.completed && Math.abs(now - r.dueTimestamp) < 3000) {
          playSciFiChime('alert');
          notify('Agenda Alert Due', `Reminder: ${r.title}`);
          if (!isSpeaking) {
            speak(`Sir, a scheduled agenda reminder is due: ${r.title}.`);
          }
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [reminders, isSpeaking, speak, notify]);

  return (
    <div className="min-h-screen bg-[#04070e] text-cyan-50 flex flex-col items-center justify-center p-0 sm:p-4 md:p-6 select-none relative overflow-hidden font-sans">
      {/* Background Holographic Scanlines & Grids */}
      <div className="absolute inset-0 hud-grid opacity-75 pointer-events-none" />
      <div className="absolute inset-0 bg-radial from-transparent via-[#04070e]/60 to-[#020408] pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent animate-scanline pointer-events-none" />

      {/* Top Floating App Bar (Mode & Telemetry Switcher) */}
      <div className="w-full max-w-4xl flex items-center justify-between px-4 py-2 text-xs font-mono text-cyan-400/80 z-20">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 arc-glow animate-pulse" />
          <span className="font-display font-bold tracking-widest text-cyan-200 uppercase text-sm">
            J.A.R.V.I.S.
          </span>
          <span className="hidden sm:inline-block text-[11px] text-cyan-500 font-mono">
            // ANDROID PERSONAL ASSISTANT
          </span>
        </div>

        {/* View Layout Switcher & Status Indicators */}
        <div className="flex items-center gap-2">
          <button
            id="toggle-diagnostic-button"
            onClick={() => setShowDiagnostics(prev => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all cursor-pointer ${
              showDiagnostics
                ? 'bg-cyan-500/25 border border-cyan-400 text-cyan-200'
                : 'bg-cyan-950/60 border border-cyan-800/50 hover:border-cyan-500 text-cyan-400/80'
            }`}
            title="Toggle Speech Sensor Diagnostics"
          >
            <Bug className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Diagnostics</span>
            {speechDiagnostics.isWebSpeechUnavailable && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>

          <button
            id="toggle-view-mode-button"
            onClick={() => setViewMode(prev => (prev === 'mobile' ? 'fullscreen' : 'mobile'))}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-950/60 border border-cyan-800/50 hover:border-cyan-500 text-cyan-300 text-xs font-mono transition-all cursor-pointer"
          >
            {viewMode === 'mobile' ? (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">HUD Command Deck</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Android Handheld Frame</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Container: Android Handheld Frame OR Command Deck */}
      <main
        className={`relative z-10 w-full transition-all duration-300 ${
          viewMode === 'mobile'
            ? 'max-w-md my-0 sm:my-3 rounded-none sm:rounded-[36px] border-0 sm:border-4 border-cyan-900/60 bg-[#060b14] shadow-2xl shadow-cyan-950/60 overflow-hidden flex flex-col h-[100vh] sm:h-[880px]'
            : 'max-w-5xl my-2 rounded-2xl border border-cyan-900/50 bg-[#060c16]/90 p-4 shadow-2xl shadow-cyan-950/80'
        }`}
      >
        {/* Flashlight Active Beam Simulation (If Flashlight is ON) */}
        {deviceState.flashlight && (
          <div className="absolute top-0 inset-x-0 h-44 bg-gradient-to-b from-amber-300/25 via-amber-400/10 to-transparent pointer-events-none z-40 blur-xl animate-pulse" />
        )}

        {/* Android Punch-Hole Camera (Visible in Mobile View) */}
        {viewMode === 'mobile' && (
          <div className="hidden sm:flex justify-center w-full pt-2 pb-0.5 bg-[#070d18] z-30">
            <div className="w-3.5 h-3.5 rounded-full bg-[#020408] border border-cyan-950 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-900/50" />
            </div>
          </div>
        )}

        {/* Android Native Status Bar */}
        <AndroidStatusBar
          deviceState={deviceState}
          isListening={isListening}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          wakeWordActive={wakeWordEnabled}
          audioRoute={audioRouting.route}
          bluetoothStatus={audioRouting.bluetoothStatus}
        />

        {/* Floating Toast Notification HUD */}
        {toastNotification && (
          <div className="absolute top-12 left-4 right-4 z-50 flex items-center justify-between p-3 bg-cyan-950/95 border border-cyan-400/80 rounded-xl arc-glow shadow-xl text-cyan-100 text-xs font-mono animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-300 animate-pulse" />
              <div>
                <p className="font-tech font-bold uppercase tracking-wider text-cyan-300">
                  {toastNotification.title}
                </p>
                <p className="text-[11px] text-cyan-200/90 font-sans">{toastNotification.message}</p>
              </div>
            </div>
            <button
              onClick={() => setToastNotification(null)}
              className="text-cyan-400 hover:text-cyan-200 text-xs px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Mobile View Navigation Tabs */}
        <nav aria-label="System Navigation" className="flex items-center justify-around border-b border-cyan-900/40 bg-[#070e1a]/80 px-2 py-1.5 text-xs font-tech select-none z-20">
          <button
            id="nav-tab-core"
            onClick={() => setActiveTab('core')}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-all cursor-pointer ${
              activeTab === 'core'
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-200 shadow-sm'
                : 'text-cyan-400/70 hover:text-cyan-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="font-semibold tracking-wider uppercase">Voice Core</span>
          </button>

          <button
            id="nav-tab-device"
            onClick={() => setActiveTab('device')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              activeTab === 'device'
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-200 shadow-sm'
                : 'text-cyan-400/70 hover:text-cyan-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="font-semibold tracking-wider uppercase">Android</span>
          </button>

          <button
            id="nav-tab-memory"
            onClick={() => setActiveTab('memory')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              activeTab === 'memory'
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-200 shadow-sm'
                : 'text-cyan-400/70 hover:text-cyan-200'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            <span className="font-semibold tracking-wider uppercase">Memory</span>
          </button>

          <button
            id="nav-tab-reminders"
            onClick={() => setActiveTab('reminders')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              activeTab === 'reminders'
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-200 shadow-sm'
                : 'text-cyan-400/70 hover:text-cyan-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="font-semibold tracking-wider uppercase">Agenda</span>
          </button>

          <button
            id="nav-tab-modular"
            onClick={() => setActiveTab('modular')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              activeTab === 'modular'
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-200 shadow-sm'
                : 'text-cyan-400/70 hover:text-cyan-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="font-semibold tracking-wider uppercase">Modules</span>
          </button>
        </nav>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* Active Tab: Voice Core HUD */}
          {activeTab === 'core' && (
            <div className="space-y-4">
              {/* Hands-Free Wake Word Mode Banner / Panel */}
              <WakeWordControlCard
                wakeWordEnabled={wakeWordEnabled}
                onToggleWakeWord={handleToggleWakeWord}
                status={currentPipelineStatus}
                micPermission={
                  speechDiagnostics.micPermission === 'granted' ||
                  speechDiagnostics.micPermission === 'denied' ||
                  speechDiagnostics.micPermission === 'prompt'
                    ? speechDiagnostics.micPermission
                    : 'unknown'
                }
                onRequestMicPermission={async () => {
                  try {
                    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                    s.getTracks().forEach(t => t.stop());
                    notify('Microphone Permission', 'Access granted. Ready for hands-free voice interaction.');
                  } catch {
                    notify('Permission Notice', 'Microphone permission denied or blocked in this frame.');
                  }
                }}
                exactError={speechError || speechDiagnostics.exactError}
                onTestWakeFlow={triggerWakeWordTest}
                audioRoute={audioRouting.route}
                bluetoothStatus={audioRouting.bluetoothStatus}
              />

              {/* Central Arc Reactor Hologram */}
              <ArcReactorCore
                state={computedState}
                audioLevel={audioLevel}
                speakingPulse={speakingPulse}
                onCoreClick={handleCoreClick}
                isListening={isListening && !isWakeWordStandby}
                isSpeaking={isSpeaking}
                recognizedText={interimTranscript || (isListening && !isWakeWordStandby ? transcript : '')}
                wakeWordEnabled={wakeWordEnabled}
              />

              {/* Temporary Voice Sensor Diagnostic & Telemetry Panel */}
              {showDiagnostics ? (
                <SpeechDiagnosticPanel
                  diagnostics={speechDiagnostics}
                  audioRoutingDiagnostics={audioRouting.diagnostics}
                  activeMode={activeMode}
                  setActiveMode={setActiveMode}
                  isListening={isListening}
                  onStartListening={startListening}
                  onStopListening={stopListening}
                  onClearLogs={clearDiagnosticLogs}
                  isTranscribingFallback={isTranscribingFallback}
                  onTestWakeFlow={triggerWakeWordTest}
                  onRefreshAudioDevices={audioRouting.refreshDevices}
                  onRequestBluetoothScan={audioRouting.requestBluetoothScan}
                />
              ) : (
                <button
                  id="open-diagnostic-panel-banner"
                  onClick={() => setShowDiagnostics(true)}
                  className="w-full py-2 px-3 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-800/40 hover:border-cyan-500 text-cyan-300 text-xs font-mono flex items-center justify-between cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Bug className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Show Voice Sensor Diagnostics & Telemetry Panel</span>
                  </div>
                  {speechDiagnostics.isWebSpeechUnavailable && (
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px]">
                      Web Speech API Restricted
                    </span>
                  )}
                </button>
              )}

              {/* Speech Error Banner if any */}
              {speechError && (
                <div className="p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-lg text-rose-300 text-xs font-mono flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{speechError}</span>
                  </div>
                  <button
                    onClick={clearError}
                    className="text-rose-400 hover:text-rose-200 cursor-pointer text-xs px-1"
                    title="Dismiss alert"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Conversation and Directive Stream HUD */}
              <ConversationHUD
                messages={messages}
                onSendMessage={handleProcessDirective}
                onReplayVoice={text => speak(text)}
                onClearMessages={() => setMessages([])}
                state={computedState}
                interimTranscript={interimTranscript || (isListening ? transcript : '')}
              />
            </div>
          )}

          {/* Active Tab: Android Device Controls */}
          {activeTab === 'device' && (
            <div className="space-y-4">
              <DeviceControlsCard
                deviceState={deviceState}
                setDeviceState={setDeviceState}
              />
              <div className="p-3 bg-cyan-950/30 border border-cyan-900/40 rounded-xl text-xs text-cyan-300 font-sans leading-relaxed">
                <p className="font-tech font-bold uppercase tracking-wider text-cyan-200 mb-1">
                  Voice Commands Supported:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-cyan-400/80 font-mono text-[11px]">
                  <li>&quot;Jarvis, turn on the flashlight&quot;</li>
                  <li>&quot;Turn off the flashlight&quot;</li>
                  <li>&quot;Calibrate volume to 80 percent&quot;</li>
                  <li>&quot;Turn off Wi-Fi and activate Bluetooth&quot;</li>
                  <li>&quot;Launch Camera app&quot; or &quot;Launch Maps&quot;</li>
                </ul>
              </div>
            </div>
          )}

          {/* Active Tab: Memory Bank */}
          {activeTab === 'memory' && (
            <div className="space-y-4">
              <MemoryBankCard
                memories={memories}
                setMemories={setMemories}
              />
              <div className="p-3 bg-cyan-950/30 border border-cyan-900/40 rounded-xl text-xs text-cyan-300 font-sans leading-relaxed">
                <p className="font-tech font-bold uppercase tracking-wider text-cyan-200 mb-1">
                  Open-Ended Memory Retention:
                </p>
                <p className="text-cyan-400/80 font-mono text-[11px]">
                  JARVIS extracts topics and commitments from normal speech. Try saying:
                  <span className="text-cyan-200 block mt-1">&quot;Jarvis, remember that my assistant key is stored in vault 42.&quot;</span>
                </p>
              </div>
            </div>
          )}

          {/* Active Tab: Agenda & Reminders */}
          {activeTab === 'reminders' && (
            <div className="space-y-4">
              <RemindersCard
                reminders={reminders}
                setReminders={setReminders}
              />
              <div className="p-3 bg-cyan-950/30 border border-cyan-900/40 rounded-xl text-xs text-cyan-300 font-sans leading-relaxed">
                <p className="font-tech font-bold uppercase tracking-wider text-cyan-200 mb-1">
                  Voice Scheduling Commands:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-cyan-400/80 font-mono text-[11px]">
                  <li>&quot;Remind me to check the server in 10 minutes&quot;</li>
                  <li>&quot;Create an urgent reminder for the morning standup&quot;</li>
                </ul>
              </div>
            </div>
          )}

          {/* Active Tab: Modular Architecture Inspector */}
          {activeTab === 'modular' && (
            <ModularToolsDrawer
              wakeWordEnabled={wakeWordEnabled}
              onToggleWakeWord={handleToggleWakeWord}
              pipelineStatus={currentPipelineStatus}
              speechRate={speechRate}
              setSpeechRate={setSpeechRate}
              speechPitch={speechPitch}
              setSpeechPitch={setSpeechPitch}
              micPermission={
                speechDiagnostics.micPermission === 'granted' ||
                speechDiagnostics.micPermission === 'denied' ||
                speechDiagnostics.micPermission === 'prompt'
                  ? speechDiagnostics.micPermission
                  : 'unknown'
              }
              onRequestMicPermission={async () => {
                try {
                  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                  s.getTracks().forEach(t => t.stop());
                  notify('Microphone Permission', 'Access granted. Ready for voice interaction.');
                } catch {
                  notify('Permission Notice', 'Microphone access denied or blocked.');
                }
              }}
              exactError={speechError || speechDiagnostics.exactError}
            />
          )}
        </div>

        {/* Android Bottom Soft Navigation Bar (Mobile View) */}
        {viewMode === 'mobile' && (
          <div className="border-t border-cyan-900/30 bg-[#060c16] py-2 px-8 flex items-center justify-between z-20">
            {/* Back (Triangle) */}
            <button
              onClick={() => setActiveTab('core')}
              title="Return to Core"
              className="p-2 text-cyan-600 hover:text-cyan-300 transition-colors"
            >
              <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[10px] border-r-cyan-400/80" />
            </button>
            {/* Home (Circle) */}
            <button
              onClick={() => setActiveTab('core')}
              title="Home Core View"
              className="p-2 text-cyan-400 hover:text-cyan-200 transition-colors"
            >
              <div className="w-3.5 h-3.5 rounded-full border-2 border-cyan-400/80" />
            </button>
            {/* Overview / Recent (Square) */}
            <button
              onClick={() => setActiveTab('device')}
              title="Android Subsystems"
              className="p-2 text-cyan-600 hover:text-cyan-300 transition-colors"
            >
              <div className="w-3 h-3 border-2 border-cyan-400/80 rounded-xs" />
            </button>
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="mt-2 text-center text-[10px] font-mono text-cyan-700 select-none">
        JARVIS Mk.IV Android Assistant // Built with Voice STT, Speech Synthesis & Gemini Neural Engine
      </footer>
    </div>
  );
}
