export type NativeJarvisEvent =
  | { type: 'wake' }
  | { type: 'partial'; text: string }
  | { type: 'command'; text: string }
  | { type: 'error'; text: string }
  | { type: 'microphone-granted' }
  | { type: 'microphone-denied'; text?: string };

export interface NativeJarvisBridge {
  start(mode: 'wake' | 'command'): void;
  stop(): void;
  hasMicrophonePermission(): boolean | null;
  onEvent(listener: (event: NativeJarvisEvent) => void): () => void;
}

function bridge(): NativeJarvisBridge | null {
  if (typeof window === 'undefined') return null;

  const raw = (window as any).JARVIS_ANDROID;

  if (
    !raw ||
    typeof raw.start !== 'function' ||
    typeof raw.stop !== 'function'
  ) {
    return null;
  }

  return {
    start: (mode) => {
      try {
        raw.start(mode);
      } catch (error) {
        console.error('[JARVIS] Native start failed:', error);
      }
    },

    stop: () => {
      try {
        raw.stop();
      } catch (error) {
        console.error('[JARVIS] Native stop failed:', error);
      }
    },

    hasMicrophonePermission: () => {
      try {
        if (typeof raw.hasMicrophonePermission === 'function') {
          return Boolean(raw.hasMicrophonePermission());
        }

        // Older Android bridge versions do not expose this method.
        return null;
      } catch {
        return null;
      }
    },

    onEvent: (listener) => {
      const handler = (e: Event) => {
        const detail = (e as CustomEvent<NativeJarvisEvent>).detail;

        if (detail?.type) {
          listener(detail);
        }
      };

      window.addEventListener('jarvis-native-event', handler);

      return () => {
        window.removeEventListener('jarvis-native-event', handler);
      };
    },
  };
}

export function getNativeJarvisBridge(): NativeJarvisBridge | null {
  return bridge();
}

export function installNativeJarvisBridge(opts: {
  onCommand: (text: string) => void;
  onWake: () => void;
}) {
  const native = bridge();

  if (!native) {
    return () => {};
  }

  return native.onEvent((event) => {
    if (event.type === 'wake') {
      opts.onWake();
    }

    if (event.type === 'command') {
      opts.onCommand(event.text);
    }
  });
}
