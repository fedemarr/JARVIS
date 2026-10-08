import { apiFetch } from './api';

const local=['localhost','127.0.0.1'].includes(window.location.hostname) && window.location.port==='3002';
let connected=local;
let natural=false;
let credential:{token:string;until:number}|undefined;
let issuing:Promise<string>|undefined;
let ticketCredential:{token:string;until:number}|undefined;
let issuingTicket:Promise<string>|undefined;
export const desktopConnected=()=>connected;
export const naturalVoiceAvailable=()=>natural;
function update(online:boolean,voice=false) {
  if(connected!==online || natural!==voice){connected=online;natural=voice;window.dispatchEvent(new Event('jarvis-desktop-changed'));}
}
async function token() {
  if(credential && credential.until>Date.now())return credential.token;
  issuing ??= (async()=>{
    const response=await apiFetch('/api/desktop/bridge-session',{method:'POST',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('No pude vincular esta PC.');
    const data=await response.json();if(typeof data.token!=='string')throw new Error('Conexión local no disponible.');
    credential={token:data.token,until:Date.now()+Math.min(Number(data.expiresIn)||60,600)*1000-30000};
    return data.token as string;
  })().finally(()=>{issuing=undefined;});
  return issuing;
}
export async function desktopFetch(url:string,init:RequestInit={}):Promise<Response> {
  if(!/^\/api\/(?:desktop\/(?:status|files|read|git)|voice\/(?:status|synthesize))(?:\?|$)/.test(url))throw new Error('Operación local no disponible.');
  if(local)return apiFetch(url,init);
  const bearer=await token();
  const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+bearer);
  const response=await fetch('http://127.0.0.1:3002'+url.replace('/api/','/api/bridge/'),{...init,headers,credentials:'omit',mode:'cors'});
  if(response.status===401)credential=undefined;
  return response;
}
export async function ticketFetch(url:string,init:RequestInit={}):Promise<Response> {
  if(!/^\/api\/tickets(?:\/status|\/[a-f0-9-]{36}\/(?:cancel|open)|\/erp\/(?:status|list|connect|download|run))?$/.test(url))throw new Error('Operación de tickets no disponible.');
  if(local)return apiFetch(url,init);
  if(!ticketCredential || ticketCredential.until<=Date.now()) {
    issuingTicket ??= (async()=>{
      const response=await apiFetch('/api/desktop/ticket-session',{method:'POST',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('No pude autorizar el ejecutor de tickets.');
      const data=await response.json();if(typeof data.token!=='string')throw new Error('Credencial de tickets no disponible.');
      ticketCredential={token:data.token,until:Date.now()+Math.min(Number(data.expiresIn)||60,600)*1000-30000};
      return data.token as string;
    })().finally(()=>{issuingTicket=undefined;});
    await issuingTicket;
  }
  const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+ticketCredential!.token);
  const response=await fetch('http://127.0.0.1:3002'+url.replace('/api/','/api/bridge/'),{...init,headers,credentials:'omit',mode:'cors'});
  if(response.status===401)ticketCredential=undefined;
  return response;
}
export async function refreshDesktop() {
  try {
    const response=await desktopFetch('/api/desktop/status',{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('Equipo no conectado.');
    const status=await response.json();update(true,status.voice?.available===true);return status;
  } catch(error) {update(false);throw error;}
}
window.addEventListener('jarvis-session-expired',()=>{credential=undefined;ticketCredential=undefined;update(false);});
window.addEventListener('jarvis-logout',()=>{credential=undefined;ticketCredential=undefined;update(false);});
