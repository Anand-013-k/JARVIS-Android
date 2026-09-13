import React from 'react';
import {
  Radio,
  Sparkles,
  Mic,
  Cpu,
  Volume2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ShieldAlert,
  Bluetooth,
  Smartphone,
  Headphones,
} from 'lucide-react';
import { JarvisPipelineStatus } from '../types/jarvis';
import { AudioRouteState, BluetoothStatus } from '../types/audioRouting';

interface WakeWordControlCardProps {
  wakeWordEnabled: boolean;
  onToggleWakeWord: () => void;
  status: JarvisPipelineStatus;
  micPermission?: 'granted' | 'denied' | 'prompt' | 'unknown';
  onRequestMicPermission?: () => void;
  exactError?: string | null;
  onTestWakeFlow?: () => void;
  audioRoute?: AudioRouteState;
  bluetoothStatus?: BluetoothStatus;
}

export const WakeWordControlCard: React.FC<WakeWordControlCardProps> = ({
  wakeWordEnabled,
  onToggleWakeWord,
  status,
  micPermission = 'unknown',
  onRequestMicPermission,
  exactError,
  onTestWakeFlow,
  audioRoute = 'PHONE',
  bluetoothStatus = 'Disconnected',
}) => {
  const pipelineStates: Array<{
    id: JarvisPipelineStatus;
    label: string;
    icon: React.ElementType;
    description: string;
  }> = [
    {
      id: 'STANDBY',
      label: 'STANDBY',
      icon: Radio,
      description: 'Passively listening for "Hey JARVIS"...',
    },
    {
      id: 'WAKE DETECTED',
      label: 'WAKE DETECTED',
      icon: Sparkles,
      description: 'Phrase recognized! Initializing channel...',
    },
    {
      id: 'LISTENING',
      label: 'LISTENING',
      icon: Mic,
      description: 'Recording user directive in real-time...',
    },
    {
      id: 'PROCESSING',
      label: 'PROCESSING',
      icon: Cpu,
      description: 'Neural core parsing & executing actions...',
    },
    {
      id: 'SPEAKING',
      label: 'SPEAKING',
      icon: Volume2,
      description: 'Synthesizing voice response...',
    },
  ];

  // Helper for active state styling
  const getStateColorClass = (stateId: JarvisPipelineStatus, isActive: boolean) => {
    if (!isActive) {
      return 'bg-[#060c16]/70 border-cyan-900/40 text-cyan-600/70';
    }
    switch (stateId) {
      case 'STANDBY':
        return 'bg-cyan-950/80 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/30';
      case 'WAKE_DETECTED':
      case 'WAKE DETECTED':
        return 'bg-emerald-950/90 border-emerald-400 text-emerald-200 shadow-md shadow-emerald-500/40 animate-pulse';
      case 'LISTENING':
        return 'bg-cyan-900/80 border-cyan-300 text-cyan-100 shadow-md shadow-cyan-400/40';
      case 'PROCESSING':
        return 'bg-amber-950/90 border-amber-400 text-amber-200 shadow-md shadow-amber-500/40';
      case 'SPEAKING':
        return 'bg-sky-950/90 border-sky-400 text-sky-200 shadow-md shadow-sky-500/40';
      default:
        return 'bg-cyan-950/80 border-cyan-400 text-cyan-200';
    }
  };

  return (
    <div
      id="jarvis-wake-word-control-panel"
      className="w-full bg-[#081220]/90 border border-cyan-500/30 rounded-xl p-3.5 backdrop-blur-md shadow-lg shadow-cyan-950/40 transition-all space-y-3"
    >
      {/* Top Bar: Toggle and Status */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-1.5 rounded-lg border transition-colors ${
              wakeWordEnabled
                ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300'
                : 'bg-slate-900/80 border-slate-800 text-slate-500'
            }`}
          >
            <Radio
              className={`w-4 h-4 ${wakeWordEnabled ? 'text-cyan-400 animate-pulse' : ''}`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-tech font-bold uppercase tracking-wider text-xs sm:text-sm text-cyan-100">
                WAKE WORD MODE
              </span>
              <span
                id="wake-word-mode-status-badge"
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border transition-all ${
                  wakeWordEnabled
                    ? 'bg-emerald-500/20 border-emerald-400/80 text-emerald-300 arc-glow'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400'
                }`}
              >
                {wakeWordEnabled ? 'ON' : 'OFF'}
              </span>
              <span
                id="audio-route-badge"
                title={`Audio Route: ${audioRoute} | Bluetooth: ${bluetoothStatus}`}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border flex items-center gap-1 ${
                  audioRoute === 'BLUETOOTH'
                    ? 'bg-blue-500/20 border-blue-400 text-blue-300'
                    : 'bg-cyan-950/40 border-cyan-800/60 text-cyan-300'
                }`}
              >
                {audioRoute === 'BLUETOOTH' ? (
                  <>
                    <Bluetooth className="w-2.5 h-2.5 text-blue-400" />
                    <span>BT AUDIO</span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-2.5 h-2.5 text-cyan-400" />
                    <span>PHONE AUDIO</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-[11px] font-mono text-cyan-400/70">
              {wakeWordEnabled
                ? 'Say "Hey JARVIS" anytime hands-free'
                : 'Hands-free standby offline • Manual push-to-talk only'}
            </p>
          </div>
        </div>

        {/* Master Controls */}
        <div className="flex items-center gap-2">
          {onTestWakeFlow && (
            <button
              id="simulate-wake-flow-button"
              type="button"
              onClick={onTestWakeFlow}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/60 text-emerald-300 text-xs font-mono transition-all cursor-pointer shadow-sm"
              title="Test complete cycle: 'Hey JARVIS' → command → response → return to standby"
            >
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>Simulate Flow</span>
            </button>
          )}

          <button
            id="toggle-wake-word-mode-button"
            type="button"
            onClick={onToggleWakeWord}
            aria-label="Toggle Wake Word Mode"
            className={`relative inline-flex h-7 w-14 items-center rounded-full p-1 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
              wakeWordEnabled ? 'bg-cyan-500' : 'bg-slate-800'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-black shadow-md transition-transform duration-200 ${
                wakeWordEnabled ? 'translate-x-7 bg-cyan-100' : 'translate-x-0 bg-slate-400'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Permission or Error Alert if microphone is blocked */}
      {micPermission === 'denied' && (
        <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-600/70 flex items-center justify-between text-xs font-mono text-rose-300">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Microphone access blocked in browser. Grant permission to enable wake-word.</span>
          </div>
          {onRequestMicPermission && (
            <button
              onClick={onRequestMicPermission}
              className="px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 border border-rose-500 text-[10px] text-white font-tech cursor-pointer shrink-0"
            >
              Grant Mic
            </button>
          )}
        </div>
      )}

      {/* Status Pipeline State Machine Stepper */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-cyan-400/80">
          <span>PIPELINE CYCLE</span>
          <span className="text-cyan-300 font-semibold">
            {wakeWordEnabled ? `CURRENT: ${status}` : 'STANDBY (OFFLINE)'}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
          {pipelineStates.map((step, idx) => {
            const isWakeDetectedMatch =
              (step.id === 'WAKE DETECTED' || step.id === 'WAKE_DETECTED') &&
              (status === 'WAKE DETECTED' || status === 'WAKE_DETECTED');
            const isActive = wakeWordEnabled && (status === step.id || isWakeDetectedMatch);
            const Icon = step.icon;

            return (
              <div
                key={step.id}
                title={step.description}
                className={`relative flex flex-col items-center justify-center p-1.5 sm:p-2 rounded-lg border text-center transition-all ${getStateColorClass(
                  step.id,
                  isActive
                )}`}
              >
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isActive
                        ? step.id === 'PROCESSING'
                          ? 'animate-spin'
                          : step.id === 'WAKE DETECTED' || step.id === 'WAKE_DETECTED'
                          ? 'animate-bounce text-emerald-300'
                          : 'animate-pulse text-cyan-200'
                        : 'text-cyan-600/60'
                    }`}
                  />
                </div>
                <span
                  className={`text-[9px] sm:text-[10px] font-tech font-bold uppercase tracking-wider block truncate w-full ${
                    isActive ? 'text-cyan-100 font-semibold' : 'text-cyan-600/70'
                  }`}
                >
                  {step.label}
                </span>

                {/* Arrow indicator between states */}
                {idx < pipelineStates.length - 1 && (
                  <div className="hidden sm:block absolute -right-1.5 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
                    <ChevronRight className="w-2.5 h-2.5 text-cyan-800/80" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live status description banner */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#040912]/80 border border-cyan-900/50 text-[11px] font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
          <span className="text-cyan-300/90 truncate">
            {wakeWordEnabled
              ? status === 'STANDBY'
                ? 'Monitoring ambient audio for "Hey JARVIS" phrase...'
                : status === 'WAKE DETECTED' || status === 'WAKE_DETECTED'
                ? 'Phrase "Hey JARVIS" recognized! Listening for directive...'
                : status === 'LISTENING'
                ? 'Actively recording spoken command directive...'
                : status === 'PROCESSING'
                ? 'JARVIS Neural Core computing directive...'
                : 'Vocalizing response through speech synthesis. Will return to STANDBY.'
              : 'Wake Word Mode is OFF. Tap the central Arc Reactor to speak manually.'}
          </span>
        </div>
      </div>
    </div>
  );
};
