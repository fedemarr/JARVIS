type ReportJob={status:string;message:string;summary?:string;files?:string[];checks?:{name:string;status:string;output:string}[];publication?:{status:string;message:string;commit?:string;url?:string}};
export function ticketReport(job:ReportJob):string {
  const checks=(job.checks||[]).map(check=>{
    const totals=check.output.split('\n').filter(line=>/^\s*(?:Test Files|Tests)\s+\d+/.test(line)).map(line=>line.trim());
    return `- ${check.name}: ${check.status==='passed'?'aprobado':check.status==='failed'?'falló':'no ejecutado'}${totals.length?' — '+totals.join('; '):''}`;
  });
  return ['# Informe del ticket',job.status==='ready'?'Cambios preparados para revisión.':job.message,
    '\n## Publicación',job.publication?`${job.publication.message}${job.publication.commit?'\nCommit: '+job.publication.commit:''}${job.publication.url?'\nWeb: '+job.publication.url:''}`:'Cambios locales preparados. Todavía no se hizo commit ni deploy. La publicación requiere confirmar «Commit y deploy». El ticket no se cierra automáticamente.',
    '\n## Archivos modificados',...(job.files?.map(file=>'- '+file)||['No se registraron cambios.']),
    '\n## Verificación realizada por Jarvis',...(checks.length?checks:['Todavía no hay comprobaciones.']),
    '\nLas pruebas manuales en el navegador y contra la base real siguen pendientes.',
    '\n## Informe de cambios y qué probar',
    'El informe siguiente fue escrito por Claude antes de las comprobaciones del ejecutor. Para el estado real de las pruebas, usá la verificación de Jarvis indicada arriba.',
    job.summary||'El ejecutor todavía no entregó su informe.'].join('\n');
}
