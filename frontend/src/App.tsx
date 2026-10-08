import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useChat } from './hooks/useChat';
import { useSpeech } from './hooks/useSpeech';
import { ChatMessage } from './components/ChatMessage';
import { Orb } from './components/Orb';
import { TicketImport } from './components/TicketImport';
import { DesktopPanel } from './components/DesktopPanel';
import { apiFetch } from './lib/api';
import { desktopConnected } from './lib/desktop';
import { parseTicketCommand } from './lib/ticketCommand';
import { useAccess } from './components/AccessGate';
import { MicButton } from './components/MicButton';
import { ToolCard } from './components/ToolCard';
import { ConfirmDialog } from './components/ConfirmDialog';
import { createBrowserVoice } from './lib/browserVoice';
import { LlmMessage } from '../../shared/llm';

function App() {
  const access = useAccess();
  const [input, setInput] = useState('');
  const [coreGreeting, setCoreGreeting] = useState('');
  const [handsFree, setHandsFree] = useState(false);
  const [voiceAwake, setVoiceAwake] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [providerModel, setProviderModel] = useState('');
  const {
    messages,
    sendMessage,
    currentConversationId,
    conversations,
    selectConversation,
    isLoading,
    toolCards,
    pendingConfirmations,
    confirmAction,
    addSystemMessage,
  } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const commandBusyRef = useRef(false);
  const localNoticeVoiceRef=useRef<(text:string)=>void>(()=>{});
  const routeTicket = (text:string) => {
    if(!parseTicketCommand(text))return false;
    if(!desktopConnected()){addSystemMessage('Conectá esta PC para ejecutar tickets con Claude Code.');return true;}
    window.dispatchEvent(new CustomEvent('jarvis-run-ticket',{detail:text}));
    return true;
  };
  useEffect(()=>{
    const notice=(event:Event)=>{const text=(event as CustomEvent<string>).detail;addSystemMessage(text);localNoticeVoiceRef.current(text);};
    window.addEventListener('jarvis-ticket-notice',notice);
    return()=>window.removeEventListener('jarvis-ticket-notice',notice);
  },[addSystemMessage]);

  const voice = useMemo(() => createBrowserVoice(), []);

  const speech = useSpeech({
    stt: voice.stt,
    tts: voice.tts,
    onCommand: (text) => {
      if (isLoading) return;
      if (!handsFree) { void commandRef.current(text); return; }
      const wake = text.match(/\b(?:jarvis|y arvis|yarvis)\b[\s,.:;!?¿¡]*(.*)/i);
      if (!voiceAwake && !wake) { speech.setOrbState('IDLE'); return; }
      const command = (wake ? wake[1] : text).trim();
      setVoiceAwake(true);
      if (!command) {
        const greeting = 'Te escucho, Federico. ¿Qué necesitás?';
        setCoreGreeting(greeting);
        speech.speak(greeting, true);
      } else if (/^(?:gracias[,. ]*)?(?:dorm[ií]|descans[aá]|hasta luego|terminar conversación)[.! ]*$/i.test(command)) {
        setVoiceAwake(false);
        setCoreGreeting('Cuando me necesites, decí Jarvis.');
        speech.speak('Cuando me necesites, decí Jarvis.', true);
      } else void commandRef.current(command);
    },
  });
  localNoticeVoiceRef.current=(text)=>speech.speak(text);

  const pendingSpeechRef = useRef('');
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSpeech = useCallback(() => {
    if (speakingTimerRef.current) {
      clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }
    const pending = pendingSpeechRef.current;
    pendingSpeechRef.current = '';
    if (pending.trim()) speech.speak(pending);
  }, [speech]);

  const handleStreamToken = useCallback(
    (delta: string) => {
      pendingSpeechRef.current += delta;
      const acc = pendingSpeechRef.current;
      // Cortar en oraciones: punto, signo, salto de línea o al superar 200 chars.
      const matches = [...acc.matchAll(/[^.!?\n]*[.!?\n]+/g)];
      let spokenUpTo = 0;
      for (const m of matches) {
        if (m.index! + m[0].length <= acc.length && acc.slice(0, m.index! + m[0].length).length >= 40) {
          spokenUpTo = m.index! + m[0].length;
        }
      }
      if (spokenUpTo > 0) {
        const chunk = acc.slice(0, spokenUpTo);
        pendingSpeechRef.current = acc.slice(spokenUpTo);
        if (chunk.trim()) speech.speak(chunk);
      } else if (acc.length > 240) {
        const chunk = acc.slice(0, 200);
        pendingSpeechRef.current = acc.slice(200);
        if (chunk.trim()) speech.speak(chunk);
      }
    },
    [speech],
  );

  const finishStreamSpeech = useCallback(() => {
    flushSpeech();
    speech.setOrbState((state) => state === 'THINKING' ? 'IDLE' : state);
  }, [flushSpeech, speech]);

  const commandRef = useRef<(text: string) => Promise<void>>(async () => {});
  commandRef.current = async (text: string) => {
    if(routeTicket(text)){setInput('');return;}
    if (commandBusyRef.current) return;
    commandBusyRef.current = true;
    try {
    setInput('');
    setCoreGreeting('');
    speech.abortListening();
    speech.cancelSpeaking();
    speech.setThinking();
    pendingSpeechRef.current = '';
    const reply = await sendMessage(text, currentConversationId, handleStreamToken);
    if (reply) {
      finishStreamSpeech();
    } else {
      speech.setOrbState('IDLE');
    }
    } finally { commandBusyRef.current = false; }
  };

  useEffect(() => {
    const feed = messagesEndRef.current?.closest('.conversation-feed');
    if (!messages.some((message) => message.role === 'user')) feed?.scrollTo({ top: 0 });
    else messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  useEffect(() => {
    if (!handsFree || isLoading || commandBusyRef.current) return;
    if (speech.orbState === 'ERROR') {
      setHandsFree(false);
      setVoiceAwake(false);
      setVoiceNotice('No pude usar el micrófono. Revisá el permiso y activá manos libres de nuevo.');
      return;
    }
    if (speech.orbState !== 'IDLE') return;
    const timer = setTimeout(speech.startListening, 700);
    return () => clearTimeout(timer);
  }, [handsFree, isLoading, speech.orbState, speech.startListening]);

  useEffect(() => {
    apiFetch('/api/health')
      .then((r) => { if (!r.ok) throw new Error('Backend unavailable'); return r.json(); })
      .then((data: { provider?: string; model?: string }) => {
        setBackendStatus('connected');
        if (data.provider && data.model) {
          setProviderModel(`${data.provider} · ${data.model}`);
        }
      })
      .catch(() => { setBackendStatus('offline'); });
  }, []);

  // Al abrir, JARVIS saluda con el resumen del día (GET /api/brief).
  const greetedRef = useRef(false);
  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    apiFetch('/api/brief')
      .then((r) => { if (!r.ok) throw new Error('Backend unavailable'); return r.json(); })
      .then((data: { date_text?: string; tasks_today?: { title: string }[]; pending_tasks?: { title: string }[] }) => {
        const dateText = data.date_text || '';
        const today = data.tasks_today || [];
        const pending = data.pending_tasks || [];
        const lines: string[] = [];
        if (dateText) lines.push(`Buenas, ${data.date_text}.`);
        if (today.length > 0) {
          lines.push(`Tareas de hoy: ${today.map((t) => t.title).join(', ')}.`);
        } else if (pending.length > 0) {
          lines.push(`Tenés ${pending.length} tareas pendientes en total.`);
        } else {
          lines.push('No tenés tareas pendientes.');
        }
        if (lines.length > 0) {
          addSystemMessage(lines.join(' '));
        }
      })
      .catch(() => { setBackendStatus('offline'); });
  }, [addSystemMessage]);

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading || commandBusyRef.current) return;
    if(routeTicket(text)){setInput('');return;}
    commandBusyRef.current = true;
    try {
    setInput('');
    setCoreGreeting('');
    speech.abortListening();
    speech.cancelSpeaking();
    speech.setThinking();
    pendingSpeechRef.current = '';
    const reply = await sendMessage(text, currentConversationId, handleStreamToken);
    if (reply) {
      finishStreamSpeech();
    } else {
      speech.setOrbState('IDLE');
    }
    } finally {commandBusyRef.current = false;}
  };

  const handleNewConversation = () => {
    setInput('');
    setCoreGreeting('');
    speech.cancelSpeaking();
    speech.abortListening();
    setVoiceAwake(false);
    selectConversation(undefined);
  };

  const inputValue = speech.partialTranscript !== '' && speech.orbState === 'LISTENING' ? speech.partialTranscript : input;

  return (
    <div className="command-shell">
      <aside className="command-sidebar">
        <a className="brand" href="/" aria-label="Jarvis, inicio"><span className="brand-mark">J</span><div>JARVIS<small>PERSONAL INTELLIGENCE</small></div></a>
        <div className="sidebar-section-label">CENTRO DE MANDO</div>
        <button className="nav-item nav-active" onClick={handleNewConversation} disabled={isLoading}><span>◈</span> Nueva misión <span className="nav-plus">+</span></button>
        <button className="nav-item" disabled={isLoading} onClick={() => setInput('Ayudame con un ticket de OhlimpiaERP. Primero pedime el ticket y la ruta del proyecto para revisar su estructura y buenas prácticas.')}><span>⌘</span> OhlimpiaERP</button>
        <button className="nav-item" disabled={isLoading} onClick={() => setInput('Ayudame a planificar mi día a partir de mis tareas pendientes.')}><span>◎</span> Mi día</button>
        <button className="nav-item" disabled={isLoading} onClick={() => setInput('Quiero estudiar un tema. Preguntame cuál y mi nivel para armar una sesión práctica.')}><span>◇</span> Estudio</button>
        <button className="nav-item" disabled={isLoading} onClick={() => setInput('Ayudame a preparar una campaña de marketing para mi empresa. Preguntame objetivo, público y presupuesto.')}><span>↗</span> Marketing</button>
        <div className="sidebar-section-label history-heading">CONVERSACIONES <span>{conversations.length.toString().padStart(2, '0')}</span></div>
        <div className="conversation-list">
          {conversations.length === 0 && <p className="sidebar-empty">Tu próxima idea empieza acá.</p>}
          {conversations.map((conv) => (
            <button key={conv.id} disabled={isLoading} className={`conversation-item ${conv.id === currentConversationId ? 'conversation-selected' : ''}`} onClick={() => selectConversation(conv.id)}>
              <span>›</span>{conv.title || 'Sin título'}
            </button>
          ))}
        </div>
        <div className="operator"><div className="operator-avatar">F</div><div>Federico<small>OPERADOR PRINCIPAL</small></div><span className="operator-dot" /></div>
        {access.required && <button className="logout-button" onClick={() => void access.logout()} disabled={isLoading}>Cerrar sesión</button>}
      </aside>

      <main className="command-main">
        <header className="command-header">
          <div><span className="eyebrow">JARVIS / CONTROL CENTRAL</span><h1>Tu inteligencia. En acción.</h1></div>
          <div className={`connection-chip connection-${backendStatus}`}><span />{backendStatus === 'connected' ? 'BACKEND CONECTADO' : backendStatus === 'checking' ? 'CONECTANDO' : 'SIN CONEXIÓN'}</div>
        </header>
        <div className="mission-workspace">
        <div className="main-scroll">
          <section className="core-stage" aria-label="Estado del asistente">
            <div className="core-note"><span className="eyebrow">ASISTENTE PERSONAL</span><h2>Bienvenido,<br /><span>Federico.</span></h2><p>Una misión a la vez.<br />Construyamos lo que sigue.</p></div>
            <Orb state={speech.orbState === 'SPEAKING' ? 'SPEAKING' : isLoading ? 'THINKING' : speech.orbState} disabled={isLoading} greeting={coreGreeting && speech.orbState === 'SPEAKING' ? coreGreeting : undefined} onActivate={() => {
              const greeting = 'Buenas, Federico. ¿En qué puedo ayudarte?';
              speech.abortListening();
              setVoiceAwake(handsFree);
              setCoreGreeting(greeting);
              speech.cancelSpeaking();
              speech.speak(greeting, true);
              if (!speech.ttsSupported) addSystemMessage(greeting);
            }} />
            <div className="core-telemetry"><span className="eyebrow">ESTADO DE SESIÓN</span><div><span>Herramientas usadas</span><strong>{toolCards.length.toString().padStart(2, '0')}</strong></div><div><span>En ejecución</span><strong>{toolCards.filter((card) => card.status === 'running').length.toString().padStart(2, '0')}</strong></div><div><span>Por confirmar</span><strong className={pendingConfirmations.length ? 'amber-text' : ''}>{pendingConfirmations.length.toString().padStart(2, '0')}</strong></div></div>
          </section>

          <section className="mission-shortcuts" aria-label="Preparar una misión">
            <button disabled={isLoading} onClick={() => setInput('Analicemos un ticket de OhlimpiaERP. Te voy a importar el archivo; después revisá el proyecto antes de proponer cambios.')}><span className="shortcut-icon">⌘</span><div><strong>Resolver un ticket</strong><small>OhlimpiaERP · diagnóstico y solución</small></div><span>↗</span></button>
            <button disabled={isLoading} onClick={() => setInput('Revisá mis tareas pendientes y ayudame a elegir las prioridades de hoy.')}><span className="shortcut-icon">◎</span><div><strong>Organizar mi día</strong><small>Tareas · enfoque y próximos pasos</small></div><span>↗</span></button>
          </section>

      <aside className="context-sidebar">
        <div className="eyebrow context-heading">CONTEXTO OPERATIVO <span>◈</span></div>
        <section className="context-panel priority-panel"><span className="eyebrow">MISIÓN PRIORITARIA</span><div className="project-emblem">O<span>ERP</span></div><h2>OhlimpiaERP</h2><p>De un ticket a una solución<br />con estructura y criterio.</p><div className="context-divider" /><ol className="workflow-steps"><li><span>01</span> Importar .md o .html</li><li><span>02</span> Revisar contexto y código</li><li><span>03</span> Resolver y probar</li><li><span>04</span> Revisar y aceptar</li></ol><small className="panel-note">Importación manual disponible. Integración con la nube pendiente.</small></section>
        <section className="context-panel"><span className="eyebrow">DISPOSITIVOS</span><div className="device-row"><span className="device-symbol">▣</span><div>Esta computadora<small>Interfaz local</small></div><span className="device-tag">LOCAL</span></div><div className="device-row device-pending"><span className="device-symbol">▣</span><div>Computadora de casa<small>Vinculación pendiente</small></div></div></section>
        <section className="context-panel model-panel"><span className="eyebrow">MOTOR DE INTELIGENCIA</span><p>{providerModel || 'Sin información del backend'}</p><small>La conexión con el modelo se verifica al enviar una misión.</small></section>
        <div className="context-footnote"><span>JARVIS</span> EN CONSTANTE EVOLUCIÓN</div>
      </aside>
        </div>
        <div className="chat-panel">
          <section className="conversation-feed" aria-label="Conversación">
            <div className="feed-heading"><span className="eyebrow">CANAL DE COMUNICACIÓN</span><span>{isLoading ? 'PROCESANDO' : 'CHAT + VOZ'}</span></div>
            {messages.length === 0 && <div className="empty-transmission"><span>◈</span><h3>¿Cuál es la misión?</h3><p>Importá un ticket, compartí una idea o hablame.<br />Estoy listo para ayudarte a darle forma.</p></div>}
            {messages.map((msg: LlmMessage, index) => <ChatMessage key={index} message={msg} />)}
            {isLoading && <div className="processing" role="status"><span /><span /><span /> Analizando contexto y herramientas…</div>}
            {toolCards.length > 0 && <div className="tool-feed">{toolCards.map((card) => <ToolCard key={card.id} card={card} />)}</div>}
            <div ref={messagesEndRef} />
          </section>
        <div className="composer-wrap">
          <DesktopPanel onImport={setInput} disabled={isLoading} />
          <TicketImport onImport={setInput} disabled={isLoading} />
          <form onSubmit={handleSendText} className="command-composer">
            <MicButton listening={speech.orbState === 'LISTENING'} supported={speech.sttSupported} onStart={() => { setHandsFree(false); setVoiceAwake(false); speech.startListening(); }} onStop={speech.stopListening} />
            <textarea aria-label="Mensaje para Jarvis" rows={2} value={inputValue} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder={speech.orbState === 'LISTENING' ? 'Te escucho…' : 'Escribí tu próxima misión…'} />
            <button type="button" onClick={speech.toggleMute} aria-label={speech.isMuted ? 'Activar voz' : 'Silenciar voz'} title={speech.isMuted ? 'Activar voz' : 'Silenciar voz'} className="voice-toggle">{speech.isMuted ? <MutedIcon /> : <SpeakerIcon />}</button>
            <button type="submit" disabled={isLoading || !input.trim()} className="send-button" aria-label="Enviar mensaje">↗</button>
          </form>
          <div className="handsfree-controls">
            <button type="button" className={handsFree ? 'handsfree-toggle handsfree-active' : 'handsfree-toggle'} aria-pressed={handsFree} disabled={!speech.sttSupported || !speech.ttsSupported} onClick={() => {
              setVoiceNotice('');
              setVoiceAwake(false);
              if (handsFree) { setHandsFree(false); speech.abortListening(); }
              else {
                setHandsFree(true);
                // Activar durante una respuesta debe esperar, no cancelar la voz.
                if (!isLoading && !commandBusyRef.current && speech.orbState === 'IDLE') speech.startListening();
              }
            }}>{handsFree ? 'Desactivar manos libres' : 'Activar manos libres'}</button>
            <span role="status">{handsFree ? isLoading || speech.orbState === 'SPEAKING' ? 'Manos libres activo · te escucho cuando termine la respuesta' : voiceAwake ? 'Conversación activa · te escucho al terminar de hablar' : 'Decí «Jarvis» para llamarme' : !speech.sttSupported ? 'Reconocimiento de voz no disponible en este navegador' : 'Activá el micrófono una vez y después decí «Jarvis»'}</span>
          </div>
          {voiceNotice && <p className="voice-notice" role="alert">{voiceNotice}</p>}
          <div className="composer-footer"><span>ENTER para enviar · SHIFT + ENTER para nueva línea</span>
            {speech.ttsSupported && speech.voices.length > 0 && <select aria-label="Voz de Jarvis" value={speech.selectedVoice ?? ''} onChange={(e) => speech.changeVoice(e.target.value)}><option value="">Voz automática</option>{speech.voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select>}
          </div>
        </div>
        </div>
        </div>
      </main>

      <ConfirmDialog pending={pendingConfirmations} onConfirm={confirmAction} />
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" x2="17" y1="9" y2="15" />
      <line x1="17" x2="23" y1="9" y2="15" />
    </svg>
  );
}

export default App;
