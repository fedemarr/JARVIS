import { SttProvider, TtsProvider, SttEndReason, TtsVoice } from '../../../shared/voice';

const RecognitionCtor: SpeechRecognitionConstructor | undefined =
  typeof webkitSpeechRecognition !== 'undefined'
    ? webkitSpeechRecognition
    : typeof SpeechRecognition !== 'undefined'
      ? SpeechRecognition
      : undefined;

class BrowserStt implements SttProvider {
  readonly supported = RecognitionCtor !== undefined;
  private recognition: SpeechRecognition | null = null;
  private finalTranscript = '';
  private onIntermediateCb: (text: string) => void = () => {};
  private onFinalCb: (text: string) => void = () => {};
  private onEndCb: (reason: SttEndReason) => void = () => {};

  start(): void {
    if (!this.supported || !RecognitionCtor) return;
    if (this.recognition) return;

    const recognition = new RecognitionCtor();
    recognition.lang = 'es-AR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    this.finalTranscript = '';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          this.finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        this.onIntermediateCb(interim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        this.onEndCb('no-speech');
      } else if (event.error === 'aborted') {
        this.onEndCb('aborted');
      } else {
        this.onEndCb('error');
      }
      this.cleanup();
    };

    recognition.onend = () => {
      const hasFinal = this.finalTranscript.length > 0;
      if (hasFinal) {
        this.onFinalCb(this.finalTranscript);
        this.onEndCb('stopped');
      } else {
        this.onEndCb('aborted');
      }
      this.cleanup();
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.cleanup();
    }
  }

  stop(): void {
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  abort(): void {
    if (this.recognition) {
      this.recognition.abort();
    }
  }

  onIntermediate(cb: (text: string) => void): void {
    this.onIntermediateCb = cb;
  }

  onFinal(cb: (text: string) => void): void {
    this.onFinalCb = cb;
  }

  onEnd(cb: (reason: SttEndReason) => void): void {
    this.onEndCb = cb;
  }

  private cleanup(): void {
    this.recognition = null;
  }
}

class BrowserTts implements TtsProvider {
  readonly supported = typeof speechSynthesis !== 'undefined';
  private muted = false;
  private selectedVoiceURI: string | null = null;
  private onEndCb: () => void = () => {};

  speak(text: string): void {
    if (!this.supported || this.muted || !text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-AR';
    utterance.rate = 1.05;
    const voice = this.pickVoice();
    if (voice) utterance.voice = voice;
    utterance.onend = () => this.onEndCb();
    utterance.onerror = () => this.onEndCb();
    speechSynthesis.cancel();
    // Chrome: cancelar e inmediatamente hablar puede descartar la utterance.
    window.setTimeout(() => {
      if (!this.muted) speechSynthesis.speak(utterance);
    }, 50);
  }

  cancel(): void {
    if (this.supported) {
      speechSynthesis.cancel();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.cancel();
  }

  onEnd(cb: () => void): void {
    this.onEndCb = cb;
  }

  listVoices(): TtsVoice[] {
    if (!this.supported) return [];
    const voices = speechSynthesis.getVoices();
    return voices.map((v) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      default: v.default,
    }));
  }

  getSelectedVoice(): string | null {
    return this.selectedVoiceURI;
  }

  setVoice(voiceURI: string): void {
    this.selectedVoiceURI = voiceURI;
    if (this.supported) this.cancel();
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    const voices = speechSynthesis.getVoices();
    if (this.selectedVoiceURI) {
      const selected = voices.find((v) => v.voiceURI === this.selectedVoiceURI);
      if (selected) return selected;
    }
    const esVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('es'));
    if (esVoices.length === 0) return null;
    // Preferir voces masculinas por nombre (lista de nombres de varón comunes por idioma).
    const maleNames = [
      'pablo', 'andres', 'andrés', 'david', 'jorge', 'miguel', 'jose', 'josé',
      'daniel', 'alejandro', 'antonio', 'francisco', 'manuel', 'pedro', 'carlos',
      'joaquin', 'joaquín', 'santiago', 'mateo', 'nicolas', 'nicolás', 'mateus',
      'ruy', 'diego', 'enrique', 'fernando', 'hugo', 'lucas', 'marcos', 'ricardo',
      'samuel', 'tiago', 'alvaro', 'álvaro', 'vladimir', 'dmitri', 'alexey', 'maxim',
    ];
    const masculine = esVoices.filter((v) => {
      const name = v.name.toLowerCase();
      return maleNames.some((m) => name.includes(m));
    });
    if (masculine.length > 0) return masculine[0];
    return (
      esVoices.find((v) => v.lang.toLowerCase() === 'es-ar') ||
      esVoices.find((v) => v.lang.toLowerCase() === 'es-es') ||
      esVoices[0]
    );
  }
}

export function createBrowserVoice() {
  const stt = new BrowserStt();
  const tts = new BrowserTts();
  if (tts.supported && speechSynthesis.getVoices().length === 0) {
    speechSynthesis.addEventListener('voiceschanged', () => {});
  }
  return { stt, tts };
}
