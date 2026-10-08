import { useCallback, useEffect, useRef, useState } from 'react';
import { SttProvider, TtsProvider, OrbState, TtsVoice } from '../../../shared/voice';
import { normalizeVoiceCommand } from '../lib/voiceCommands';

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
  const spokenEchoRef = useRef('');
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  useEffect(() => {
    const refreshVoices = () => setVoices(tts.listVoices());
    window.addEventListener('jarvis-desktop-changed',refreshVoices);
    if (tts.supported && typeof speechSynthesis !== 'undefined') {
      speechSynthesis.addEventListener('voiceschanged', refreshVoices);
      return () => {speechSynthesis.removeEventListener('voiceschanged', refreshVoices);window.removeEventListener('jarvis-desktop-changed',refreshVoices);};
    }
    return () => window.removeEventListener('jarvis-desktop-changed',refreshVoices);
  }, [tts]);

  useEffect(() => {
    stt.onIntermediate((text) => setPartialTranscript(text));
    stt.onFinal((text) => {
      setPartialTranscript('');
      onCommandRef.current(text);
    });
    stt.onEnd((reason) => {
      listeningRef.current = false;
      if (reason === 'no-speech' || reason === 'aborted' || reason === 'stopped') {
        setOrbState((state) => state === 'LISTENING' ? 'IDLE' : state);
      } else if (reason === 'error') {
        setOrbState('ERROR');
        setTimeout(() => setOrbState((state) => state === 'ERROR' ? 'IDLE' : state), 1500);
      }
    });
    tts.onEnd(() => {
      setOrbState((s) => (s === 'SPEAKING' ? 'IDLE' : s));
    });
    return () => {
      stt.onIntermediate(() => {});
      stt.onFinal(() => {});
      stt.onEnd(() => {});
      tts.onEnd(() => {});
      stt.abort();
      tts.cancel();
    };
  }, [stt, tts]);

  const startListening = useCallback(() => {
    if (listeningRef.current) return;
    tts.cancel();
    spokenEchoRef.current='';
    listeningRef.current = true;
    setPartialTranscript('');
    setOrbState('LISTENING');
    stt.start();
  }, [stt, tts]);

  const stopListening = useCallback(() => {
    stt.stop();
  }, [stt]);

  const abortListening = useCallback(() => {
    listeningRef.current = false;
    setPartialTranscript('');
    stt.abort();
    setOrbState((state) => state === 'LISTENING' ? 'IDLE' : state);
  }, [stt]);

  const speak = useCallback(
    (text: string, force = false) => {
      if (!text || !tts.supported) return;
      if (force) { tts.setMuted(false); setIsMuted(false); }
      if (tts.isMuted()) return;
      if (listeningRef.current) {listeningRef.current = false;stt.abort();setPartialTranscript('');}
      spokenEchoRef.current=(spokenEchoRef.current+' '+normalizeVoiceCommand(text)).slice(-32000);
      setOrbState('SPEAKING');
      tts.speak(text);
    },
    [tts, stt],
  );

  const cancelSpeaking = useCallback(() => {
    tts.cancel();
    spokenEchoRef.current='';
    setOrbState('IDLE');
  }, [tts]);
  const isSpeechEcho=useCallback((text:string)=>spokenEchoRef.current.includes(normalizeVoiceCommand(text)),[]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      tts.setMuted(next);
      if (next) setOrbState('IDLE');
      return next;
    });
  }, [tts]);

  const changeVoice = useCallback(
    (voiceURI: string) => {
      setSelectedVoice(voiceURI);
      tts.setVoice(voiceURI);
      setOrbState('IDLE');
    },
    [tts],
  );

  const setThinking = useCallback(() => setOrbState('THINKING'), []);

  const setError = useCallback(() => {
    setOrbState('ERROR');
    setTimeout(() => setOrbState((state) => state === 'ERROR' ? 'IDLE' : state), 1500);
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
    abortListening,
    speak,
    cancelSpeaking,
    isSpeechEcho,
    toggleMute,
    setThinking,
    setError,
    setOrbState,
  };
}
