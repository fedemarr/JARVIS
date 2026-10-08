type ReportJob={status:string;message:string;ticket?:{title:string;number?:string;module?:string};summary?:string;files?:string[];checks?:{name:string;status:string;output:string}[];publication?:{status:string;message:string;commit?:string;url?:string}};
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[*_:]/g,'').trim();
function section(text:string,pattern:RegExp):string {
  let collecting=false,lines:string[]=[],result='';
  for(const line of text.split('\n')){
    const heading=line.match(/^\s*#{1,6}\s+(.+?)\s*#*$/)?.[1] || line.match(/^\s*\*\*(.+?)\*\*:?\s*$/)?.[1];
    if(heading){if(collecting)result=lines.join('\n').trim();collecting=pattern.test(normalize(heading));lines=[];}
    else if(collecting)lines.push(line);
  }
  return collecting?lines.join('\n').trim():result;
}
export function ticketReport(job:ReportJob):string {
  const text=job.summary||'';
  const summary=section(text,/^resumen(?:\b|$)/) || section(text,/^(?:que cambio|cambios)(?:\b|$)/) || section(text,/^causa(?:\b|$)/) || text.split(/\n\s*\n/)[0] || 'El trabajo todavía no tiene un resumen.';
  const testPlan=section(text,/^(?:que probar|pruebas manuales|como probar)(?:\b|$)/) || 'El ejecutor todavía no dejó pasos específicos para probar este ticket. Revisá el informe completo antes de darlo por aprobado.';
  const limits=section(text,/^limites(?:\b|$)/);
  const checks=(job.checks||[]).filter(check=>!check.name.startsWith('Sintaxis ')).map(check=>{
    const totals=check.output.split('\n').filter(line=>/^\s*(?:Test Files|Tests)\s+\d+/.test(line)).map(line=>line.trim());
    return `- ${check.name}: ${check.status==='passed'?'aprobado':check.status==='failed'?'falló':'no ejecutado'}${totals.length?' — '+totals.join('; '):''}`;
  });
  const number=job.ticket?.number || text.match(/ticket\s+(#\d+)/i)?.[1];
  const identity=[number,job.ticket?.title].filter(Boolean).join(' — ') || 'Nombre del ticket no disponible';
  return ['# Informe para Lautaro',`\n**Ticket:** ${identity}`,...(job.ticket?.module?[`**Módulo:** ${job.ticket.module}`]:[]),
    '\n## Resumen',summary,
    '\n## Qué probar',testPlan,
    '\nPruebas manuales pendientes de realizar en el navegador; los pasos anteriores son para verificar el resultado.',
    ...(limits?['\n## Observaciones',limits]:[]),
    '\n## Verificación automática',...(checks.length?checks:['Todavía no hay comprobaciones.']),
    '\n## Publicación',job.publication?`${job.publication.message}${job.publication.commit?'\nCommit: '+job.publication.commit:''}${job.publication.url?'\nWeb para probar: '+job.publication.url:''}`:'Todavía no se hizo commit ni deploy. La publicación requiere confirmar «Commit y deploy».',
    '\nEl ticket no se cierra automáticamente.'].join('\n');
}
