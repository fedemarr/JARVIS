import { SttProvider, TtsProvider, SttEndReason, TtsVoice } from '../../../shared/voice';
import { desktopFetch, desktopConnected, naturalVoiceAvailable } from './desktop';

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
      if (this.recognition !== recognition) return;
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
      if (this.recognition !== recognition) return;
      this.cleanup();
      if (event.error === 'no-speech') {
        this.onEndCb('no-speech');
      } else if (event.error === 'aborted') {
        this.onEndCb('aborted');
      } else {
        this.onEndCb('error');
      }
    };

    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      const transcript = this.finalTranscript;
      this.cleanup();
      this.finalTranscript = '';
      // Cerrar el micrófono antes de que el comando comience a responder.
      this.onEndCb(transcript ? 'stopped' : 'aborted');
      if (transcript) this.onFinalCb(transcript);
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.cleanup();
      this.onEndCb('error');
    }
  }

  stop(): void {
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  abort(): void {
    const recognition = this.recognition;
    this.cleanup();
    this.finalTranscript = '';
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.abort();
    this.onEndCb('aborted');
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
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
    }
    this.recognition = null;
  }
}

class BrowserTts implements TtsProvider {
  readonly supported = typeof speechSynthesis !== 'undefined';
  private muted = false;
  private selectedVoiceURI: string | null = null;
  private onEndCb: () => void = () => {};
  private pendingSpeech: number | undefined;
  private generation = 0;
  private queue: string[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private localSpeech: { controller: AbortController; audio: HTMLAudioElement | null; url: string | null } | null = null;

  speak(text: string): void {
    if (!this.supported || this.muted || !text.trim()) return;
    let remaining = text;
    while (remaining.length > 220) {
      const space = remaining.lastIndexOf(' ', 220);
      const end = space >= 80 ? space + 1 : 220;
      this.queue.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }
    if (remaining) this.queue.push(remaining);
    this.speakNext();
  }

  private speakNext(): void {
    if (this.currentUtterance || this.localSpeech || this.pendingSpeech !== undefined || this.muted) return;
    const text = this.queue.shift();
    if (!text) return;
    const generation = this.generation;
    if (naturalVoiceAvailable() && (this.selectedVoiceURI === null || this.selectedVoiceURI === 'kokoro:em_alex' || this.selectedVoiceURI === '')) {
      void this.speakLocal(text, generation);
      return;
    }
    this.speakBrowser(text, generation);
  }

  private async speakLocal(text: string, generation: number): Promise<void> {
    const local = { controller:new AbortController(), audio:null as HTMLAudioElement | null, url:null as string | null };
    this.localSpeech = local;
    let finished = false;
    const timer = setTimeout(() => local.controller.abort(), 50000);
    const cleanup = () => {
      clearTimeout(timer);
      if (local.url) { URL.revokeObjectURL(local.url); local.url = null; }
      if (this.localSpeech === local) this.localSpeech = null;
    };
    const fallback = () => {
      if (finished) return;
      finished = true;
      cleanup();
      if (generation === this.generation && !this.muted) this.speakBrowser(text,generation);
    };
    try {
      const response = await desktopFetch('/api/voice/synthesize', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal:local.controller.signal});
      if (!response.ok) throw new Error('Voz local no disponible');
      const blob = await response.blob();
      if (generation !== this.generation) {cleanup();return;}
      local.url = URL.createObjectURL(blob);
      const audio = new Audio(local.url); local.audio = audio;
      const finish = () => {
        if (finished) return;
        finished = true;
        cleanup();
        if (generation !== this.generation) return;
        if (this.queue.length) this.speakNext(); else this.onEndCb();
      };
      audio.onended = finish;
      audio.onerror = fallback;
      clearTimeout(timer);
      await audio.play();
    } catch {
      fallback();
    }
  }

  private speakBrowser(text: string, generation: number): void {
    const utterance = new SpeechSynthesisUtterance(text);
    this.currentUtterance = utterance;
    utterance.lang = 'es-AR';
    utterance.rate = 0.97;
    const voice = this.pickVoice();
    if (voice) utterance.voice = voice;
    const finish = () => {
      if (generation !== this.generation || this.currentUtterance !== utterance) return;
      this.currentUtterance = null;
      if (this.queue.length) this.speakNext();
      else this.onEndCb();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    // Chrome: cancelar e inmediatamente hablar puede descartar la utterance.
    this.pendingSpeech = window.setTimeout(() => {
      this.pendingSpeech = undefined;
      if (!this.muted && generation === this.generation) speechSynthesis.speak(utterance);
    }, 50);
  }

  cancel(): void {
    this.generation++;
    this.queue = [];
    this.currentUtterance = null;
    const local = this.localSpeech;
    this.localSpeech = null;
    if (local) { local.controller.abort(); if (local.audio) {local.audio.onended = null;local.audio.onerror = null;local.audio.pause();} if (local.url) URL.revokeObjectURL(local.url); }
    if (this.pendingSpeech !== undefined) { clearTimeout(this.pendingSpeech); this.pendingSpeech = undefined; }
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
    const listed: TtsVoice[] = voices.map((v) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      default: v.default,
    }));
    if (desktopConnected()) listed.unshift({voiceURI:'kokoro:em_alex',name:'Alex · voz natural en esta PC',lang:'es'});
    return listed;
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
    const natural = esVoices.find((v) => /natural|neural|online/i.test(v.name));
    if (natural) return natural;
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
