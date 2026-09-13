import React from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, Volume2, Sparkles, Cpu, Activity } from 'lucide-react';
import { AssistantState } from '../types/jarvis';

interface ArcReactorCoreProps {
  state: AssistantState;
  audioLevel: number;
  speakingPulse: number;
  onCoreClick: () => void;
  isListening: boolean;
  isSpeaking: boolean;
  recognizedText?: string;
  wakeWordEnabled?: boolean;
}

export const ArcReactorCore: React.FC<ArcReactorCoreProps> = ({
  state,
  audioLevel,
  speakingPulse,
  onCoreClick,
  isListening,
  isSpeaking,
  recognizedText,
  wakeWordEnabled = false,
}) => {
  // Compute visual reactivity
  const activePulse = isListening
    ? Math.max(0.2, audioLevel * 1.5)
    : isSpeaking
    ? speakingPulse
    : state === 'processing'
    ? 0.8
    : state === 'wake_detected'
    ? 0.95
    : 0.15;

  const coreScale = 1 + activePulse * 0.12;

  // State colors
  const getStateColor = () => {
    switch (state) {
      case 'wake_detected':
        return {
          primary: '#10b981', // emerald-500
          glow: 'rgba(16, 185, 129, 0.85)',
          statusText: 'WAKE WORD DETECTED',
          subText: '“Hey JARVIS” acknowledged',
        };
      case 'listening':
        return {
          primary: '#06b6d4', // cyan-500
          glow: 'rgba(6, 182, 212, 0.7)',
          statusText: 'AUDIO SENSOR ACTIVE',
          subText: recognizedText ? `“${recognizedText}”` : 'Listening for directives...',
        };
      case 'processing':
        return {
          primary: '#f59e0b', // amber-500
          glow: 'rgba(245, 158, 11, 0.7)',
          statusText: 'NEURAL CORE COMPUTING',
          subText: 'Synthesizing response...',
        };
      case 'speaking':
        return {
          primary: '#38bdf8', // sky-400
          glow: 'rgba(56, 189, 248, 0.8)',
          statusText: 'VOCAL SYNTHESIZER ONLINE',
          subText: 'Transmitting speech...',
        };
      default:
        return {
          primary: '#0891b2', // cyan-600
          glow: 'rgba(6, 182, 212, 0.3)',
          statusText: wakeWordEnabled ? 'WAKE WORD STANDBY' : 'JARVIS MK.IV STANDBY',
          subText: wakeWordEnabled
            ? 'Monitoring for "Hey JARVIS" or tap to speak'
            : 'Tap to initialize directive',
        };
    }
  };

  const statusInfo = getStateColor();

  return (
    <div className="relative flex flex-col items-center justify-center select-none py-4">
      {/* Outer Glow Halo */}
      <motion.div
        animate={{
          scale: [1, 1.06, 1],
          opacity: [0.35, 0.65, 0.35],
        }}
        transition={{
          repeat: Infinity,
          duration: state === 'processing' ? 1.5 : 3.5,
          ease: 'easeInOut',
        }}
        className="absolute w-72 h-72 rounded-full pointer-events-none blur-3xl transition-colors duration-500"
        style={{ backgroundColor: statusInfo.glow }}
      />

      {/* Main Hologram Container */}
      <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
        {/* Layer 1: Outermost Telemetry Ring with Degree Ticks */}
        <motion.svg
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 40, ease: 'linear' }}
          className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
          viewBox="0 0 300 300"
        >
          <circle
            cx="150"
            cy="150"
            r="142"
            fill="none"
            stroke="rgba(6, 182, 212, 0.35)"
            strokeWidth="1.5"
            strokeDasharray="6 12"
          />
          <circle
            cx="150"
            cy="150"
            r="134"
            fill="none"
            stroke="rgba(6, 182, 212, 0.2)"
            strokeWidth="1"
          />
        </motion.svg>

        {/* Layer 2: Counter-rotating segmented brackets */}
        <motion.svg
          animate={{
            rotate: state === 'processing' ? -360 : -180,
          }}
          transition={{
            repeat: Infinity,
            duration: state === 'processing' ? 6 : 24,
            ease: 'linear',
          }}
          className="absolute inset-0 w-full h-full pointer-events-none opacity-60"
          viewBox="0 0 300 300"
        >
          {/* 4 Quadrant Arcs */}
          <circle
            cx="150"
            cy="150"
            r="120"
            fill="none"
            stroke={statusInfo.primary}
            strokeWidth="3"
            strokeDasharray="70 120"
            strokeLinecap="round"
          />
          <circle
            cx="150"
            cy="150"
            r="110"
            fill="none"
            stroke="rgba(6, 182, 212, 0.4)"
            strokeWidth="1.5"
            strokeDasharray="30 40"
          />
        </motion.svg>

        {/* Layer 3: Audio Frequency Radial Bars (Reactive) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i * 360) / 24;
            // Fluctuate bar heights based on audio reactivity
            const height = isListening || isSpeaking
              ? 8 + Math.sin(i * 1.5 + activePulse * 5) * 12 * (activePulse + 0.3)
              : 6;
            return (
              <div
                key={i}
                className="absolute w-0.5 rounded-full transition-all duration-75"
                style={{
                  height: `${Math.max(4, height)}px`,
                  backgroundColor: statusInfo.primary,
                  transform: `rotate(${angle}deg) translateY(-86px)`,
                  opacity: 0.4 + activePulse * 0.6,
                }}
              />
            );
          })}
        </div>

        {/* Layer 4: Inner Gyroscopic Arc Core Ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            repeat: Infinity,
            duration: state === 'speaking' ? 8 : 16,
            ease: 'linear',
          }}
          className="absolute w-44 h-44 rounded-full border border-cyan-500/40 flex items-center justify-center"
          style={{
            borderStyle: 'dashed',
            borderWidth: '2px',
          }}
        >
          {/* Inner tick markers */}
          <div className="absolute top-0 w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
          <div className="absolute bottom-0 w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
          <div className="absolute left-0 w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
          <div className="absolute right-0 w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
        </motion.div>

        {/* Central Clickable Push-to-Talk / Reactor Core */}
        <motion.button
          id="jarvis-arc-reactor-button"
          onClick={onCoreClick}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          animate={{ scale: coreScale }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          className={`relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
            state === 'wake_detected'
              ? 'bg-emerald-950/80 border-2 border-emerald-400 arc-glow-active shadow-emerald-500/50'
              : state === 'listening'
              ? 'bg-cyan-950/80 border-2 border-cyan-400 arc-glow-active shadow-cyan-500/50'
              : state === 'processing'
              ? 'bg-amber-950/80 border-2 border-amber-400 amber-glow shadow-amber-500/50'
              : state === 'speaking'
              ? 'bg-sky-950/80 border-2 border-sky-400 arc-glow-active shadow-sky-500/50'
              : 'bg-[#081220]/90 border border-cyan-500/50 arc-glow hover:border-cyan-300'
          }`}
        >
          {/* Reactor Inner Glow Gradient */}
          <div className="absolute inset-1 rounded-full bg-radial from-cyan-400/20 via-transparent to-transparent pointer-events-none" />

          {/* Central Icon */}
          <div className="relative z-10 flex flex-col items-center justify-center">
            {state === 'wake_detected' ? (
              <Sparkles className="w-8 h-8 text-emerald-300 animate-pulse" />
            ) : state === 'listening' ? (
              <Mic className="w-8 h-8 text-cyan-300 animate-pulse" />
            ) : state === 'processing' ? (
              <Cpu className="w-8 h-8 text-amber-300 animate-spin" style={{ animationDuration: '4s' }} />
            ) : state === 'speaking' ? (
              <Volume2 className="w-8 h-8 text-sky-300 animate-bounce" />
            ) : (
              <Mic className="w-8 h-8 text-cyan-400 group-hover:text-cyan-200" />
            )}

            <span className="mt-1 text-[10px] font-mono tracking-widest uppercase font-semibold text-cyan-200">
              {state === 'wake_detected'
                ? 'WAKE DETECTED'
                : state === 'listening'
                ? 'LISTENING'
                : state === 'processing'
                ? 'COMPUTING'
                : state === 'speaking'
                ? 'SPEAKING'
                : 'SPEAK'}
            </span>
          </div>

          {/* Concentric soundwaves expanding outward when active */}
          {(isListening || isSpeaking) && (
            <motion.div
              animate={{
                scale: [1, 1.45, 1.7],
                opacity: [0.8, 0.3, 0],
              }}
              transition={{
                repeat: Infinity,
                duration: 1.6,
                ease: 'easeOut',
              }}
              className="absolute inset-0 rounded-full border border-cyan-400/70 pointer-events-none"
            />
          )}
        </motion.button>
      </div>

      {/* Futuristic Telemetry Label Beneath Core */}
      <div className="mt-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <Activity
            className={`w-3.5 h-3.5 ${
              state === 'listening'
                ? 'text-cyan-400 animate-pulse'
                : state === 'processing'
                ? 'text-amber-400 animate-spin'
                : 'text-cyan-500/70'
            }`}
          />
          <span className="font-display font-bold text-xs tracking-widest text-cyan-300 uppercase">
            {statusInfo.statusText}
          </span>
        </div>
        <p className="text-xs font-mono text-cyan-400/70 mt-0.5 tracking-wide">
          {statusInfo.subText}
        </p>
      </div>
    </div>
  );
};
