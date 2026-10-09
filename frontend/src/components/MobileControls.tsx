import {useEffect,useRef,useState} from 'react';
import {installedApp,installMobile} from '../lib/mobile';
type Props={conversations:{id:string;title?:string|null}[];busy:boolean;onNew:()=>void;onSelect:(id:string)=>void};
export function MobileControls({conversations,busy,onNew,onSelect}:Props){
  const dialog=useRef<HTMLDialogElement>(null),[view,setView]=useState<'install'|'history'>('install'),[installed,setInstalled]=useState(installedApp);
  useEffect(()=>{const update=()=>setInstalled(installedApp());window.addEventListener('jarvis-install-changed',update);return()=>window.removeEventListener('jarvis-install-changed',update);},[]);
  const open=(kind:'install'|'history')=>{setView(kind);dialog.current?.showModal();};
  return <div className="mobile-controls">
    <button type="button" disabled={busy} onClick={onNew}>＋ Nueva</button>
    <button type="button" onClick={()=>open('history')}>Conversaciones</button>
    {!installed&&<button type="button" onClick={()=>void installMobile().then(prompted=>{if(!prompted)open('install');}).catch(()=>open('install'))}>Instalar Jarvis</button>}
    <dialog ref={dialog} className="mobile-dialog" aria-labelledby="mobile-dialog-title">
      <div className="mobile-dialog-heading"><h2 id="mobile-dialog-title">{view==='install'?'Jarvis en tu celular':'Tus conversaciones'}</h2><button type="button" aria-label="Cerrar ventana" onClick={()=>dialog.current?.close()}>×</button></div>
      {view==='install'?<><p>Agregá Jarvis a la pantalla de inicio para abrirlo como una app.</p><p><strong>Android:</strong> abrí este enlace en Chrome. En el menú ⋮, elegí «Instalar aplicación» o «Agregar a pantalla principal».</p><p><strong>iPhone:</strong> abrilo en Safari. Tocá Compartir y «Agregar a pantalla de inicio».</p><p>Entrá con tu clave de acceso. El chat necesita internet; el micrófono se activa con tu permiso y con la app abierta.</p></>:<div className="mobile-history">{conversations.length?conversations.map(conversation=><button type="button" key={conversation.id} disabled={busy} onClick={()=>{onSelect(conversation.id);dialog.current?.close();}}>{conversation.title||'Sin título'}</button>):<p>Todavía no tenés conversaciones guardadas.</p>}</div>}
    </dialog>
  </div>;
}
