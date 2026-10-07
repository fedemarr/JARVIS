import { useCallback, useEffect, useRef, useState } from 'react';
import { SttProvider, TtsProvider, OrbState, TtsVoice } from '../../../shared/voice';

export interface UseSpeechOptions {
  stt: SttProvider;
  tts: TtsProvider;
  onCommand: (text: string) => void;
}

export function useSpeech({ stt, tts, onCommand }: UseSpeechOptions) {
  const [orbState, setOrbState] = useState<OrbState>('IDLE');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(() => tts.isMuted());
  const [sttSupported] = useState(() => stt.supported);
  const [ttsSupported] = useState(() => tts.supported);
  const [voices, setVoices] = useState<TtsVoice[]>(() => tts.listVoices());
  const [selectedVoice, setSelectedVoice] = useState<string | null>(() => tts.getSelectedVoice());
  const listeningRef = useRef(false);
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  useEffect(() => {
    const refreshVoices = () => setVoices(tts.listVoices());
    if (tts.supported && typeof speechSynthesis !== 'undefined') {
      speechSynthesis.addEventListener('voiceschanged', refreshVoices);
      return () => speechSynthesis.removeEventListener('voiceschanged', refreshVoices);
    }
  }, [tts]);

  useEffect(() => {
    stt.onIntermediate((text) => setPartialTranscript(text));
    stt.onFinal((text) => {
      setPartialTranscript('');
      onCommandRef.current(text);
    });
    stt.onEnd((reason) => {
      listeningRef.current = false;
      if (reason === 'no-speech' || reason === 'aborted') {
        setOrbState('IDLE');
      } else if (reason === 'error') {
        setOrbState('ERROR');
        setTimeout(() => setOrbState('IDLE'), 1500);
      }
    });
    tts.onEnd(() => {
      setOrbState((s) => (s === 'SPEAKING' ? 'IDLE' : s));
    });
  }, [stt, tts]);

  const startListening = useCallback(() => {
    if (listeningRef.current) return;
    listeningRef.current = true;
    setPartialTranscript('');
    setOrbState('LISTENING');
    stt.start();
  }, [stt]);

  const stopListening = useCallback(() => {
    stt.stop();
  }, [stt]);

  const speak = useCallback(
    (text: string) => {
      if (!text || tts.isMuted()) return;
      setOrbState('SPEAKING');
      tts.speak(text);
    },
    [tts],
  );

  const cancelSpeaking = useCallback(() => {
    tts.cancel();
    setOrbState('IDLE');
  }, [tts]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      tts.setMuted(next);
      return next;
    });
  }, [tts]);

  const changeVoice = useCallback(
    (voiceURI: string) => {
      setSelectedVoice(voiceURI);
      tts.setVoice(voiceURI);
    },
    [tts],
  );

  const setThinking = useCallback(() => setOrbState('THINKING'), []);

  const setError = useCallback(() => {
    setOrbState('ERROR');
    setTimeout(() => setOrbState('IDLE'), 1500);
  }, []);

  return {
    orbState,
    partialTranscript,
    isMuted,
    sttSupported,
    ttsSupported,
    voices,
    selectedVoice,
    changeVoice,
    startListening,
    stopListening,
    speak,
    cancelSpeaking,
    toggleMute,
    setThinking,
    setError,
    setOrbState,
  };
}
