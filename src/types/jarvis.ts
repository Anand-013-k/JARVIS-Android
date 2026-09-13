import type React from 'react';

export type AssistantState = 'idle' | 'wake_detected' | 'listening' | 'processing' | 'speaking';

export type JarvisPipelineStatus = 'STANDBY' | 'WAKE_DETECTED' | 'WAKE DETECTED' | 'LISTENING' | 'PROCESSING' | 'SPEAKING';


export interface PipelineTransitionLog {
  id: string;
  timestamp: number;
  from: JarvisPipelineStatus;
  to: JarvisPipelineStatus;
  reason?: string;
}

export interface JarvisToolCall {
  name: string;
  args: Record<string, any>;
  result?: any;
  status?: 'pending' | 'success' | 'failed';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: JarvisToolCall[];
  isSpeaking?: boolean;
}

export interface DeviceState {
  flashlight: boolean;
  volume: number; // 0 - 100
  wifi: boolean;
  bluetooth: boolean;
  brightness: number; // 0 - 100
  batteryLevel: number; // 0 - 100
  batterySaver: boolean;
  activeApp: string | null;
  doNotDisturb: boolean;
}

export interface MemoryItem {
  id: string;
  key: string;
  value: string;
  category: 'preference' | 'personal' | 'routine' | 'contact' | 'work';
  timestamp: number;
}

export interface ReminderItem {
  id: string;
  title: string;
  dueTimestamp: number;
  completed: boolean;
  priority: 'normal' | 'urgent';
  createdAt: number;
}

export interface JarvisNote {
  id: string;
  title: string;
  content: string;
  timestamp: number;
}

export interface ToolDefinition {
  id: string;
  name: string;
  category: 'device' | 'memory' | 'productivity' | 'search';
  description: string;
  enabled: boolean;
  parametersDescription: string;
}

export interface JarvisContext {
  deviceState: DeviceState;
  setDeviceState: React.Dispatch<React.SetStateAction<DeviceState>>;
  memories: MemoryItem[];
  setMemories: React.Dispatch<React.SetStateAction<MemoryItem[]>>;
  reminders: ReminderItem[];
  setReminders: React.Dispatch<React.SetStateAction<ReminderItem[]>>;
  notes: JarvisNote[];
  setNotes: React.Dispatch<React.SetStateAction<JarvisNote[]>>;
  notify: (title: string, message: string) => void;
}
