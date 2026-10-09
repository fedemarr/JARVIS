import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useChat } from './hooks/useChat';
import { useSpeech } from './hooks/useSpeech';
import { ChatMessage } from './components/ChatMessage';
import { Orb } from './components/Orb';
import { TicketImport } from './components/TicketImport';
import { DesktopPanel } from './components/DesktopPanel';
import { apiFetch } from './lib/api';
import { desktopConnected, naturalVoiceAvailable } from './lib/desktop';
import { parseTicketCommand } from './lib/ticketCommand';
import { useAccess } from './components/AccessGate';
import { MicButton } from './components/MicButton';
import { ToolCard } from './components/ToolCard';
import { ConfirmDialog } from './components/ConfirmDialog';
import { createBrowserVoice, createInterruptionListener } from './lib/browserVoice';
import { isStopReplyCommand } from './lib/voiceCommands';
import { useReplyInterrupt } from './hooks/useReplyInterrupt';
import { findSpokenBoundary } from './lib/spokenText';
import { LlmMessage } from '../../shared/llm';
import {MobileControls} from './components/MobileControls';
import {mobileDevice} from './lib/mobile';

function App() {
  const access = useAccess();
  const [input, setInput] = useState('');
  const [activeArea, setActiveArea] = useState<'communication' | 'tickets' | 'computer'>('communication');
  const localViewRef = useRef<HTMLElement>(null);
  useEffect(() => { localViewRef.current?.scrollTo({ top: 0 }); }, [activeArea]);
  const prepareMessage = (text:string) => { setInput(text); setActiveArea('communication'); };
  const [coreGreeting, setCoreGreeting] = useState('');
  const [handsFree, setHandsFree] = useState(() => {
    if (new URLSearchParams(window.location.search).get('desktop') !== '1') return false;
    try { return localStorage.getItem('jarvis.desktop.handsFree') === 'true'; }
    catch { return false; }
  });
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('desktop') !== '1') return;
    try { localStorage.setItem('jarvis.desktop.handsFree', String(handsFree)); }
    catch { /* Storage may be unavailable; voice still works for this session. */ }
  }, [handsFree]);
  const [voiceAwake, setVoiceAwake] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [providerModel, setProviderModel] = useState('');
  const {
    messages,
    sendMessage,
    cancelResponse,
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
  const stopReplyRef = useRef<()=>void>(()=>{});
  const replyInterruptedRef = useRef(false);
  const localNoticeVoiceRef=useRef<(text:string)=>void>(()=>{});
  const routeTicket = (text:string) => {
    if(!parseTicketCommand(text))return false;
    if(!desktopConnected()){addSystemMessage(mobileDevice?'Para ejecutar este ticket en tu PC falta conectar el acceso remoto desde el celular. Podés analizar su contenido acá; la ejecución con Claude Code se hace en la computadora.':'Conectá esta PC para ejecutar tickets con Claude Code.');return true;}
    window.dispatchEvent(new CustomEvent('jarvis-run-ticket',{detail:text}));
    return true;
  };
  useEffect(()=>{
    const notice=(event:Event)=>{const text=(event as CustomEvent<string>).detail;addSystemMessage(text);localNoticeVoiceRef.current(text);};
    window.addEventListener('jarvis-ticket-notice',notice);
    return()=>window.removeEventListener('jarvis-ticket-notice',notice);
  },[addSystemMessage]);

  const voice = useMemo(() => createBrowserVoice(), []);
  const interruptionListener = useMemo(() => createInterruptionListener(), []);

  const speech = useSpeech({
    stt: voice.stt,
    tts: voice.tts,
    onCommand: (text) => {
      if(isStopReplyCommand(text)){stopReplyRef.current();return;}
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
  useEffect(()=>{
    if(!mobileDevice)return;
    const pause=()=>{if(document.visibilityState!=='visible'){setHandsFree(false);setVoiceAwake(false);speech.abortListening();speech.cancelSpeaking();setVoiceNotice('Micrófono pausado al salir de la app. Activá manos libres para volver a escuchar.');}};
    document.addEventListener('visibilitychange',pause);return()=>document.removeEventListener('visibilitychange',pause);
  },[speech.abortListening,speech.cancelSpeaking]);
  useReplyInterrupt({listener:interruptionListener,enabled:!mobileDevice && handsFree && (isLoading || speech.orbState==='SPEAKING'),onStop:()=>stopReplyRef.current(),isEcho:speech.isSpeechEcho});
  useEffect(()=>{
    const failed=(event:Event)=>{setHandsFree(false);setVoiceAwake(false);speech.abortListening();setVoiceNotice((event as CustomEvent<string>).detail);};
    window.addEventListener('jarvis-voice-error',failed);return()=>window.removeEventListener('jarvis-voice-error',failed);
  },[speech.abortListening]);

  const pendingSpeechRef = useRef('');
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  stopReplyRef.current=()=>{
    replyInterruptedRef.current=true;
    pendingSpeechRef.current='';
    if(speakingTimerRef.current){clearTimeout(speakingTimerRef.current);speakingTimerRef.current=null;}
    cancelResponse();
    speech.abortListening();
    speech.cancelSpeaking();
    setVoiceAwake(false);
    setCoreGreeting('');
    setVoiceNotice('Respuesta detenida. Decí «Jarvis» cuando me necesites.');
  };

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
      if(replyInterruptedRef.current)return;
      if(mobileDevice&&document.visibilityState!=='visible')return;
      pendingSpeechRef.current += delta;
      const acc = pendingSpeechRef.current;
      const spokenUpTo = findSpokenBoundary(acc);
      if (spokenUpTo > 0) {
        const chunk = acc.slice(0, spokenUpTo);
        pendingSpeechRef.current = acc.slice(spokenUpTo);
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
    if(isStopReplyCommand(text)){stopReplyRef.current();return;}
    if(routeTicket(text)){setInput('');return;}
    if (commandBusyRef.current) return;
    commandBusyRef.current = true;
    replyInterruptedRef.current=false;
    setVoiceNotice('');
    try {
    setInput('');
    setCoreGreeting('');
    speech.abortListening();
    speech.cancelSpeaking();
    speech.setThinking();
    pendingSpeechRef.current = '';
    if(mobileDevice)speech.activateAudio();
    const reply = await sendMessage(text, currentConversationId, handleStreamToken);
    if (reply && !replyInterruptedRef.current) {
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
    if(isStopReplyCommand(text)){stopReplyRef.current();setInput('');return;}
    if (!text || isLoading || commandBusyRef.current) return;
    if(routeTicket(text)){setInput('');return;}
    commandBusyRef.current = true;
    replyInterruptedRef.current=false;
    setVoiceNotice('');
    try {
    setInput('');
    setCoreGreeting('');
    speech.abortListening();
    speech.cancelSpeaking();
    speech.setThinking();
    pendingSpeechRef.current = '';
    if(mobileDevice)speech.activateAudio();
    const reply = await sendMessage(text, currentConversationId, handleStreamToken);
    if (reply && !replyInterruptedRef.current) {
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
        <button className="nav-item" onClick={() => { setActiveArea('communication'); handleNewConversation(); }} disabled={isLoading}><span>◈</span> Nueva misión <span className="nav-plus">+</span></button>
        <button className={`nav-item ${activeArea === 'tickets' ? 'nav-active' : ''}`} onClick={() => setActiveArea('tickets')}><span>⌘</span> OhlimpiaERP</button>
        <div className="sidebar-section-label personal-heading">ASISTENCIA PERSONAL</div>
        <button className="nav-item" disabled={isLoading} onClick={() => prepareMessage('Ayudame a planificar mi día a partir de mis tareas pendientes.')}><span>◎</span> Mi día</button>
        <button className="nav-item" disabled={isLoading} onClick={() => prepareMessage('Quiero estudiar un tema. Preguntame cuál y mi nivel para armar una sesión práctica.')}><span>◇</span> Estudio</button>
        <button className="nav-item" disabled={isLoading} onClick={() => prepareMessage('Ayudame a preparar una campaña de marketing para mi empresa. Preguntame objetivo, público y presupuesto.')}><span>↗</span> Marketing</button>
        <div className="sidebar-section-label history-heading">CONVERSACIONES <span>{conversations.length.toString().padStart(2, '0')}</span></div>
        <div className="conversation-list">
          {conversations.length === 0 && <p className="sidebar-empty">Tu próxima idea empieza acá.</p>}
          {conversations.map((conv) => (
            <button key={conv.id} disabled={isLoading} className={`conversation-item ${conv.id === currentConversationId ? 'conversation-selected' : ''}`} onClick={() => { setActiveArea('communication'); selectConversation(conv.id); }}>
              <span>›</span>{conv.title || 'Sin título'}
            </button>
          ))}
        </div>
        <div className="operator"><div className="operator-avatar">F</div><div>Federico<small>OPERADOR PRINCIPAL</small></div><span className="operator-dot" /></div>
        {access.required && <button className="logout-button" onClick={() => void access.logout()} disabled={isLoading}>Cerrar sesión</button>}
      </aside>

      <main className="command-main">
        <header className="command-header">
          <div><span className="eyebrow">JARVIS / ESPACIO PERSONAL</span><h1>{activeArea === 'communication' ? 'Comunicación' : activeArea === 'tickets' ? 'Centro de tickets' : 'Tu computadora'}</h1></div>
          <div className="header-actions"><button type="button" className="refresh-app" onClick={()=>{const url=new URL(window.location.href);url.searchParams.set('refresh',String(Date.now()));window.location.replace(url.href);}}>Actualizar Jarvis</button><div className={`connection-chip connection-${backendStatus}`}><span />{backendStatus === 'connected' ? 'EN LÍNEA' : backendStatus === 'checking' ? 'CONECTANDO' : 'SIN CONEXIÓN'}</div></div>
        </header>
        <MobileControls conversations={conversations} busy={isLoading} onNew={handleNewConversation} onSelect={id=>{setActiveArea('communication');selectConversation(id);}} />
        <nav className="workspace-navigation" aria-label="Sectores de Jarvis">
          <button type="button" aria-label="Comunicación" aria-pressed={activeArea === 'communication'} onClick={() => setActiveArea('communication')}><span className="area-icon">◉</span><span>Comunicación<small>Conversación y voz</small></span></button>
          <button type="button" aria-label="Tickets" aria-pressed={activeArea === 'tickets'} onClick={() => setActiveArea('tickets')}><span className="area-icon">⌘</span><span>Tickets<small>OhlimpiaERP y Claude Code</small></span></button>
          <button type="button" aria-label="Computadora" aria-pressed={activeArea === 'computer'} onClick={() => setActiveArea('computer')}><span className="area-icon">▣</span><span>Computadora<small>Proyectos y archivos</small></span></button>
        </nav>
        <div className="global-voice-controls">
          <span className="voice-engine">{naturalVoiceAvailable()?'Voz natural · Alex':'Voz del navegador'}</span>
          <div className="handsfree-controls">
            {mobileDevice&&speech.ttsSupported&&<button type="button" className="handsfree-toggle" onClick={()=>{setVoiceNotice('');speech.abortListening();speech.cancelSpeaking();speech.activateAudio();speech.speak('Buenas, Federico. Esta es mi voz. ¿Me escuchás?',true);}}>Probar voz</button>}
            {(isLoading || speech.orbState==='SPEAKING') && <button type="button" className="stop-reply-button" onClick={()=>stopReplyRef.current()}>Detener respuesta</button>}
            <button type="button" className={handsFree ? 'handsfree-toggle handsfree-active' : 'handsfree-toggle'} aria-pressed={handsFree} disabled={!speech.sttSupported || !speech.ttsSupported} onClick={() => {
              setVoiceNotice('');
              setVoiceAwake(false);
              if (handsFree) { setHandsFree(false); speech.abortListening(); }
              else {
                speech.activateAudio();
                setHandsFree(true);
                // Activar durante una respuesta debe esperar, no cancelar la voz.
                if (!isLoading && !commandBusyRef.current && speech.orbState === 'IDLE'){
                  if(mobileDevice)speech.speak('Manos libres activado. Decí Jarvis para llamarme.',true);
                  else speech.startListening();
                }
              }
            }}>{handsFree ? 'Desactivar manos libres' : 'Activar manos libres'}</button>
            <span role="status">{handsFree ? isLoading || speech.orbState === 'SPEAKING' ? mobileDevice?'Tocá «Detener respuesta» para cortar · al terminar vuelvo a escucharte':'Decí «gracias, Jarvis» para detener la respuesta' : voiceAwake ? 'Conversación activa · te escucho al terminar de hablar' : 'Decí «Jarvis» para llamarme' : !speech.sttSupported ? 'Reconocimiento de voz no disponible en este navegador' : 'Activá el micrófono una vez y después decí «Jarvis»'}</span>
          </div>
          {voiceNotice && <p className="voice-notice" role="alert">{voiceNotice}</p>}
        </div>
        <div className="mission-workspace" hidden={activeArea !== 'communication'}>
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
            <button onClick={() => setActiveArea('tickets')}><span className="shortcut-icon">⌘</span><div><strong>Ir a tickets</strong><small>Tu bandeja y trabajos en curso</small></div><span>↗</span></button>
            <button disabled={isLoading} onClick={() => setInput('Revisá mis tareas pendientes y ayudame a elegir las prioridades de hoy.')}><span className="shortcut-icon">◎</span><div><strong>Organizar mi día</strong><small>Tareas · enfoque y próximos pasos</small></div><span>↗</span></button>
          </section>

          <div className="session-strip"><span><i /> {handsFree ? 'Manos libres activo' : 'Chat y voz disponibles'}</span><span>{providerModel || 'Conectando inteligencia…'}</span></div>
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
          <form onSubmit={handleSendText} className="command-composer">
            <MicButton listening={speech.orbState === 'LISTENING'} supported={speech.sttSupported} onStart={() => { speech.activateAudio();setHandsFree(false); setVoiceAwake(false); speech.startListening(); }} onStop={speech.stopListening} />
            <textarea aria-label="Mensaje para Jarvis" rows={2} value={inputValue} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder={speech.orbState === 'LISTENING' ? 'Te escucho…' : 'Escribí tu próxima misión…'} />
            <button type="button" onClick={speech.toggleMute} aria-label={speech.isMuted ? 'Activar voz' : 'Silenciar voz'} title={speech.isMuted ? 'Activar voz' : 'Silenciar voz'} className="voice-toggle">{speech.isMuted ? <MutedIcon /> : <SpeakerIcon />}</button>
            <button type="submit" disabled={(isLoading && !isStopReplyCommand(input)) || !input.trim()} className="send-button" aria-label="Enviar mensaje">↗</button>
          </form>
          <div className="composer-footer"><span>{mobileDevice?'Escribí o tocá el micrófono para hablar':'ENTER para enviar · SHIFT + ENTER para nueva línea'}</span>
            {speech.ttsSupported && speech.voices.length > 0 && <select aria-label="Voz de Jarvis" value={speech.selectedVoice ?? ''} onChange={(e) => speech.changeVoice(e.target.value)}><option value="">Voz automática</option>{speech.voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select>}
          </div>
        </div>
        </div>
        </div>
        <section ref={localViewRef} className="local-view" hidden={activeArea === 'communication'} aria-label={activeArea === 'tickets' ? 'Espacio de tickets' : 'Espacio de computadora'}>
          <DesktopPanel area={activeArea} onImport={(text) => { setInput(text); setActiveArea('communication'); }} disabled={isLoading} />
          <div className="ticket-import-area" hidden={activeArea !== 'tickets'}><TicketImport onImport={(text) => { setInput(text); setActiveArea('communication'); }} disabled={isLoading} /></div>
        </section>
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
