import {useEffect,useState} from 'react';
import {ticketFetch} from '../lib/desktop';

type Result={status:string;message:string;at:string};
type Plan={file:string;sha:string;sql:string;statements:number;configured:boolean;connectionMessage:string;staging?:Result;productionTest?:Result;production?:Result};
export function SqlMigrationsPanel(){
  const [files,setFiles]=useState<string[]>([]),[file,setFile]=useState(''),[plan,setPlan]=useState<Plan>(),[busy,setBusy]=useState(false),[reviewed,setReviewed]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{let active=true;void ticketFetch('/api/tickets/migrations').then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.message);if(active){setFiles(data.files);setFile(data.files[0]||'');}}).catch(()=>{if(active)setNotice('No pude consultar las migraciones de esta PC.');});return()=>{active=false;};},[]);
  async function request(action:'plan'|'staging'|'production'|'production-test'){
    setBusy(true);setNotice(action==='plan'?'Leyendo SQL…':action==='staging'?'Probando en staging; los cambios de la prueba se revierten…':action==='production-test'?'Probando en producción sin guardar cambios…':'Aplicando la migración en producción…');
    try{
      const response=await ticketFetch('/api/tickets/migrations/'+(action==='plan'?'plan':'execute'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='plan'?{file}:{file:plan?.file,sha:plan?.sha,target:action==='production-test'?'production':action,dryRun:action==='production-test',reviewed}),signal:AbortSignal.timeout(180000)});
      const data=await response.json();if(!response.ok)throw new Error(data.message);
      if(action==='plan'){setPlan(data);setReviewed(false);setNotice(data.production?.message||data.connectionMessage||'Revisá el SQL antes de aplicarlo.');}
      else{setPlan(value=>value?{...value,[action==='production-test'?'productionTest':action]:data}:value);setNotice(data.message);}
    }catch(error){setNotice(error instanceof Error?error.message:'No pude ejecutar el SQL.');}
    finally{setBusy(false);}
  }
  const applied=['applied','already-applied'].includes(plan?.production?.status||'');
  return <section className="ticket-publication" aria-label="Migraciones SQL"><span className="eyebrow">BASE DE DATOS · OHLIMPIAERP</span><h3>Migraciones SQL</h3><p>Revisá el archivo, probalo y aplicalo desde Jarvis. El deploy del código y la ejecución del SQL tienen estados separados.</p>
    <select aria-label="Migración SQL" value={file} disabled={busy} onChange={event=>{setFile(event.target.value);setPlan(undefined);setReviewed(false);setNotice('');}}>{files.map(name=><option key={name} value={name}>{name}</option>)}</select>
    <button type="button" disabled={busy||!file} onClick={()=>void request('plan')}>Revisar SQL</button>
    {plan && <div><details><summary>Ver SQL · {plan.statements} sentencias</summary><pre>{plan.sql}</pre></details><p>Destino: producción de OhlimpiaERP.</p>
      <button type="button" disabled={busy||applied} onClick={()=>void request('staging')}>Probar en staging</button>
      <label><input type="checkbox" checked={reviewed} disabled={busy||applied} onChange={event=>setReviewed(event.target.checked)}/> Revisé este SQL y quiero aplicarlo a OhlimpiaERP.</label>
      <button type="button" disabled={busy||applied||!reviewed||!plan.configured} onClick={()=>void request('production-test')}>Probar en producción sin guardar</button>
      <button type="button" disabled={busy||applied||!reviewed||!plan.configured||(plan.staging?.status!=='tested'&&plan.productionTest?.status!=='tested')} onClick={()=>void request('production')}>{applied?'SQL aplicado':busy?'Ejecutando…':'Aplicar SQL'}</button>
      {!applied&&plan.staging?.status!=='tested'&&plan.productionTest?.status!=='tested'&&<p>Primero debe aprobarse una prueba en staging o una prueba revertida en producción.</p>}
    </div>}
    <p role="status">{notice}</p>
  </section>;
}
