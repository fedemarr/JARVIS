export type OrbState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

export type SttEndReason = 'stopped' | 'aborted' | 'no-speech' | 'error';

export interface SttProvider {
  readonly supported: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onIntermediate(cb: (text: string) => void): void;
  onFinal(cb: (text: string) => void): void;
  onEnd(cb: (reason: SttEndReason) => void): void;
}

export interface TtsVoice {
  voiceURI: string;
  name: string;
  lang: string;
  default?: boolean;
}

export interface TtsProvider {
  readonly supported: boolean;
  speak(text: string): void;
  activate?(): void;
  cancel(): void;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  onEnd(cb: () => void): void;
  listVoices(): TtsVoice[];
  getSelectedVoice(): string | null;
  setVoice(voiceURI: string): void;
}
