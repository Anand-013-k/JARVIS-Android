// Audio routing & Bluetooth detection service for Web / Android environments
export type AudioRouteState = 'PHONE' | 'BLUETOOTH' | 'UNKNOWN' | 'UNAVAILABLE';
export type BluetoothStatus = 'Connected' | 'Disconnected' | 'Unavailable';
export type SpeakerRouteStatus = 'Phone' | 'Bluetooth' | 'Unavailable';

export interface AudioDeviceInfo {
  deviceId: string;
  kind: MediaDeviceKind;
  label: string;
  groupId: string;
  isBluetooth: boolean;
}

export interface AudioRoutingDiagnostics {
  route: AudioRouteState;
  bluetoothStatus: BluetoothStatus;
  speakerRoute: SpeakerRouteStatus;
  audioInputDeviceName: string | null;
  audioOutputDeviceName: string | null;
  setSinkIdSupported: boolean;
  webBluetoothSupported: boolean;
  bluetoothPermissionState: string;
  platformLimitations: string[];
  detectedDevices: AudioDeviceInfo[];
}

export interface BluetoothAudioState {
  route: AudioRouteState;
  bluetoothStatus: BluetoothStatus;
  speakerRoute: SpeakerRouteStatus;
  diagnostics: AudioRoutingDiagnostics;
  preferredInputDeviceId: string | null;
  preferredOutputDeviceId: string | null;
  refreshDevices: () => Promise<void>;
  requestBluetoothScan?: () => Promise<void>;
}
