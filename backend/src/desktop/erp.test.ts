import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { ErpBrowser,ERP_ORIGIN,selectErpTicket } from './erp';

test('ERP: selección exacta, siguiente pendiente y títulos ambiguos',()=>{
  const rows=[{id:'100',number:'#3',title:'Cerrado',module:'',priority:'',state:'Cerrado'},{id:'200',number:'#2',title:'Factura A',module:'',priority:'alta',state:'Abierto'},{id:'300',number:'#1',title:'Factura B',module:'',priority:'',state:'En progreso'}];
  assert.equal(selectErpTicket(rows,'siguiente')?.id,'200');assert.equal(selectErpTicket(rows,'#1')?.id,'300');assert.equal(selectErpTicket(rows,'Factura A')?.id,'200');assert.throws(()=>selectErpTicket(rows,'Factura'),/varios/);assert.throws(()=>selectErpTicket(rows,'999'),/No encontré/);
});
test('ERP: bandeja, modal y descarga real del navegador en carpeta nueva, sin ejecutar HTML',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jarvis-erp-'));const project=path.join(root,'project');await fs.mkdir(project);const browser=await chromium.launch({headless:true});
  const html=`<div id="app"><span id="sidebar-rol">DEVELOPER</span><select id="dev-filtro-estado"><option value=""></option></select><select id="dev-filtro-tipo"><option value=""></option></select><select id="dev-filtro-prioridad"><option value=""></option></select><table><tbody id="tbody-dev-tickets"><tr onclick="abrirTicketPorId('200')"><td>#1</td><td>Mejora</td><td>Factura</td><td>Finanzas</td><td>Fede</td><td>Hoy</td><td>alta</td><td>Abierto</td></tr></tbody></table></div><div id="modal-dev-ticket" style="display:none"><span id="dt-titulo">Factura</span><div id="dt-descripcion">Corregir el total.</div><div id="dt-adjuntos"><div><span>mockup.html</span><button title="Descargar" onclick="descargar()">Descargar</button></div></div></div><script>window.navTo=()=>{};window.abrirTicketPorId=()=>document.querySelector('#modal-dev-ticket').style.display='block';window.descargar=()=>{const a=document.createElement('a');a.download='../../mockup.html';a.href=URL.createObjectURL(new Blob(['<h1>Total</h1><scr'+'ipt>window.evil=true</scr'+'ipt>'],{type:'text/html'}));document.body.append(a);a.click();a.remove();};</script>`;
  const erp=new ErpBrowser(root,{projects:[{id:'ohlimpiaerp',name:'Test',root:project}]},async()=>{const context=await browser.newContext({acceptDownloads:true});await context.route(ERP_ORIGIN+'/**',route=>route.fulfill({contentType:'text/html',body:html}));return context;});
  try {
    await erp.connect();assert.equal((await erp.status()).connected,true);assert.equal((await erp.list())[0].title,'Factura');
    const downloaded=await erp.download('siguiente');assert(downloaded.ticketPath.startsWith('jarvis-tickets/'));assert.equal(downloaded.referencePaths.length,1);assert(!downloaded.referencePaths[0].includes('../'));
    assert((await fs.readFile(path.join(project,downloaded.ticketPath),'utf8')).includes('Corregir el total.'));assert((await fs.readFile(path.join(project,downloaded.referencePaths[0]),'utf8')).includes('<h1>Total</h1>'));
    assert.equal(await (await browser.contexts()[0].pages()[0]).evaluate('window.evil'),undefined);
  }finally{await erp.close();await browser.close();assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});}
});
