const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function parseTicketCommand(text:string):{action:'list'|'run';selector?:string;erp:boolean}|undefined {
  const clean=normalize(text);
  if(!/\btickets?\b/.test(clean) || /\b(?:no|nunca)\s+(?:quiero\s+que\s+)?(?:resuelv|resolv|hag|hac|ejecut|implement)/.test(clean))return;
  const erp=/ohlimpia|\berp\b|bandeja|\bweb\b/.test(clean);
  const execute=/\b(?:resolve|resolver|resuelve|resuelvas|resolvelo|implementa|implementar|implementes|hace|hacer|haz|hagas|realiza|realizar|ejecuta|ejecutar|trabaja)\b/.test(clean);
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
