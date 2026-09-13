import React from 'react';
import {
  Flashlight,
  Volume2,
  Wifi,
  Bluetooth,
  Sun,
  BatteryCharging,
  Smartphone,
  Camera,
  MapPin,
  Calculator,
  FileText,
  Settings,
  Music,
} from 'lucide-react';
import { DeviceState } from '../types/jarvis';

interface DeviceControlsCardProps {
  deviceState: DeviceState;
  setDeviceState: React.Dispatch<React.SetStateAction<DeviceState>>;
  onDeviceActionSpoken?: (actionName: string) => void;
}

export const DeviceControlsCard: React.FC<DeviceControlsCardProps> = ({
  deviceState,
  setDeviceState,
}) => {
  const toggleFlashlight = () => {
    setDeviceState(prev => ({ ...prev, flashlight: !prev.flashlight }));
  };

  const toggleWifi = () => {
    setDeviceState(prev => ({ ...prev, wifi: !prev.wifi }));
  };

  const toggleBluetooth = () => {
    setDeviceState(prev => ({ ...prev, bluetooth: !prev.bluetooth }));
  };

  const toggleBatterySaver = () => {
    setDeviceState(prev => ({ ...prev, batterySaver: !prev.batterySaver }));
  };

  const setVolume = (val: number) => {
    setDeviceState(prev => ({ ...prev, volume: val }));
  };

  const setBrightness = (val: number) => {
    setDeviceState(prev => ({ ...prev, brightness: val }));
  };

  const launchApp = (appName: string) => {
    setDeviceState(prev => ({ ...prev, activeApp: appName }));
  };

  return (
    <div className="bg-[#091120]/80 border border-cyan-900/40 rounded-xl p-4 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-cyan-900/30">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-cyan-400" />
          <h3 className="font-display font-semibold text-sm tracking-wider uppercase text-cyan-200">
            Android Device Telemetry
          </h3>
        </div>
        <span className="text-[10px] font-mono text-cyan-400/70 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
          HARDWARE API V2
        </span>
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3">
        {/* Flashlight */}
        <button
          id="device-toggle-flashlight"
          onClick={toggleFlashlight}
          className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all cursor-pointer ${
            deviceState.flashlight
              ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/20'
              : 'bg-cyan-950/20 border-cyan-900/40 text-cyan-400/80 hover:border-cyan-700'
          }`}
        >
          <Flashlight className={`w-5 h-5 mb-1.5 ${deviceState.flashlight ? 'text-amber-300 animate-pulse' : ''}`} />
          <span className="text-xs font-tech font-semibold uppercase tracking-wider">Flashlight</span>
          <span className="text-[10px] font-mono text-cyan-400/60">
            {deviceState.flashlight ? 'ACTIVE' : 'OFF'}
          </span>
        </button>

        {/* Wi-Fi */}
        <button
          id="device-toggle-wifi"
          onClick={toggleWifi}
          className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all cursor-pointer ${
            deviceState.wifi
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-500/20'
              : 'bg-cyan-950/20 border-cyan-900/40 text-cyan-400/60 hover:border-cyan-700'
          }`}
        >
          <Wifi className="w-5 h-5 mb-1.5" />
          <span className="text-xs font-tech font-semibold uppercase tracking-wider">Wi-Fi</span>
          <span className="text-[10px] font-mono text-cyan-400/60">
            {deviceState.wifi ? 'ONLINE' : 'MUTED'}
          </span>
        </button>

        {/* Bluetooth */}
        <button
          id="device-toggle-bluetooth"
          onClick={toggleBluetooth}
          className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all cursor-pointer ${
            deviceState.bluetooth
              ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300 shadow-md shadow-indigo-500/20'
              : 'bg-cyan-950/20 border-cyan-900/40 text-cyan-400/60 hover:border-cyan-700'
          }`}
        >
          <Bluetooth className="w-5 h-5 mb-1.5" />
          <span className="text-xs font-tech font-semibold uppercase tracking-wider">Bluetooth</span>
          <span className="text-[10px] font-mono text-cyan-400/60">
            {deviceState.bluetooth ? 'PAIRED' : 'STANDBY'}
          </span>
        </button>

        {/* Battery Saver */}
        <button
          id="device-toggle-batterysaver"
          onClick={toggleBatterySaver}
          className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all cursor-pointer ${
            deviceState.batterySaver
              ? 'bg-amber-500/20 border-amber-400 text-amber-300'
              : 'bg-cyan-950/20 border-cyan-900/40 text-cyan-400/60 hover:border-cyan-700'
          }`}
        >
          <BatteryCharging className="w-5 h-5 mb-1.5" />
          <span className="text-xs font-tech font-semibold uppercase tracking-wider">Eco Saver</span>
          <span className="text-[10px] font-mono text-cyan-400/60">
            {deviceState.batterySaver ? 'ENGAGED' : 'STANDARD'}
          </span>
        </button>
      </div>

      {/* Sliders: Volume & Brightness */}
      <div className="space-y-3 pt-2">
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-cyan-300 mb-1">
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Audio Gain</span>
            </span>
            <span className="font-semibold text-cyan-200">{deviceState.volume}%</span>
          </div>
          <input
            id="device-volume-slider"
            type="range"
            min="0"
            max="100"
            value={deviceState.volume}
            onChange={e => setVolume(Number(e.target.value))}
            className="w-full h-1.5 bg-cyan-950 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs font-mono text-cyan-300 mb-1">
            <span className="flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-cyan-400" />
              <span>Luminance</span>
            </span>
            <span className="font-semibold text-cyan-200">{deviceState.brightness}%</span>
          </div>
          <input
            id="device-brightness-slider"
            type="range"
            min="10"
            max="100"
            value={deviceState.brightness}
            onChange={e => setBrightness(Number(e.target.value))}
            className="w-full h-1.5 bg-cyan-950 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>
      </div>

      {/* Android App Launcher Hub */}
      <div className="mt-3 pt-3 border-t border-cyan-900/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-tech text-cyan-400/80 uppercase tracking-wider">
            Quick Android App Protocol
          </span>
          {deviceState.activeApp && (
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
              Active: {deviceState.activeApp}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { name: 'Camera', icon: Camera },
            { name: 'Maps', icon: MapPin },
            { name: 'Calculator', icon: Calculator },
            { name: 'Notes', icon: FileText },
            { name: 'Music', icon: Music },
            { name: 'Settings', icon: Settings },
          ].map(app => {
            const Icon = app.icon;
            const isActive = deviceState.activeApp === app.name;
            return (
              <button
                key={app.name}
                id={`launch-app-${app.name.toLowerCase()}`}
                onClick={() => launchApp(app.name)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-tech transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-500/30 border border-cyan-400 text-cyan-200 shadow-sm'
                    : 'bg-cyan-950/40 border border-cyan-900/50 text-cyan-400/80 hover:border-cyan-700'
                }`}
              >
                <Icon className="w-3 h-3 text-cyan-400" />
                <span>{app.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
