export type NativeJarvisEvent =
  | { type: 'wake' }
  | { type: 'partial'; text: string }
  | { type: 'command'; text: string }
  | { type: 'error'; text: string };

export interface NativeJarvisBridge {
  start(mode: 'wake' | 'command'): void;
  stop(): void;
  onEvent(listener: (event: NativeJarvisEvent) => void): () => void;
}

function bridge(): NativeJarvisBridge | null {
  if (typeof window === 'undefined') return null;
  const raw = (window as any).JARVIS_ANDROID;
  if (!raw || typeof raw.start !== 'function' || typeof raw.stop !== 'function') return null;
  return {
    start: (mode) => raw.start(mode),
    stop: () => raw.stop(),
    onEvent: listener => {
      const handler = (e: Event) => {
        const detail = (e as CustomEvent<NativeJarvisEvent>).detail;
        if (detail?.type) listener(detail);
      };
      window.addEventListener('jarvis-native-event', handler);
      return () => window.removeEventListener('jarvis-native-event', handler);
    },
  };
}

export function getNativeJarvisBridge(): NativeJarvisBridge | null {
  return bridge();
}

export function installNativeJarvisBridge(opts: { onCommand: (text: string) => void; onWake: () => void }) {
  const native = bridge();
  if (!native) return () => {};
  return native.onEvent(event => {
    if (event.type === 'wake') opts.onWake();
    if (event.type === 'command') opts.onCommand(event.text);
  });
}
