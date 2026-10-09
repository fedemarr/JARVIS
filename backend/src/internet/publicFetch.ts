import { Agent, fetch } from 'undici';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export function publicAddress(address:string):boolean {
  try {return ipaddr.process(address).range()==='unicast';} catch {return false;}
}
export function publicUrl(input:string):URL {
  const url=new URL(input);
  const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443') || !host.includes('.') && !isIP(host)
    || /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(host) || (isIP(host) && !publicAddress(host))) throw new Error('Solo se pueden leer páginas HTTPS públicas.');
  url.hash='';return url;
}
type Result={url:string;body:string;contentType:string;truncated:boolean};
export async function publicFetch(input:string,limit=256000):Promise<Result> {
  let url=publicUrl(input);
  const deadline=Date.now()+20000;
  for(let redirects=0;redirects<=3;redirects++) {
    const host=url.hostname.replace(/^\[|\]$/g,'');
    let dnsTimer:NodeJS.Timeout|undefined;
    const addresses=await Promise.race([
      isIP(host)?Promise.resolve([{address:host,family:isIP(host)}]):lookup(host,{all:true}),
      new Promise<never>((_,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('La página tardó demasiado.')),Math.max(1,Math.min(5000,deadline-Date.now())));}),
    ]).finally(()=>{if(dnsTimer)clearTimeout(dnsTimer);});
    if(!addresses.length || addresses.some((a)=>!publicAddress(a.address))) throw new Error('La página apunta a una dirección privada o reservada.');
    const selected=addresses.find((a)=>a.family===4) || addresses[0];
    // Mantener hostname/SNI y TLS, con una única resolución y sin proxy del entorno.
    const agent=new Agent({connect:{family:selected.family,lookup:(_host,_options,callback)=>callback(null,selected.address,selected.family)}});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1,Math.min(10000,deadline-Date.now())));
    try {
      const response=await fetch(url,{dispatcher:agent,redirect:'manual',signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; JarvisReader/1.0)','Accept':'text/html,application/json,application/javascript,text/plain,*/*;q=0.5'}});
      const redirect=response.headers.get('location');
      if([301,302,303,307,308].includes(response.status) && redirect) {
        await response.body?.cancel();url=publicUrl(new URL(redirect,url).href);continue;
      }
      if(!response.ok) {await response.body?.cancel();throw new Error(`La fuente respondió HTTP ${response.status}.`);}
      const contentType=response.headers.get('content-type') || '';
      if(!/text\/|json|xml|javascript/i.test(contentType)) {await response.body?.cancel();throw new Error('La fuente no es una página de texto.');}
      const reader=response.body?.getReader();if(!reader)throw new Error('La fuente no devolvió texto.');
      const chunks:Buffer[]=[];let bytes=0;let truncated=false;
      while(true) {
        const part=await reader.read();if(part.done)break;
        const remaining=limit-bytes;chunks.push(Buffer.from(part.value.subarray(0,remaining)));bytes+=Math.min(part.value.length,remaining);
        if(part.value.length>=remaining) {truncated=true;await reader.cancel();break;}
      }
      return {url:url.href,body:Buffer.concat(chunks).toString('utf8'),contentType,truncated};
    } finally {clearTimeout(timer);await agent.destroy();}
  }
  throw new Error('La página redirigió demasiadas veces.');
}
