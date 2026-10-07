import { OrbState } from '../../../shared/voice';

const LABELS: Record<OrbState, string> = {
  IDLE: 'A la espera de tu próxima misión',
  LISTENING: 'Te escucho, Federico',
  THINKING: 'Analizando la misión',
  SPEAKING: 'Transmitiendo respuesta',
  ERROR: 'Revisá el estado de la conexión',
};

export function Orb({ state }: { state: OrbState }) {
  return (
    <div className={`reactor reactor-${state.toLowerCase()}`}>
      <div className="reactor-diagram" aria-hidden="true">
        <div className="reactor-orbit orbit-outer" />
        <div className="reactor-orbit orbit-middle" />
        <div className="reactor-orbit orbit-inner" />
        <div className="reactor-crosshair" />
        <div className="reactor-heart"><span>J</span></div>
        <span className="reactor-coordinate coord-left">J / 01</span>
        <span className="reactor-coordinate coord-right">CORE</span>
      </div>
      <div className="reactor-label" role="status">{LABELS[state]}</div>
    </div>
  );
}
