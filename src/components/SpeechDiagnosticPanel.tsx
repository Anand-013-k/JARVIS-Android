import React, { useState } from 'react';
import {
  SpeechDiagnostics,
  DiagnosticEventLog,
} from '../hooks/useSpeechRecognition';
import { AudioRoutingDiagnostics } from '../types/audioRouting';
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  Bug,
  CheckCircle2,
  Copy,
  Headphones,
  Mic,
  Radio,
  RefreshCw,
  Smartphone,
  Sparkles,
  Terminal,
  Volume2,
  XCircle,
  Zap,
} from 'lucide-react';

interface SpeechDiagnosticPanelProps {
  diagnostics: SpeechDiagnostics;
  audioRoutingDiagnostics?: AudioRoutingDiagnostics;
  activeMode: 'webspeech' | 'fallback';
  setActiveMode: (mode: 'webspeech' | 'fallback') => void;
  isListening: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onClearLogs: () => void;
  isTranscribingFallback?: boolean;
  onTestWakeFlow?: () => void;
  onRefreshAudioDevices?: () => void;
  onRequestBluetoothScan?: () => void;
}

export const SpeechDiagnosticPanel: React.FC<SpeechDiagnosticPanelProps> = ({
  diagnostics,
  audioRoutingDiagnostics,
  activeMode,
  setActiveMode,
  isListening,
  onStartListening,
  onStopListening,
  onClearLogs,
  isTranscribingFallback = false,
  onTestWakeFlow,
  onRefreshAudioDevices,
  onRequestBluetoothScan,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [filterLevel, setFilterLevel] = useState<'all' | 'errors'>('all');

  const copyTelemetry = () => {
    const report = {
      timestamp: new Date().toISOString(),
      activeMode,
      hasSpeechRecognition: diagnostics.hasSpeechRecognition,
      hasWebkitSpeechRecognition: diagnostics.hasWebkitSpeechRecognition,
      constructorUsed: diagnostics.constructorUsed,
      micPermission: diagnostics.micPermission,
      isSecureContext: diagnostics.isSecureContext,
      isInIframe: diagnostics.isInIframe,
      exactError: diagnostics.exactError,
      lastInterim: diagnostics.lastInterim,
      lastFinal: diagnostics.lastFinal,
      confidenceScore: diagnostics.confidenceScore,
      detectedLanguage: diagnostics.detectedLanguage,
      zeroWordsCaptured: diagnostics.zeroWordsCaptured,
      isWebSpeechUnavailable: diagnostics.isWebSpeechUnavailable,
      unavailableReason: diagnostics.unavailableReason,
      audioRouting: audioRoutingDiagnostics
        ? {
            route: audioRoutingDiagnostics.route,
            bluetoothStatus: audioRoutingDiagnostics.bluetoothStatus,
            speakerRoute: audioRoutingDiagnostics.speakerRoute,
            audioInputDeviceName: audioRoutingDiagnostics.audioInputDeviceName,
            setSinkIdSupported: audioRoutingDiagnostics.setSinkIdSupported,
            platformLimitations: audioRoutingDiagnostics.platformLimitations,
          }
        : null,
      eventCounts: diagnostics.eventCounts,
      recentLogs: diagnostics.eventLogs.slice(0, 20),
    };

    navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const filteredLogs = filterLevel === 'errors'
    ? diagnostics.eventLogs.filter(l => l.level === 'error' || l.level === 'warn')
    : diagnostics.eventLogs;

  const eventsList: Array<{ key: keyof SpeechDiagnostics['eventCounts']; label: string; desc: string }> = [
    { key: 'onstart', label: 'onstart', desc: 'Engine booted' },
    { key: 'onaudiostart', label: 'onaudiostart', desc: 'Hardware mic capturing' },
    { key: 'onsoundstart', label: 'onsoundstart', desc: 'Acoustics sensed' },
    { key: 'onspeechstart', label: 'onspeechstart', desc: 'Speech vocalized' },
    { key: 'onresult', label: 'onresult', desc: 'Hypotheses generated' },
    { key: 'onspeechend', label: 'onspeechend', desc: 'Speech finished' },
    { key: 'onsoundend', label: 'onsoundend', desc: 'Acoustic sound finished' },
    { key: 'onaudioend', label: 'onaudioend', desc: 'Hardware mic halted' },
    { key: 'onerror', label: 'onerror', desc: 'Engine failure/notice' },
    { key: 'onend', label: 'onend', desc: 'Session terminated' },
  ];

  return (
    <div
      id="speech-diagnostic-panel"
      className="p-3.5 sm:p-4 rounded-2xl bg-[#070e1b]/95 border border-cyan-500/40 shadow-xl shadow-cyan-950/40 font-mono text-xs space-y-4"
    >
      {/* Top Header & Telemetry Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-900/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-700/60 text-cyan-400">
            <Bug className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-tech font-bold uppercase tracking-wider text-cyan-200 text-sm flex items-center gap-2">
              Speech Sensor Diagnostic Hub
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/60 text-cyan-300 font-mono border border-cyan-800/60">
                LIVE TELEMETRY
              </span>
            </h3>
            <p className="text-[11px] text-cyan-400/70 font-sans">
              Real-time Web Speech API lifecycle tracer & fallback controller
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyTelemetry}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-950/70 hover:bg-cyan-900/70 border border-cyan-800/60 hover:border-cyan-500 text-cyan-300 transition-all cursor-pointer text-[11px]"
            title="Copy diagnostic report"
          >
            <Copy className="w-3 h-3" />
            <span>{isCopied ? 'Copied!' : 'Copy Telemetry'}</span>
          </button>

          <button
            onClick={onClearLogs}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900/70 hover:bg-slate-800 border border-slate-700 text-slate-300 transition-all cursor-pointer text-[11px]"
            title="Clear event logs"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Explicit Unavailable Banner if Web Speech is failing or zero words */}
      {diagnostics.isWebSpeechUnavailable && (
        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/70 text-amber-200 space-y-2 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-tech font-bold uppercase tracking-wider text-amber-300 text-xs">
                Speech Recognition unavailable in this browser/Preview
              </h4>
              <p className="text-[11px] text-amber-200/90 font-sans leading-relaxed">
                {diagnostics.unavailableReason ||
                  'The browser Web Speech API cloud socket captured 0 words or dropped the network stream in this sandboxed preview iframe. Use the Audio Stream Fallback below.'}
              </p>
              {activeMode !== 'fallback' && (
                <button
                  onClick={() => {
                    setActiveMode('fallback');
                  }}
                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-amber-100 font-mono text-xs font-semibold cursor-pointer transition-all"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>Switch to Gemini Audio Fallback</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Engine Mode Switcher */}
      <div className="p-2.5 rounded-xl bg-[#040810]/70 border border-cyan-900/50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-cyan-300 text-xs">
          <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="font-tech uppercase tracking-wide">Active Capture Engine:</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveMode('webspeech')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
              activeMode === 'webspeech'
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-100 arc-glow'
                : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-cyan-300'
            }`}
          >
            Web Speech API (Native)
          </button>
          <button
            onClick={() => setActiveMode('fallback')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
              activeMode === 'fallback'
                ? 'bg-amber-500/20 border border-amber-400 text-amber-200 arc-glow'
                : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-amber-300'
            }`}
          >
            Gemini Audio Fallback (MediaRecorder)
          </button>
        </div>
      </div>

      {/* CORE SUBSYSTEM STATUS (Requirement 8) */}
      <div className="p-3 rounded-xl bg-[#050b18] border border-cyan-500/30 space-y-2">
        <div className="flex items-center justify-between text-[11px] border-b border-cyan-900/40 pb-1.5">
          <span className="font-tech uppercase tracking-wider font-bold text-cyan-200 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            Core Subsystem & Audio Routing Diagnostics
          </span>
          <div className="flex items-center gap-1.5">
            {onRefreshAudioDevices && (
              <button
                type="button"
                onClick={onRefreshAudioDevices}
                className="px-2 py-0.5 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-[10px] cursor-pointer flex items-center gap-1"
                title="Rescan audio devices"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Rescan</span>
              </button>
            )}
            {onRequestBluetoothScan && audioRoutingDiagnostics?.webBluetoothSupported && (
              <button
                type="button"
                onClick={onRequestBluetoothScan}
                className="px-2 py-0.5 rounded bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-700 text-[10px] cursor-pointer flex items-center gap-1"
                title="Scan Bluetooth Peripherals"
              >
                <Bluetooth className="w-2.5 h-2.5" />
                <span>Pair BT</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          {/* 1. Wake word: READY */}
          <div className="p-2 rounded-lg bg-[#020611] border border-cyan-900/50 space-y-1">
            <span className="text-[10px] text-cyan-400/70 block uppercase">Wake word</span>
            <div className="flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300">READY</span>
            </div>
          </div>

          {/* 2. Microphone: READY */}
          <div className="p-2 rounded-lg bg-[#020611] border border-cyan-900/50 space-y-1">
            <span className="text-[10px] text-cyan-400/70 block uppercase">Microphone</span>
            <div className="flex items-center gap-1.5 font-bold">
              <span
                className={`w-2 h-2 rounded-full ${
                  diagnostics.micPermission === 'granted'
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-rose-400'
                }`}
              />
              <span
                className={
                  diagnostics.micPermission === 'granted'
                    ? 'text-emerald-300'
                    : 'text-rose-300'
                }
              >
                {diagnostics.micPermission === 'granted' ? 'READY' : diagnostics.micPermission.toUpperCase()}
              </span>
            </div>
          </div>

          {/* 3. AI: READY */}
          <div className="p-2 rounded-lg bg-[#020611] border border-cyan-900/50 space-y-1">
            <span className="text-[10px] text-cyan-400/70 block uppercase">AI</span>
            <div className="flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300">READY</span>
            </div>
          </div>

          {/* 4. Speaker route: Phone / Bluetooth / Unavailable */}
          <div className="p-2 rounded-lg bg-[#020611] border border-cyan-900/50 space-y-1">
            <span className="text-[10px] text-cyan-400/70 block uppercase">Speaker route</span>
            <div className="flex items-center gap-1.5 font-bold">
              {audioRoutingDiagnostics?.speakerRoute === 'Bluetooth' ? (
                <>
                  <Headphones className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-blue-300">Bluetooth</span>
                </>
              ) : audioRoutingDiagnostics?.speakerRoute === 'Phone' ? (
                <>
                  <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-cyan-200">Phone</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-400">Unavailable</span>
                </>
              )}
            </div>
          </div>

          {/* 5. Bluetooth: Connected / Disconnected / Unavailable */}
          <div className="p-2 rounded-lg bg-[#020611] border border-cyan-900/50 space-y-1">
            <span className="text-[10px] text-cyan-400/70 block uppercase">Bluetooth</span>
            <div className="flex items-center gap-1.5 font-bold">
              <Bluetooth
                className={`w-3.5 h-3.5 ${
                  audioRoutingDiagnostics?.bluetoothStatus === 'Connected'
                    ? 'text-blue-400 animate-pulse'
                    : audioRoutingDiagnostics?.bluetoothStatus === 'Disconnected'
                    ? 'text-cyan-500'
                    : 'text-slate-500'
                }`}
              />
              <span
                className={
                  audioRoutingDiagnostics?.bluetoothStatus === 'Connected'
                    ? 'text-blue-300'
                    : audioRoutingDiagnostics?.bluetoothStatus === 'Disconnected'
                    ? 'text-cyan-400/90'
                    : 'text-slate-400'
                }
              >
                {audioRoutingDiagnostics?.bluetoothStatus || 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        {/* Technical Details: Audio Routing State & Limitations */}
        <div className="mt-2 pt-2 border-t border-cyan-950 text-[11px] text-cyan-400/80 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div>
              <span className="text-cyan-500">Internal Audio Route: </span>
              <span className="font-bold text-cyan-200">
                {audioRoutingDiagnostics?.route || 'PHONE'}
              </span>
              <span className="mx-2 text-cyan-900">|</span>
              <span className="text-cyan-500">Active Input: </span>
              <span className="text-cyan-300">
                {audioRoutingDiagnostics?.audioInputDeviceName || 'System Default Microphone'}
              </span>
            </div>
            <div className="text-[10px] text-cyan-500">
              setSinkId: {audioRoutingDiagnostics?.setSinkIdSupported ? 'Supported' : 'Unavailable (Android/Safari limitation)'}
            </div>
          </div>

          {audioRoutingDiagnostics?.platformLimitations && audioRoutingDiagnostics.platformLimitations.length > 0 && (
            <div className="p-2 rounded bg-amber-950/20 border border-amber-900/40 text-amber-200/90 text-[10px] leading-relaxed space-y-0.5">
              <div className="font-bold text-amber-300">Hardware & Browser Limitations:</div>
              {audioRoutingDiagnostics.platformLimitations.map((lim, idx) => (
                <div key={idx} className="flex items-start gap-1">
                  <span className="text-amber-500">•</span>
                  <span>{lim}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* System Environment & Constructor Diagnostics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        {/* window.SpeechRecognition */}
        <div className="p-2.5 rounded-lg bg-[#040812]/80 border border-cyan-900/40 space-y-1">
          <span className="text-cyan-400/70 text-[10px] block">window.SpeechRecognition</span>
          <div className="flex items-center gap-1.5 font-bold">
            {diagnostics.hasSpeechRecognition ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">EXISTS</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-rose-300">UNDEFINED</span>
              </>
            )}
          </div>
        </div>

        {/* window.webkitSpeechRecognition */}
        <div className="p-2.5 rounded-lg bg-[#040812]/80 border border-cyan-900/40 space-y-1">
          <span className="text-cyan-400/70 text-[10px] block">window.webkitSpeechRecognition</span>
          <div className="flex items-center gap-1.5 font-bold">
            {diagnostics.hasWebkitSpeechRecognition ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">EXISTS</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-rose-300">UNDEFINED</span>
              </>
            )}
          </div>
        </div>

        {/* Recognition Constructor Being Used */}
        <div className="p-2.5 rounded-lg bg-[#040812]/80 border border-cyan-900/40 space-y-1">
          <span className="text-cyan-400/70 text-[10px] block">Constructor In Use</span>
          <span className="font-bold text-cyan-200 block truncate" title={diagnostics.constructorUsed}>
            {diagnostics.constructorUsed}
          </span>
        </div>

        {/* Microphone Permission State */}
        <div className="p-2.5 rounded-lg bg-[#040812]/80 border border-cyan-900/40 space-y-1">
          <span className="text-cyan-400/70 text-[10px] block">Microphone Permission</span>
          <div className="flex items-center gap-1 font-bold">
            <Mic className="w-3 h-3 text-cyan-400" />
            <span
              className={
                diagnostics.micPermission === 'granted'
                  ? 'text-emerald-300'
                  : diagnostics.micPermission === 'denied'
                  ? 'text-rose-400'
                  : 'text-amber-300'
              }
            >
              {diagnostics.micPermission.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Additional Environment Facts */}
      <div className="p-2 rounded-lg bg-cyan-950/20 border border-cyan-900/30 flex flex-wrap items-center justify-between gap-2 text-[11px] text-cyan-300/80">
        <div>
          <span>Environment:&nbsp;</span>
          <span className="text-cyan-200 font-bold">
            {diagnostics.isSecureContext ? 'Secure (HTTPS/Localhost)' : 'Non-Secure Context'}
          </span>
          <span className="mx-1.5 text-cyan-800">|</span>
          <span>iFrame sandbox:&nbsp;</span>
          <span className={diagnostics.isInIframe ? 'text-amber-300 font-bold' : 'text-emerald-300'}>
            {diagnostics.isInIframe ? 'YES (Preview iFrame)' : 'NO (Top level)'}
          </span>
        </div>

        {/* Exact error display */}
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-cyan-400/70">Exact onerror error:</span>
          <span
            className={`px-1.5 py-0.5 rounded font-bold ${
              diagnostics.exactError
                ? 'bg-rose-950/80 border border-rose-700/80 text-rose-300'
                : 'bg-emerald-950/40 text-emerald-400'
            }`}
          >
            {diagnostics.exactError ? diagnostics.exactError : 'None'}
          </span>
        </div>
      </div>

      {/* Live Speech Stream Hypothesis & Quality Telemetry */}
      <div className="p-3 rounded-xl bg-[#040916] border border-cyan-800/60 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-900/40 pb-2">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-cyan-400" />
            <span className="font-tech uppercase tracking-wider font-bold text-cyan-200 text-xs">
              Live Acoustic Hypothesis & Score Telemetry
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-cyan-400/80">Locale:</span>
            <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-700/60 font-bold text-cyan-300">
              {diagnostics.detectedLanguage || 'en-US'}
            </span>
            <span className="text-cyan-400/80 ml-1">Confidence:</span>
            <span
              className={`px-2 py-0.5 rounded border font-bold ${
                diagnostics.confidenceScore !== null && diagnostics.confidenceScore >= 0.85
                  ? 'bg-emerald-950/70 border-emerald-500/70 text-emerald-300'
                  : diagnostics.confidenceScore !== null
                  ? 'bg-amber-950/70 border-amber-500/70 text-amber-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              {diagnostics.confidenceScore !== null
                ? `${Math.round(diagnostics.confidenceScore * 100)}%`
                : '--'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {/* Interim Stream Display */}
          <div className="p-2.5 rounded-lg bg-[#02050c] border border-cyan-950 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-cyan-500">
              <span className="font-bold text-cyan-400 uppercase tracking-wider">Interim Hypothesis</span>
              <span>Streaming stream</span>
            </div>
            <p className="font-mono text-cyan-300/90 italic break-words min-h-[22px]">
              {diagnostics.lastInterim ? `"${diagnostics.lastInterim}"` : <span className="text-slate-600 not-italic">(idle)</span>}
            </p>
          </div>

          {/* Final Command Display */}
          <div className="p-2.5 rounded-lg bg-[#02050c] border border-emerald-950/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400">
              <span className="font-bold uppercase tracking-wider">Final Directive (Deduplicated)</span>
              <span>Debounced submission</span>
            </div>
            <p className="font-mono text-emerald-300 font-semibold break-words min-h-[22px]">
              {diagnostics.lastFinal ? `"${diagnostics.lastFinal}"` : <span className="text-slate-600 font-normal">(idle)</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Live Action Test Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[#040a14] border border-cyan-800/40">
        <div className="flex items-center gap-2">
          {isListening ? (
            <button
              onClick={onStopListening}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all cursor-pointer text-xs"
            >
              <Activity className="w-3.5 h-3.5 animate-spin" />
              <span>Halt Voice Capture</span>
            </button>
          ) : (
            <button
              onClick={onStartListening}
              disabled={isTranscribingFallback}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all cursor-pointer text-xs disabled:opacity-50"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Test Voice Sensor ({activeMode === 'webspeech' ? 'Web Speech' : 'Fallback'})</span>
            </button>
          )}

          {isTranscribingFallback && (
            <div className="flex items-center gap-1.5 text-amber-300 text-xs animate-pulse">
              <Activity className="w-3.5 h-3.5 animate-spin" />
              <span>Transcribing via Gemini...</span>
            </div>
          )}

          {onTestWakeFlow && (
            <button
              id="test-wake-pipeline-flow-button"
              onClick={onTestWakeFlow}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all cursor-pointer text-xs"
              title="Test complete cycle: 'Hey JARVIS' → command → response → return to standby"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Test “Hey JARVIS” Flow</span>
            </button>
          )}
        </div>

        <div className="text-[11px] text-cyan-400/80">
          Last Event:&nbsp;
          <span className="text-cyan-200 font-bold">
            {diagnostics.lastEvent ? `${diagnostics.lastEvent} (${diagnostics.lastEventTimestamp})` : 'Awaiting start'}
          </span>
        </div>
      </div>

      {/* Web Speech API All 10 Events Matrix */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-cyan-400/80">
          <span className="font-tech uppercase tracking-wider font-bold">
            Lifecycle Events Monitored (W3C Web Speech API)
          </span>
          <span className="text-[10px] text-cyan-500">Counts increment in real time</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {eventsList.map(ev => {
            const count = diagnostics.eventCounts[ev.key];
            const hasFired = count > 0;
            const isError = ev.key === 'onerror' && count > 0;
            const isResult = ev.key === 'onresult' && count > 0;

            return (
              <div
                key={ev.key}
                className={`p-2 rounded-lg border transition-all ${
                  isError
                    ? 'bg-rose-950/40 border-rose-600/80 text-rose-200'
                    : isResult
                    ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-200'
                    : hasFired
                    ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200'
                    : 'bg-[#03060c] border-cyan-950/60 text-cyan-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] font-mono">{ev.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold font-mono ${
                      hasFired
                        ? isError
                          ? 'bg-rose-500 text-white'
                          : isResult
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </div>
                <span className="text-[9px] text-cyan-500/70 block truncate mt-0.5">{ev.desc}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-time Event Log Terminal */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-cyan-300">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-tech uppercase tracking-wide font-bold">Event Log Terminal</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterLevel('all')}
              className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                filterLevel === 'all'
                  ? 'bg-cyan-800/80 text-cyan-100 font-bold'
                  : 'text-cyan-500 hover:text-cyan-300'
              }`}
            >
              All Events ({diagnostics.eventLogs.length})
            </button>
            <button
              onClick={() => setFilterLevel('errors')}
              className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                filterLevel === 'errors'
                  ? 'bg-rose-900/80 text-rose-200 font-bold'
                  : 'text-cyan-500 hover:text-cyan-300'
              }`}
            >
              Errors & Warnings
            </button>
          </div>
        </div>

        <div className="h-44 overflow-y-auto p-2.5 rounded-xl bg-[#02050b] border border-cyan-950 font-mono text-[11px] space-y-1 select-text">
          {filteredLogs.length === 0 ? (
            <div className="text-cyan-600/70 italic py-6 text-center">
              No events logged yet. Tap &quot;Test Voice Sensor&quot; or speak into the microphone to trace events.
            </div>
          ) : (
            filteredLogs.map(log => {
              let colorClass = 'text-cyan-300';
              if (log.level === 'error') colorClass = 'text-rose-400 font-bold';
              else if (log.level === 'warn') colorClass = 'text-amber-400';
              else if (log.level === 'success') colorClass = 'text-emerald-300 font-bold';

              return (
                <div key={log.id} className="flex items-start gap-2 border-b border-cyan-950/30 pb-0.5">
                  <span className="text-cyan-600 shrink-0 font-mono text-[10px]">{log.time}</span>
                  <span className={`shrink-0 font-bold uppercase text-[10px] px-1 rounded ${
                    log.level === 'error'
                      ? 'bg-rose-950 text-rose-400'
                      : log.level === 'warn'
                      ? 'bg-amber-950 text-amber-400'
                      : log.level === 'success'
                      ? 'bg-emerald-950 text-emerald-400'
                      : 'bg-cyan-950 text-cyan-400'
                  }`}>
                    {log.event}
                  </span>
                  <span className={`${colorClass} break-all flex-1`}>{log.details}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
