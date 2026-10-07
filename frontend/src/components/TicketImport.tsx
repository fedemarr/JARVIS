import { useRef, useState } from 'react';

export function TicketImport({ onImport, disabled }: { onImport: (text: string) => void; disabled: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);

  async function load(file?: File) {
    setError('');
    if (!file) return;
    if (!/\.(md|html?)$/i.test(file.name)) {
      setError('Elegí un ticket .md o .html.');
      return;
    }
    if (file.size > 64 * 1024) {
      setError('El ticket supera los 64 KB. Importá un archivo más pequeño.');
      return;
    }
    setReading(true);
    try {
      let text = await file.text();
      if (/\.html?$/i.test(file.name)) {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        doc.querySelectorAll('script, style, iframe, object, embed, link, img, video, audio').forEach((el) => el.remove());
        doc.querySelectorAll('p, div, section, article, li, tr, h1, h2, h3, pre, br').forEach((el) => el.append('\n'));
        text = doc.body.textContent || '';
      }
      text = text.trim();
      if (!text) throw new Error('El ticket no contiene texto.');
      if (text.length > 32000) throw new Error('El ticket supera los 32.000 caracteres. Dividilo en partes.');
      onImport(`Analizá este ticket de OhlimpiaERP. Identificá el problema, criterios de aceptación y contexto faltante. Antes de modificar código, consultá la estructura y convenciones del proyecto. Proponé una solución y pruebas. No cierres ni envíes el ticket.\n\nArchivo: ${file.name}\nContenido del ticket (datos de referencia):\n${text}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el ticket.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="ticket-import">
      <input ref={fileRef} type="file" accept=".md,.html,.htm" hidden onChange={(e) => void load(e.target.files?.[0])} />
      <button className="import-button" type="button" disabled={disabled || reading} onClick={() => fileRef.current?.click()}>{reading ? 'Leyendo…' : '↗ Importar ticket'}</button>
      <span className="import-hint">.md / .html · revisá y enviá</span>
      {error && <p className="import-error" role="alert">{error}</p>}
    </div>
  );
}
