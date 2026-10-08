const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');const {chromium}=require('playwright');
const dist=path.resolve('frontend/dist');
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url.startsWith('/api/')) {
  if(req.url.includes('bridge-session')||req.url.includes('ticket-session'))return res.end(JSON.stringify({token:'test-only',expiresIn:600}));
  if(req.url==='/api/health')return res.end(JSON.stringify({provider:'Claude',model:'Haiku'}));
  if(req.url==='/api/conversations')return res.end('[]');
  return res.end('{}');
 }
 const name=req.url.split('?')[0],file=path.resolve(dist,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const origin='http://127.0.0.1:'+server.address().port;await context.grantPermissions(['local-network-access'],{origin});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.webkitSpeechRecognition=class{start(){}stop(){this.onend?.()}abort(){this.onend?.()}};Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],addEventListener(){},removeEventListener(){},cancel(){},speak(u){queueMicrotask(()=>u.onend?.())}}});});
  const erp=[{id:'465709685',number:'#131',title:'Dotacion',state:'Abierto',priority:'media'},{id:'468058393',number:'#132',title:'Supervisores',state:'Abierto',priority:'media'}];
  let jobs=[{id:'11111111-1111-4111-8111-111111111111',status:'ready',message:'Cambios preparados en tu proyecto original.',files:['src/dotacion.js'],diff:'Cambios de prueba',summary:'Implementación preparada para revisar.',checks:[{name:'Pruebas del proyecto',status:'passed',output:'316 pruebas aprobadas.'}]},...Array.from({length:5},(_,i)=>({id:'old-'+i,status:'failed',message:'Ejecución anterior sin cambios.'}))];let submitted;let chats=0;
  await page.route('**/api/chat',r=>{chats++;return r.fulfill({status:500,json:{message:'No debe enviarse al chat'}})});
  await page.route('http://127.0.0.1:3002/api/bridge/**',route=>{
   const url=new URL(route.request().url());let value;
   if(url.pathname==='/api/bridge/desktop/status')value={projects:[{id:'ohlimpiaerp',name:'OhlimpiaERP'},{id:'jarvis',name:'Jarvis'}],voice:{available:true,state:'ready'}};
   else if(url.pathname==='/api/bridge/desktop/files')value=[{name:'src',path:'src',directory:true},{name:'README.md',path:'README.md',directory:false}];
   else if(url.pathname==='/api/bridge/desktop/read')value={text:'Documentación del proyecto.',observedAt:'2026-10-08'};
   else if(url.pathname==='/api/bridge/tickets/status')value={available:true};
   else if(url.pathname==='/api/bridge/tickets/erp/list')value=erp;
   else if(url.pathname==='/api/bridge/tickets/erp/run'){submitted=route.request().postDataJSON();value={id:'22222222-2222-4222-8222-222222222222',status:'ready',message:'Ticket de prueba preparado.'};jobs=[value,...jobs];}
   else if(url.pathname==='/api/bridge/tickets')value=jobs;
   else return route.fulfill({status:503,json:{message:'Prueba sin motor de voz real'}});
   return route.fulfill({json:value,headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await page.goto(origin);await page.waitForFunction(()=>document.querySelector('.ticket-agent')?.textContent.includes('Claude Code conectado'),{},{timeout:15000}).catch(async e=>{console.log(await page.locator('.desktop-panel').textContent());throw e});
  const nav=page.getByRole('navigation',{name:'Sectores de Jarvis'}),chat=page.getByRole('textbox',{name:'Mensaje para Jarvis'});
  const sector=name=>nav.getByRole('button',{name:new RegExp('^'+name)});
  assert(await chat.isVisible());assert(!(await page.locator('.ticket-agent').isVisible()));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false);
  const composer=await page.locator('.command-composer').boundingBox();assert(composer.y+composer.height<=1000);
  await page.screenshot({path:'artifacts/workspace-communication.png'});
  await sector('Tickets').click();assert(await page.locator('.erp-inbox').isVisible());assert(!(await chat.isVisible()));assert.equal(await page.locator('.ticket-job').count(),1);
  await page.screenshot({path:'artifacts/workspace-tickets.png'});
  await page.getByRole('button',{name:'Ver historial · 6',exact:true}).click();assert.equal(await page.locator('.ticket-job').count(),6);assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false);
  await page.locator('.local-view').evaluate(el=>el.scrollTop=el.scrollHeight);
  await sector('Computadora').click();assert(await page.getByRole('heading',{name:'Archivos y proyectos'}).isVisible());assert(!(await page.locator('.ticket-agent').isVisible()));await page.screenshot({path:'artifacts/workspace-computer.png'});
  await page.getByRole('button',{name:'↗ README.md',exact:true}).click();await chat.waitFor();assert((await chat.inputValue()).includes('Documentación del proyecto.'));
  await chat.fill('dotacion de los tickets q estan abiertos');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ticket-agent')?.textContent.includes('Ticket iniciado'));assert.equal(submitted.selector,'465709685');assert.equal(chats,0);
  await page.setViewportSize({width:390,height:844});
  for(const name of ['Comunicación','Tickets','Computadora']){await sector(name).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);await page.screenshot({path:'artifacts/workspace-mobile-'+name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()+'.png'});}
  assert.deepEqual(errors,[]);console.log('PASS: tres sectores, historial colapsado, scroll independiente, archivos al chat, orden de ticket desde chat con panel oculto, escritorio y móvil. APIs y ejecución simuladas.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
