import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AudioRouteState,
  BluetoothStatus,
  SpeakerRouteStatus,
  AudioDeviceInfo,
  AudioRoutingDiagnostics,
} from '../types/audioRouting';

interface UseAudioRoutingOptions {
  onTelemetry?: (event: string, detail: string, level?: 'info' | 'success' | 'warn' | 'error') => void;
}

const BT_KEYWORDS = ['bluetooth', 'bt', 'airpods', 'galaxy buds', 'freebuds', 'headset', 'headphones', 'wireless', 'hands-free', 'hfp', 'a2dp'];

function isBluetoothLabel(label: string): boolean {
  if (!label) return false;
  const lower = label.toLowerCase();
  return BT_KEYWORDS.some(kw => lower.includes(kw));
}

export function useAudioRouting(options?: UseAudioRoutingOptions) {
  const { onTelemetry } = options || {};

  const [route, setRoute] = useState<AudioRouteState>('PHONE');
  const [bluetoothStatus, setBluetoothStatus] = useState<BluetoothStatus>('Disconnected');
  const [speakerRoute, setSpeakerRoute] = useState<SpeakerRouteStatus>('Phone');
  const [preferredInputDeviceId, setPreferredInputDeviceId] = useState<string | null>(null);
  const [preferredOutputDeviceId, setPreferredOutputDeviceId] = useState<string | null>(null);

  const [diagnostics, setDiagnostics] = useState<AudioRoutingDiagnostics>({
    route: 'PHONE',
    bluetoothStatus: 'Disconnected',
    speakerRoute: 'Phone',
    audioInputDeviceName: null,
    audioOutputDeviceName: null,
    setSinkIdSupported: typeof window !== 'undefined' && 'setSinkId' in (window.Audio?.prototype || {}),
    webBluetoothSupported: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
    bluetoothPermissionState: 'unknown',
    platformLimitations: [],
    detectedDevices: [],
  });

  // Track previous route to trigger telemetry on transitions
  const prevRouteRef = useRef<AudioRouteState>('PHONE');
  const prevBtStatusRef = useRef<BluetoothStatus>('Disconnected');
  const isInitialScanRef = useRef(true);

  // Scan media devices using standard navigator.mediaDevices.enumerateDevices()
  const inspectDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      const limitations = ['navigator.mediaDevices.enumerateDevices is not supported in this browser'];
      setRoute('UNAVAILABLE');
      setBluetoothStatus('Unavailable');
      setSpeakerRoute('Unavailable');
      setDiagnostics(prev => ({
        ...prev,
        route: 'UNAVAILABLE',
        bluetoothStatus: 'Unavailable',
        speakerRoute: 'Unavailable',
        platformLimitations: limitations,
      }));
      if (prevRouteRef.current !== 'UNAVAILABLE') {
        onTelemetry?.('AUDIO_ROUTE_UNAVAILABLE', 'Media device enumeration unsupported', 'warn');
        prevRouteRef.current = 'UNAVAILABLE';
      }
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const detected: AudioDeviceInfo[] = devices.map(d => ({
        deviceId: d.deviceId,
        kind: d.kind,
        label: d.label || `${d.kind} (${d.deviceId.slice(0, 5)}...)`,
        groupId: d.groupId,
        isBluetooth: isBluetoothLabel(d.label),
      }));

      const setSinkIdSupported = 'setSinkId' in (window.Audio?.prototype || {}) || 'setSinkId' in HTMLMediaElement.prototype;
      const webBluetoothSupported = 'bluetooth' in navigator;

      const limitations: string[] = [];
      if (!setSinkIdSupported) {
        limitations.push('Audio output selection (setSinkId) is unsupported on mobile Chrome/Android or Safari. Browser routes system output automatically.');
      }
      if (!webBluetoothSupported) {
        limitations.push('Web Bluetooth API is unsupported in this browser/container context.');
      } else {
        limitations.push('Web Bluetooth requires direct GATT pairing and cannot intercept OS A2DP/HFP system audio routing.');
      }

      // Check for bluetooth devices in audio inputs and outputs
      const btInput = detected.find(d => d.kind === 'audioinput' && d.isBluetooth);
      const btOutput = detected.find(d => d.kind === 'audiooutput' && d.isBluetooth);
      const anyBluetoothDevice = Boolean(btInput || btOutput);

      const defaultInput = detected.find(d => d.kind === 'audioinput');
      const defaultOutput = detected.find(d => d.kind === 'audiooutput');

      let newRoute: AudioRouteState = 'PHONE';
      let newBtStatus: BluetoothStatus = 'Disconnected';
      let newSpeakerRoute: SpeakerRouteStatus = 'Phone';

      if (anyBluetoothDevice) {
        newRoute = 'BLUETOOTH';
        newBtStatus = 'Connected';
        newSpeakerRoute = 'Bluetooth';
      } else if (detected.length === 0) {
        newRoute = 'UNKNOWN';
        newBtStatus = 'Unavailable';
        newSpeakerRoute = 'Unavailable';
      } else {
        newRoute = 'PHONE';
        newBtStatus = 'Disconnected';
        newSpeakerRoute = 'Phone';
      }

      const activeInput = btInput || defaultInput;
      const activeOutput = btOutput || defaultOutput;

      setRoute(newRoute);
      setBluetoothStatus(newBtStatus);
      setSpeakerRoute(newSpeakerRoute);
      setPreferredInputDeviceId(activeInput ? activeInput.deviceId : null);
      setPreferredOutputDeviceId(activeOutput ? activeOutput.deviceId : null);

      setDiagnostics({
        route: newRoute,
        bluetoothStatus: newBtStatus,
        speakerRoute: newSpeakerRoute,
        audioInputDeviceName: activeInput ? activeInput.label : 'Default Microphone',
        audioOutputDeviceName: activeOutput ? activeOutput.label : 'Default Speaker',
        setSinkIdSupported,
        webBluetoothSupported,
        bluetoothPermissionState: 'granted',
        platformLimitations: limitations,
        detectedDevices: detected,
      });

      // Telemetry emissions
      if (isInitialScanRef.current) {
        isInitialScanRef.current = false;
        if (newRoute === 'BLUETOOTH') {
          onTelemetry?.('BLUETOOTH_CONNECTED', `Detected Bluetooth audio profile: ${activeInput?.label || activeOutput?.label || 'Bluetooth Device'}`, 'success');
          onTelemetry?.('AUDIO_ROUTE_CHANGED', `Audio route initialized to BLUETOOTH (speaker: ${newSpeakerRoute}, mic: ${activeInput?.label})`, 'info');
        } else {
          onTelemetry?.('AUDIO_ROUTE_CHANGED', `Audio route initialized to PHONE (integrated mic and speaker)`, 'info');
        }
      } else {
        if (prevBtStatusRef.current !== newBtStatus) {
          if (newBtStatus === 'Connected') {
            onTelemetry?.('BLUETOOTH_CONNECTED', `Bluetooth audio connected: ${activeInput?.label || activeOutput?.label || 'Wireless Device'}`, 'success');
          } else if (prevBtStatusRef.current === 'Connected' && newBtStatus === 'Disconnected') {
            onTelemetry?.('BLUETOOTH_DISCONNECTED', 'Bluetooth disconnected. Automatically reverted audio route to PHONE.', 'warn');
          }
          prevBtStatusRef.current = newBtStatus;
        }

        if (prevRouteRef.current !== newRoute) {
          onTelemetry?.('AUDIO_ROUTE_CHANGED', `Audio route transitioned from ${prevRouteRef.current} to ${newRoute}`, 'info');
          prevRouteRef.current = newRoute;
        }
      }
    } catch (err: any) {
      setRoute('UNKNOWN');
      setBluetoothStatus('Unavailable');
      setSpeakerRoute('Unavailable');
      setDiagnostics(prev => ({
        ...prev,
        route: 'UNKNOWN',
        bluetoothStatus: 'Unavailable',
        speakerRoute: 'Unavailable',
        platformLimitations: [`Device enumeration error: ${err?.message || err}`],
      }));
      if (prevRouteRef.current !== 'UNKNOWN') {
        onTelemetry?.('AUDIO_ROUTE_UNAVAILABLE', `Device query failed: ${err?.message || err}`, 'warn');
        prevRouteRef.current = 'UNKNOWN';
      }
    }
  }, [onTelemetry]);

  // Listen to devicechange events from navigator.mediaDevices
  useEffect(() => {
    inspectDevices();

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      const handleDeviceChange = () => {
        inspectDevices();
      };
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }
  }, [inspectDevices]);

  // Request Bluetooth scan (transparent Web Bluetooth detection when available)
  const requestBluetoothScan = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      onTelemetry?.('AUDIO_ROUTE_UNAVAILABLE', 'Web Bluetooth API not available on this browser/platform', 'warn');
      return;
    }
    try {
      const bt = (navigator as any).bluetooth;
      onTelemetry?.('AUDIO_ROUTE_CHANGED', 'Opening browser Bluetooth scanner...', 'info');
      const device = await bt.requestDevice({
        acceptAllDevices: true,
      });
      if (device) {
        onTelemetry?.('BLUETOOTH_CONNECTED', `Paired with Bluetooth accessory: ${device.name || 'Wireless Peripheral'}`, 'success');
        inspectDevices();
      }
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        onTelemetry?.('AUDIO_ROUTE_UNAVAILABLE', `Bluetooth pairing request: ${err.message || err}`, 'warn');
      }
    }
  }, [inspectDevices, onTelemetry]);

  return {
    route,
    bluetoothStatus,
    speakerRoute,
    preferredInputDeviceId,
    preferredOutputDeviceId,
    diagnostics,
    refreshDevices: inspectDevices,
    requestBluetoothScan,
  };
}
