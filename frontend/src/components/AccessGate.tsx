import { createContext, useContext, useEffect, useState, ReactNode, FormEvent } from 'react';
import { Orb } from './Orb';

const AccessContext = createContext({ required: false, logout: async () => {} });
export const useAccess = () => useContext(AccessContext);

export function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'locked' | 'ready'>('checking');
  const [required, setRequired] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetch('/api/session', { signal: controller.signal, credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Backend no disponible');
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        setRequired(data.authenticationRequired === true);
        setState(data.authenticationRequired && !data.authenticated ? 'locked' : 'ready');
      })
      .catch(() => { if (active) setState('ready'); }) // La interfaz conserva el indicador sin conexión.
      .finally(() => clearTimeout(timeout));
    const expired = () => { setRequired(true); setState('locked'); setError('Tu sesión venció. Volvé a ingresar.'); };
    window.addEventListener('jarvis-session-expired', expired);
    return () => { active = false; controller.abort(); clearTimeout(timeout); window.removeEventListener('jarvis-session-expired', expired); };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy || !key) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessKey: key }) });
      const data = await response.json();
      if (!response.ok || !data.authenticated) throw new Error(data.message || 'No se pudo iniciar sesión.');
      setKey('');
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar con Jarvis.');
    } finally { setBusy(false); }
  }

  async function logout() {
    try {
      const response = await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) throw new Error('No se pudo cerrar la sesión.');
      setState('locked');
      setError('');
    } catch { window.alert('No se pudo cerrar la sesión. Volvé a intentarlo.'); }
  }

  if (state === 'checking') return <div className="access-screen"><Orb state="THINKING" /><p>Conectando con Jarvis…</p></div>;
  if (state === 'locked') return (
    <main className="access-screen">
      <div className="access-card"><span className="eyebrow">JARVIS / ACCESO PERSONAL</span><Orb state="IDLE" /><h1>Bienvenido, Federico.</h1><p>Ingresá tu clave para acceder a tus conversaciones y herramientas.</p>
        <form onSubmit={login}><label htmlFor="access-key">Clave de acceso</label><input id="access-key" type="password" autoComplete="current-password" value={key} onChange={(event) => setKey(event.target.value)} maxLength={512} required /><button disabled={busy || !key}>{busy ? 'Conectando…' : 'Entrar a Jarvis'}</button></form>
        {error && <p role="alert" className="import-error">{error}</p>}
      </div>
    </main>
  );
  return <AccessContext.Provider value={{ required, logout }}>{children}</AccessContext.Provider>;
}
