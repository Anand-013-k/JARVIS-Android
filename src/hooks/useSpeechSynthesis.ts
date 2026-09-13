import { useState, useEffect, useRef, useCallback } from 'react';

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRate] = useState(1.02);
  const [pitch, setPitch] = useState(0.95);
  const [speakingPulse, setSpeakingPulse] = useState(0);

  const pulseIntervalRef = useRef<any>(null);

  // Load voices and select preferred British voice
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);

      if (voices.length > 0) {
        // Look for British English / refined male voices suitable for JARVIS
        const jarvisVoice =
          voices.find(v => v.lang === 'en-GB' && (v.name.includes('Male') || v.name.includes('George') || v.name.includes('Oliver') || v.name.includes('Daniel'))) ||
          voices.find(v => v.lang === 'en-GB') ||
          voices.find(v => v.name.includes('Google UK English Male')) ||
          voices.find(v => v.lang.startsWith('en') && v.name.includes('Male')) ||
          voices.find(v => v.lang.startsWith('en')) ||
          voices[0];

        setSelectedVoice(jarvisVoice || null);
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (pulseIntervalRef.current) clearInterval(pulseIntervalRef.current);
    };
  }, []);

  const speak = useCallback(
    (text: string): Promise<void> => {
      return new Promise((resolve) => {
        if (isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
          resolve();
          return;
        }

        // Clean text for speech (strip markdown asterisks, emojis, code tags)
        const cleanText = text
          .replace(/[*_#`~]/g, '')
          .replace(/\[.*?\]\(.*?\)/g, '')
          .replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{1F700}-\u{1F77F}|\u{1F780}-\u{1F7FF}|\u{1F800}-\u{1F8FF}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FA6F}|\u{1FA70}-\u{1FAFF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}]/gu, '')
          .trim();

        if (!cleanText) {
          resolve();
          return;
        }

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
        utterance.rate = rate;
        utterance.pitch = pitch;

        utterance.onstart = () => {
          setIsSpeaking(true);
          // Start simulated speaking waveform pulse
          if (pulseIntervalRef.current) clearInterval(pulseIntervalRef.current);
          pulseIntervalRef.current = setInterval(() => {
            setSpeakingPulse(0.3 + Math.random() * 0.7);
          }, 120);
        };

        utterance.onend = () => {
          setIsSpeaking(false);
          setSpeakingPulse(0);
          if (pulseIntervalRef.current) {
            clearInterval(pulseIntervalRef.current);
            pulseIntervalRef.current = null;
          }
          resolve();
        };

        utterance.onerror = () => {
          setIsSpeaking(false);
          setSpeakingPulse(0);
          if (pulseIntervalRef.current) {
            clearInterval(pulseIntervalRef.current);
            pulseIntervalRef.current = null;
          }
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      });
    },
    [isMuted, selectedVoice, rate, pitch]
  );

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setSpeakingPulse(0);
    if (pulseIntervalRef.current) {
      clearInterval(pulseIntervalRef.current);
      pulseIntervalRef.current = null;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (!prev) {
        stop();
      }
      return !prev;
    });
  }, [stop]);

  return {
    speak,
    stop,
    isSpeaking,
    isMuted,
    toggleMute,
    availableVoices,
    selectedVoice,
    setSelectedVoice,
    rate,
    setRate,
    pitch,
    setPitch,
    speakingPulse,
  };
}
