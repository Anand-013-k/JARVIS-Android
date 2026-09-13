import React, { useState } from 'react';
import {
  Layers,
  Radio,
  Code,
  CheckCircle,
  ExternalLink,
  Cpu,
  Terminal,
  Zap,
  Sliders,
} from 'lucide-react';
import { toolRegistry } from '../services/toolRegistry';
import { WakeWordControlCard } from './WakeWordControlCard';
import { JarvisPipelineStatus } from '../types/jarvis';

interface ModularToolsDrawerProps {
  wakeWordEnabled: boolean;
  onToggleWakeWord: () => void;
  pipelineStatus: JarvisPipelineStatus;
  speechRate: number;
  setSpeechRate: React.Dispatch<React.SetStateAction<number>>;
  speechPitch: number;
  setSpeechPitch: React.Dispatch<React.SetStateAction<number>>;
  micPermission?: 'granted' | 'denied' | 'prompt' | 'unknown';
  onRequestMicPermission?: () => void;
  exactError?: string | null;
}

export const ModularToolsDrawer: React.FC<ModularToolsDrawerProps> = ({
  wakeWordEnabled,
  onToggleWakeWord,
  pipelineStatus,
  speechRate,
  setSpeechRate,
  speechPitch,
  setSpeechPitch,
  micPermission = 'unknown',
  onRequestMicPermission,
  exactError,
}) => {
  const tools = toolRegistry.getAllDefinitions();
  const [activeTab, setActiveTab] = useState<'modules' | 'speech' | 'docs'>('modules');

  return (
    <div className="bg-[#091120]/80 border border-cyan-900/40 rounded-xl p-4 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-cyan-900/30">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="font-display font-semibold text-sm tracking-wider uppercase text-cyan-200">
            JARVIS Modular Architecture
          </h3>
        </div>
        <div className="flex items-center gap-1 bg-cyan-950/60 p-0.5 rounded border border-cyan-900/50 text-[10px] font-mono">
          <button
            onClick={() => setActiveTab('modules')}
            className={`px-2 py-0.5 rounded transition-colors ${
              activeTab === 'modules' ? 'bg-cyan-500/30 text-cyan-200 font-semibold' : 'text-cyan-400/60'
            }`}
          >
            Subsystems
          </button>
          <button
            onClick={() => setActiveTab('speech')}
            className={`px-2 py-0.5 rounded transition-colors ${
              activeTab === 'speech' ? 'bg-cyan-500/30 text-cyan-200 font-semibold' : 'text-cyan-400/60'
            }`}
          >
            Voice Config
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`px-2 py-0.5 rounded transition-colors ${
              activeTab === 'docs' ? 'bg-cyan-500/30 text-cyan-200 font-semibold' : 'text-cyan-400/60'
            }`}
          >
            Extensibility
          </button>
        </div>
      </div>

      {/* Subsystems Tab */}
      {activeTab === 'modules' && (
        <div className="mt-3 space-y-3">
          {/* Hands-Free Wake Word Mode Control Card */}
          <WakeWordControlCard
            wakeWordEnabled={wakeWordEnabled}
            onToggleWakeWord={onToggleWakeWord}
            status={pipelineStatus}
            micPermission={micPermission}
            onRequestMicPermission={onRequestMicPermission}
            exactError={exactError}
          />

          {/* Registered Tools List */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono text-cyan-400/70 uppercase tracking-wider block">
              Registered Tool Handlers ({tools.length} active in Registry)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tools.map(tool => (
                <div
                  key={tool.id}
                  className="p-2.5 bg-[#060d18] border border-cyan-900/40 rounded-lg space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-cyan-300">
                      {tool.name}
                    </span>
                    <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-0.5">
                      <CheckCircle className="w-2.5 h-2.5" />
                      <span>Ready</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-cyan-400/80 font-sans line-clamp-2">
                    {tool.description}
                  </p>
                  <div className="text-[9px] font-mono text-cyan-600">
                    params: {tool.parametersDescription}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Voice Configuration Tab */}
      {activeTab === 'speech' && (
        <div className="mt-3 space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs font-mono text-cyan-300 mb-1">
              <span>Speech Cadence / Rate</span>
              <span className="text-cyan-100">{speechRate.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.3"
              step="0.05"
              value={speechRate}
              onChange={e => setSpeechRate(Number(e.target.value))}
              className="w-full h-1.5 bg-cyan-950 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-cyan-600 mt-0.5">
              <span>Deliberate (0.8x)</span>
              <span>Default (1.02x)</span>
              <span>Swift (1.3x)</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-mono text-cyan-300 mb-1">
              <span>Acoustic Pitch</span>
              <span className="text-cyan-100">{speechPitch.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.2"
              step="0.05"
              value={speechPitch}
              onChange={e => setSpeechPitch(Number(e.target.value))}
              className="w-full h-1.5 bg-cyan-950 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-cyan-600 mt-0.5">
              <span>Resonant / Deep (0.75)</span>
              <span>JARVIS British (0.95)</span>
              <span>High (1.20)</span>
            </div>
          </div>

          <div className="p-2.5 bg-cyan-950/20 border border-cyan-900/40 rounded-lg text-xs font-sans text-cyan-300">
            <span className="font-semibold text-cyan-200">Acoustic Engine Profile:</span> Automatically prioritizes available British English system voices (&apos;en-GB&apos;, &apos;Google UK English Male&apos;, &apos;Daniel&apos;, &apos;Arthur&apos;) for the authentic JARVIS cadence.
          </div>
        </div>
      )}

      {/* Extensibility & Developer Guide Tab */}
      {activeTab === 'docs' && (
        <div className="mt-3 space-y-2.5">
          <p className="text-xs text-cyan-300 font-sans leading-relaxed">
            The JARVIS architecture uses a decoupled <strong>Tool Registry</strong> pattern. You can register new tools in client or server without touching core agent loops:
          </p>
          <div className="bg-[#050b14] border border-cyan-900/60 rounded p-2.5 font-mono text-[11px] text-cyan-300/90 overflow-x-auto">
            <pre className="text-emerald-400">// Adding a new modular tool is this simple:</pre>
            <pre className="text-cyan-300">{`toolRegistry.register({
  definition: {
    id: "spotify_music",
    name: "play_music",
    category: "device",
    description: "Plays requested track on Android music player",
    enabled: true,
    parametersDescription: "trackName, artist"
  },
  execute: async (args, context) => {
    // Custom logic or native API bridge
    return { success: true, output: "Playing " + args.trackName };
  }
});`}</pre>
          </div>
          <p className="text-[11px] text-cyan-400/70 font-mono">
            Supported future integrations: Android Intent bridges, Home Assistant, Spotify SDK, Google Calendar, and Custom LLM plugins.
          </p>
        </div>
      )}
    </div>
  );
};
