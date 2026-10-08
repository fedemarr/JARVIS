import path from 'node:path';

export type TicketIdentity={title:string;number?:string;module?:string};
export function ticketIdentity(text:string,filename?:string):TicketIdentity|undefined {
  const title=text.match(/^#\s+(.+)$/m)?.[1] || text.match(/<(?:h1|title)[^>]*>([\s\S]*?)<\/(?:h1|title)>/i)?.[1];
  const clean=(value:string)=>value.replace(/<[^>]*>/g,'').replace(/[\r\n]+/g,' ').trim().slice(0,200);
  const name=title?clean(title):filename?path.basename(filename).replace(/\.[^.]+$/,''):undefined;
  if(!name)return undefined;
  return {title:name,number:text.match(/^Número visible:\s*(#?\d+)/m)?.[1],module:text.match(/^Módulo:\s*(.+)$/m)?.[1]?.trim().slice(0,100)};
}
