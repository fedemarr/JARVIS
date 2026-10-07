import React from 'react';

interface MicButtonProps {
  listening: boolean;
  supported: boolean;
  onStart: () => void;
  onStop: () => void;
}

export const MicButton: React.FC<MicButtonProps> = ({ listening, supported, onStart, onStop }) => {
  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title="Micrófono no soportado en este navegador (usá Chrome/Edge)"
        className="p-3 rounded-md bg-gray-700 text-gray-500 cursor-not-allowed"
      >
        <MicIcon />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (listening ? onStop() : onStart())}
      title={listening ? 'Tocá para enviar' : 'Tocá una vez para hablar'}
      className={`p-3 rounded-md transition-colors ${
        listening
          ? 'bg-red-600 text-white animate-pulse'
          : 'bg-gray-700 hover:bg-gray-600 text-cyan-300'
      }`}
    >
      <MicIcon />
    </button>
  );
};

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
