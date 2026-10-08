const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
type PendingTicket={id:string;title:string;state:string};
let pendingTickets:PendingTicket[]=[];
export function setTicketContext(tickets:PendingTicket[]){pendingTickets=tickets.filter(t=>/^(abierto|en progreso)$/i.test(t.state));}
window.addEventListener('jarvis-logout',()=>{pendingTickets=[];});

export function parseTicketCommand(text:string):{action:'list'|'run';selector?:string;erp:boolean}|undefined {
  const clean=normalize(text);
  if(/\b(?:no|nunca)\s+(?:quiero\s+que\s+)?(?:resuelv|resolv|hag|hac|ejecut|implement)/.test(clean))return;
  const erp=/ohlimpia|\berp\b|bandeja|\bweb\b/.test(clean);
  const execute=/\b(?:resolve|resolver|resuelve|resuelvas|resolvelo|implementa|implementar|implementes|hace|hacer|haz|hagas|realiza|realizar|ejecuta|ejecutar|trabaja)\b/.test(clean);
  const namedTickets=pendingTickets.filter(ticket=>{
    const title=normalize(ticket.title),at=clean.indexOf(title);if(at<0)return false;
    const before=clean.slice(0,at).trim(),after=clean.slice(at+title.length).replace(/[.,!?]/g,'').trim();
    const selection=/^(?:(?:jarvis|el|la|de|quiero|ese|esa)\s*[, :]*)*$/.test(before) && /^(?:(?:de|del|entre)\s+(?:los\s+)?tickets?\s+(?:(?:q|que)\s+estan\s+)?(?:abiertos|pendientes))?$/.test(after);
    return (execute && (!at || /[\s"“«']/.test(clean[at-1])) && (!clean[at+title.length] || /[\s"”»',.!?]/.test(clean[at+title.length]))) || selection;
  });
  if(namedTickets.length===1)return {action:'run',selector:namedTickets[0].id,erp:true};
  if(!/\btickets?\b/.test(clean))return;
  if(!execute){
    if(erp && /\b(?:que|cuales|ver|mostra|mostrame|mostrar|lista|listar|busca|buscar)\b/.test(clean))return {action:'list',erp:true};
    return;
  }
  const number=clean.match(/\bticket\s+(?:numero\s+|n[º°]?\s*)?#?(\d+)\b/)?.[1];
  if(number)return {action:'run',selector:number,erp};
  if(/\b(?:siguiente|proximo)\s+ticket\b|\bticket\s+(?:siguiente|proximo)\b/.test(clean))return {action:'run',selector:'siguiente',erp:true};
  const quoted=text.match(/\bticket\s+(?:(?:llamado|de|sobre)\s+)?["“«']([^"”»']+)["”»']/i)?.[1];
  const named=clean.match(/\bticket\s+(?:(?:llamado|de|sobre)\s+)?(.+)$/)?.[1]
    ?.split(/\s+(?:en|de)\s+ohlimpia|\s+(?:del?|con\s+fecha)\s+\d|\s+\d{1,2}[/-]\d|[,.;!?]/)[0]?.trim();
  const selector=quoted || (named && !/^(?:que|con|para|en|de|y|respetando|siguiendo|ohlimpia\w*|erp)\b/.test(named)?named:undefined);
  return {action:'run',selector,erp};
}
