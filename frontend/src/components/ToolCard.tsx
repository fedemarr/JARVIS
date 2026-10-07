import React, { useState } from 'react';
import { ToolCardData } from '../hooks/useChat';

export const ToolCard: React.FC<{ card: ToolCardData }> = ({ card }) => {
  const [open, setOpen] = useState(false);

  const statusColor =
    card.status === 'running' ? 'text-amber-400' : card.status === 'success' ? 'text-emerald-400' : 'text-red-400';
  const statusIcon =
    card.status === 'running' ? '◌' : card.status === 'success' ? '✓' : '✗';
  const borderColor =
    card.status === 'running' ? 'border-amber-700' : card.status === 'success' ? 'border-emerald-800' : 'border-red-800';

  return (
    <div className={`border ${borderColor} rounded-md bg-gray-800/60 text-xs`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-800"
      >
        <span className="flex items-center gap-2">
          <span className={`font-mono ${statusColor}`}>{statusIcon}</span>
          <span className="font-mono text-cyan-200">{card.name}</span>
        </span>
        <span className="flex items-center gap-3 text-gray-400">
          {card.durationMs !== undefined && <span>{card.durationMs}ms</span>}
          <span className="text-gray-500">{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 font-mono">
          <pre className="text-gray-400 whitespace-pre-wrap break-all bg-gray-900 p-2 rounded">
            {JSON.stringify(card.args, null, 2)}
          </pre>
          {card.summary && (
            <div className={`${statusColor} whitespace-pre-wrap break-all`}>{card.summary}</div>
          )}
          {card.status === 'running' && <div className="text-amber-400 animate-pulse">Ejecutando…</div>}
        </div>
      )}
    </div>
  );
};
