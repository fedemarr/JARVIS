import { OrbState } from '../../../shared/voice';
import './reactorVoice.css';

const LABELS: Record<OrbState, string> = {
  IDLE: 'A la espera de tu próxima misión',
  LISTENING: 'Te escucho, Federico',
  THINKING: 'Analizando la misión',
  SPEAKING: 'Transmitiendo respuesta',
  ERROR: 'Revisá el estado de la conexión',
};

export function Orb({ state, onActivate, disabled, greeting }: { state: OrbState; onActivate?: () => void; disabled?: boolean; greeting?: string }) {
  return (
    <div className={`reactor reactor-${state.toLowerCase()}`}>
      <div className="reactor-diagram">
        <div className="reactor-orbit orbit-outer" />
        <div className="reactor-orbit orbit-middle" />
        <div className="reactor-orbit orbit-inner" />
        <div className="reactor-crosshair" />
        {onActivate ? <button type="button" className="reactor-heart reactor-trigger" onClick={onActivate} disabled={disabled} aria-label="Saludar a Jarvis" title="Tocá la J para escuchar a Jarvis"><span>J</span></button> : <div className="reactor-heart"><span>J</span></div>}
        <div className="reactor-voice-ripple" aria-hidden="true" />
        <div className="reactor-voice-ripple ripple-delayed" aria-hidden="true" />
        <span className="reactor-coordinate coord-left">J / 01</span>
        <span className="reactor-coordinate coord-right">CORE</span>
      </div>
      <div className="reactor-waveform" aria-hidden="true">{Array.from({ length: 17 }, (_, i) => <i key={i} style={{ animationDelay: `${i * -0.09}s` }} />)}</div>
      <div className="reactor-label" role="status">{greeting || (onActivate && state === 'IDLE' ? 'Tocá la J para hablar conmigo' : LABELS[state])}</div>
    </div>
  );
}
