import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Battery, BatteryCharging, Volume2, VolumeX, ShieldCheck, Radio, Bluetooth, Headphones, Smartphone } from 'lucide-react';
import { DeviceState } from '../types/jarvis';
import { AudioRouteState, BluetoothStatus } from '../types/audioRouting';

interface AndroidStatusBarProps {
  deviceState: DeviceState;
  isListening: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  wakeWordActive: boolean;
  audioRoute?: AudioRouteState;
  bluetoothStatus?: BluetoothStatus;
}

export const AndroidStatusBar: React.FC<AndroidStatusBarProps> = ({
  deviceState,
  isListening,
  isMuted,
  onToggleMute,
  wakeWordActive,
  audioRoute = 'PHONE',
  bluetoothStatus = 'Disconnected',
}) => {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="w-full bg-[#070d18]/90 backdrop-blur-md border-b border-cyan-900/40 px-4 py-2 flex items-center justify-between text-xs font-mono text-cyan-200 select-none z-30">
      {/* Left: Clock and Android Core Identifier */}
      <div className="flex items-center gap-2.5">
        <span className="font-semibold text-cyan-100 tracking-wider">{timeStr}</span>
        <div className="h-3 w-px bg-cyan-800/60" />
        <div className="flex items-center gap-1.5 text-[11px] text-cyan-400">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-tech uppercase tracking-wider">JARVIS OS • v2.4</span>
        </div>
      </div>

      {/* Center: Active Privacy / Mic Sensor Dot */}
      <div className="flex items-center gap-2">
        {isListening && (
          <div className="flex items-center gap-1 bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>MIC ACTIVE</span>
          </div>
        )}
        {wakeWordActive && !isListening && (
          <div className="flex items-center gap-1 bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 px-2 py-0.5 rounded-full text-[10px]">
            <Radio className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '6s' }} />
            <span>&quot;HEY JARVIS&quot; READY</span>
          </div>
        )}
      </div>

      {/* Right: Android Telemetry Icons */}
      <div className="flex items-center gap-3">
        {/* Audio Routing & Bluetooth Indicator */}
        <div
          className="flex items-center gap-1 text-[11px]"
          title={`Audio Route: ${audioRoute} | Bluetooth: ${bluetoothStatus}`}
        >
          {audioRoute === 'BLUETOOTH' ? (
            <div className="flex items-center gap-1 text-blue-400">
              <Headphones className="w-3.5 h-3.5 animate-pulse" />
              <span className="font-bold text-[10px] hidden sm:inline">BT</span>
            </div>
          ) : audioRoute === 'PHONE' ? (
            <div className="flex items-center gap-0.5 text-cyan-400/80">
              <Smartphone className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="flex items-center gap-0.5 text-slate-500">
              <Volume2 className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Voice Audio Mute Toggle */}
        <button
          id="toggle-voice-audio-mute"
          onClick={onToggleMute}
          title={isMuted ? 'Voice Muted - Click to Unmute' : 'Voice Active - Click to Mute'}
          className={`p-1 rounded transition-colors ${
            isMuted ? 'text-rose-400 hover:bg-rose-950/40' : 'text-cyan-400 hover:bg-cyan-950/40'
          }`}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        {/* Wi-Fi Icon */}
        <div className="flex items-center" title={`Wi-Fi: ${deviceState.wifi ? 'Connected' : 'Disconnected'}`}>
          {deviceState.wifi ? (
            <Wifi className="w-3.5 h-3.5 text-cyan-400" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-rose-400/80" />
          )}
        </div>

        {/* 5G Signal */}
        <div className="flex items-end gap-0.5 h-3" title="5G Cellular Uplink: Nominal">
          <div className="w-0.5 h-1 bg-cyan-400 rounded-xs" />
          <div className="w-0.5 h-1.5 bg-cyan-400 rounded-xs" />
          <div className="w-0.5 h-2 bg-cyan-400 rounded-xs" />
          <div className="w-0.5 h-2.5 bg-cyan-400 rounded-xs" />
        </div>

        {/* Battery Telemetry */}
        <div className="flex items-center gap-1" title={`Battery: ${deviceState.batteryLevel}%`}>
          <span className="text-[11px] text-cyan-300">{deviceState.batteryLevel}%</span>
          {deviceState.batterySaver ? (
            <BatteryCharging className="w-4 h-4 text-amber-400" />
          ) : (
            <Battery className="w-4 h-4 text-cyan-400" />
          )}
        </div>
      </div>
    </header>
  );
};
