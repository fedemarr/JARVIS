import React from 'react';
import { ConfirmationData } from '../hooks/useChat';

interface ConfirmDialogProps {
  pending: ConfirmationData[];
  onConfirm: (pendingId: string, approved: boolean) => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ pending, onConfirm }) => {
  const first = pending[0];
  const extraCount = pending.length - 1;
  if (!first) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d141d] border border-amber-700 rounded-lg max-w-lg w-full p-6 shadow-2xl">
        <h3 className="text-amber-400 font-bold tracking-widest mb-4 text-sm">⚠ CONFIRMACIÓN REQUERIDA</h3>
        <p className="text-gray-300 text-sm mb-4">
          JARVIS quiere ejecutar <span className="text-amber-300 font-mono">{first.tool}</span>.
          {first.reason ? (
            <>
              {' '}
              Motivo: <span className="text-amber-300">{first.reason}</span>.
            </>
          ) : null}
        </p>
        <pre className="bg-gray-900 border border-gray-700 rounded p-3 font-mono text-xs text-gray-300 whitespace-pre-wrap break-all mb-2">
          {JSON.stringify(first.args, null, 2)}
        </pre>
        {extraCount > 0 && (
          <p className="text-gray-400 text-xs mb-4">
            …y {extraCount} herramienta{extraCount > 1 ? 's' : ''} más en el mismo turno.
          </p>
        )}
        <div className="flex justify-end gap-3 mt-4">
          <button
            type="button"
            onClick={() => onConfirm(first.pendingId, false)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold py-2 px-5 rounded text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(first.pendingId, true)}
            className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-5 rounded text-sm"
          >
            Ejecutar
          </button>
        </div>
      </div>
    </div>
  );
};
