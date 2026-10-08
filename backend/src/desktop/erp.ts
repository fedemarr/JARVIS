/// <reference lib="dom" />
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, BrowserContext, Page } from 'playwright';
import { DesktopConfig } from './projects';
import { ticketPath, secretText } from './ticketFiles';

export const ERP_ORIGIN='https://ohlimpiaerp.vercel.app';
export class ErpError extends Error {}
export type ErpTicket={id:string;number:string;title:string;module:string;priority:string;state:string};
export function selectErpTicket(tickets:ErpTicket[],selector:string) {
  const wanted=selector.trim().replace(/^#/,'');
  if(/^(?:siguiente|pr[oó]ximo)$/i.test(wanted))return tickets.find(t=>/^(?:Abierto|En progreso)$/i.test(t.state));
  const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const exact=tickets.filter(t=>t.id===wanted || t.number.replace(/^#/,'')===wanted || normalized(t.title)===normalized(wanted));
  if(exact.length===1)return exact[0];
  const matches=tickets.filter(t=>normalized(t.title).includes(normalized(wanted)));
  if(matches.length===1)return matches[0];
  throw new ErpError(matches.length>1?'Hay varios tickets con ese nombre. Elegí uno de la lista.':'No encontré ese ticket en la bandeja.');
}
export class ErpBrowser {
  private context?:BrowserContext;
  private page?:Page;
  private headed=false;
  private busy=false;
  constructor(private root:string,private config:DesktopConfig,private launch?:(profile:string,headed:boolean)=>Promise<BrowserContext>) {}
  private async session(headed=false) {
    if(this.context && this.headed===headed && this.page && !this.page.isClosed())return this.page;
    await this.context?.close();this.context=undefined;this.page=undefined;
    const profile=path.join(this.root,'data','ohlimpia-browser');await fs.mkdir(profile,{recursive:true});
    const context=await (this.launch?this.launch(profile,headed):chromium.launchPersistentContext(profile,{headless:!headed,acceptDownloads:true,viewport:{width:1366,height:900}}));
    this.context=context;this.headed=headed;
    context.on('close',()=>{if(this.context===context){this.context=undefined;this.page=undefined;}});
    const page=context.pages()[0] || await context.newPage();this.page=page;
    page.on('dialog',dialog=>void dialog.dismiss());
    await page.goto(ERP_ORIGIN,{waitUntil:'domcontentloaded',timeout:30000});return page;
  }
  private async locked<T>(action:()=>Promise<T>) {
    if(this.busy)throw new ErpError('Estoy consultando OhlimpiaERP. Esperá a que termine.');
    this.busy=true;try{return await action();}finally{this.busy=false;}
  }
  async connect() {return this.locked(async()=>{
    const page=await this.session(true);
    await page.evaluate(()=>{
      document.title='Vincular Jarvis · OhlimpiaERP';
      if(!document.querySelector('#jarvis-link-banner')) {
        const banner=document.createElement('div');banner.id='jarvis-link-banner';banner.textContent='VINCULAR OHLIMPIA CON JARVIS · Iniciá sesión en esta ventana';
        banner.style.cssText='position:fixed;top:0;left:0;right:0;background:#07334c;color:#fff;padding:12px;z-index:999999;text-align:center;font:600 14px sans-serif;pointer-events:none';document.body.appendChild(banner);
      }
    });
    await page.bringToFront();
    return {message:'Iniciá sesión con tu usuario DEVELOPER en la ventana que dice «VINCULAR OHLIMPIA CON JARVIS». La sesión queda en esta PC.'};
  });}
  async status() {
    if(!this.context) {
      try {await fs.access(path.join(this.root,'data','ohlimpia-browser'));await this.session(false);}catch{return {connected:false,loginRequired:true};}
    }
    const page=this.page;
    if(!page || page.isClosed())return {connected:false,loginRequired:true};
    const connected=await this.authenticated(page);
    const profile=await page.locator('#sidebar-rol').textContent().catch(()=>null);
    return {connected,loginRequired:!connected,profile};
  }
  private async authenticated(page:Page) {
    if(new URL(page.url()).origin!==ERP_ORIGIN)return false;
    return page.evaluate(()=>!!document.querySelector('#app:not(.hidden)') && /DEVELOPER/i.test(document.querySelector('#sidebar-rol')?.textContent || ''));
  }
  private async ready() {
    let page=await this.session(this.context?this.headed:false);
    await page.waitForFunction(()=>!!document.querySelector('#app:not(.hidden)') && /DEVELOPER/i.test(document.querySelector('#sidebar-rol')?.textContent || ''),{},{timeout:30000}).catch(()=>{});
    if(!await this.authenticated(page))throw new ErpError('Conectá OhlimpiaERP e iniciá sesión con tu perfil DEVELOPER en la ventana de vinculación.');
    if(this.headed) {
      // Once the user signs in, future commands run in the background.
      page=await this.session(false);
      await page.waitForFunction(()=>!!document.querySelector('#app:not(.hidden)') && /DEVELOPER/i.test(document.querySelector('#sidebar-rol')?.textContent || ''),{},{timeout:30000});
    }
    await page.evaluate(()=>{const nav=(window as unknown as {navTo?:(key:string)=>void}).navTo;if(!nav)throw new Error('La navegación del ERP cambió.');nav('dev_tickets');});
    await page.locator('#tbody-dev-tickets').waitFor({state:'visible',timeout:10000});
    return page;
  }
  private async rows(page:Page):Promise<ErpTicket[]> {
    return page.locator('#tbody-dev-tickets tr[onclick]').evaluateAll(rows=>rows.map(row=>{
      const cells=Array.from(row.querySelectorAll('td')).map(cell=>(cell.textContent || '').trim());
      const id=row.getAttribute('onclick')?.match(/abrirTicketPorId\(['"]([^'"]+)['"]\)/)?.[1] || '';
      return {id,number:cells[0] || '',title:cells[2] || '',module:cells[3] || '',priority:(cells[6] || '').replace(/[🔴🟡🔵]/gu,'').trim(),state:cells[7] || ''};
    }).filter(row=>/^[a-zA-Z0-9_-]{1,80}$/.test(row.id)));
  }
  async list() {return this.locked(async()=>{
    const page=await this.ready();
    for(const selector of ['#dev-filtro-estado','#dev-filtro-tipo','#dev-filtro-prioridad'])await page.locator(selector).selectOption('');
    return this.rows(page);
  });}
  async download(selector:string) {return this.locked(async()=>{
    const project=this.config.projects.find(project=>project.id==='ohlimpiaerp');if(!project)throw new ErpError('Proyecto no configurado.');
    const page=await this.ready();
    for(const filter of ['#dev-filtro-estado','#dev-filtro-tipo','#dev-filtro-prioridad'])await page.locator(filter).selectOption('');
    const selected=selectErpTicket(await this.rows(page),selector);
    if(!selected)throw new ErpError('No hay tickets pendientes.');
    await page.evaluate(id=>(window as unknown as {abrirTicketPorId:(id:string)=>void}).abrirTicketPorId(id),selected.id);
    await page.locator('#modal-dev-ticket').waitFor({state:'visible',timeout:10000});
    const title=await page.locator('#dt-titulo').innerText(),description=await page.locator('#dt-descripcion').innerText();
    const folder='jarvis-tickets/'+selected.id+'-'+randomUUID().slice(0,8);
    const directory=await ticketPath(project.root,folder,true);await fs.mkdir(directory,{recursive:true});
    const specification=`# ${title}\n\nID del ERP: ${selected.id}\nNúmero visible: ${selected.number}\nMódulo: ${selected.module}\nEstado al consultar: ${selected.state}\nOrigen: ${ERP_ORIGIN}\nConsultado: ${new Date().toISOString()}\n\n## Descripción\n${description}\n`;
    if(secretText.test(specification))throw new ErpError('El ticket contiene un patrón de credencial.');
    await fs.writeFile(path.join(directory,'ticket.md'),specification);
    const buttons=page.locator('#dt-adjuntos button[title="Descargar"]');
    const count=await buttons.count();if(count>10)throw new ErpError('El ticket supera los diez adjuntos permitidos.');
    const referencePaths:string[]=[],skipped:string[]=[];
    for(let index=0;index<count;index++) {
      const name=await buttons.nth(index).locator('..').locator('span').innerText();
      if(!/\.(md|html?)$/i.test(name.trim())){skipped.push(name);continue;}
      const pending=page.waitForEvent('download',{timeout:20000});await buttons.nth(index).click();const download=await pending;
      const file=await download.path();if(!file)throw new ErpError('No pude descargar el adjunto.');
      const stat=await fs.stat(file);if(stat.size>512000)throw new ErpError('Un adjunto supera los 512 KB.');
      const text=await fs.readFile(file,'utf8');if(text.includes('\0') || secretText.test(text))throw new ErpError('Adjunto binario o con credenciales.');
      const safe=download.suggestedFilename().replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100);
      if(!/\.(md|html?)$/i.test(safe))throw new ErpError('La descarga no corresponde al tipo de adjunto esperado.');
      const relative=folder+'/'+index+'-'+safe;await fs.writeFile(await ticketPath(project.root,relative,true),text);referencePaths.push(relative);
    }
    return {ticket:selected,ticketPath:folder+'/ticket.md',referencePaths,skipped};
  });}
  async close(){await this.context?.close();}
}
