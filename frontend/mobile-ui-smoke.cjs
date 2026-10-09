const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium,devices}=require('playwright');
const dist=path.resolve('frontend/dist');let apiCalls=0;
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/api/')){
  apiCalls++;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  if(req.url==='/api/session')return res.end(JSON.stringify({authenticationRequired:true,authenticated:req.method==='POST'}));
  if(req.url==='/api/health')return res.end(JSON.stringify({provider:'Claude',model:'test'}));
  if(req.url==='/api/conversations')return res.end(JSON.stringify([{id:'mobile-test',title:'Plan de estudio'}]));
  if(req.url==='/api/conversations/mobile-test')return res.end(JSON.stringify({messages:[{role:'user',text:'Estudiar'}]}));
  if(req.url==='/api/chat'){res.setHeader('Content-Type','text/event-stream');return res.end('event: token\ndata: {"text":"Respuesta de prueba móvil."}\n\nevent: done\ndata: {}\n\n');}
  return res.end('{}');
 }
 const name=req.url.split('?')[0],file=path.resolve(dist,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  for(const device of ['Pixel 7','iPhone 13']){
   const context=await browser.newContext({...devices[device],reducedMotion:'reduce'}),page=await context.newPage(),errors=[],localRequests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().startsWith('http://127.0.0.1:3002'))localRequests.push(r.url());});
   await page.addInitScript(()=>{window.webkitSpeechRecognition=class{start(){}stop(){this.onend?.()}abort(){this.onend?.()}};Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],addEventListener(){},removeEventListener(){},cancel(){},speak(u){queueMicrotask(()=>u.onend?.())}}});});
   await page.goto(origin);await page.getByLabel('Clave de acceso').fill('test-only');await page.getByRole('button',{name:'Entrar a Jarvis',exact:true}).click();
   const chat=page.getByRole('textbox',{name:'Mensaje para Jarvis'});await chat.waitFor();
   await page.getByRole('button',{name:'Instalar Jarvis',exact:true}).click();await page.getByRole('dialog').waitFor();assert((await page.getByRole('dialog').innerText()).includes('Agregar a pantalla de inicio'));
   await page.getByRole('button',{name:'Cerrar ventana',exact:true}).click();
   await page.getByRole('button',{name:'Conversaciones',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Plan de estudio',exact:true}).waitFor();await page.getByRole('button',{name:'Cerrar ventana',exact:true}).click();
   await chat.fill('Hola desde el celular');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.getByText('Respuesta de prueba móvil.',{exact:true}).waitFor();
   for(const height of [844,500]){
    await page.setViewportSize({width:390,height});await chat.focus();await page.waitForTimeout(150);
    const composer=await page.locator('.command-composer').boundingBox();assert(composer.y>=0&&composer.y+composer.height<=height,'El compositor sigue visible con teclado');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Tickets',exact:true}).click();await page.getByRole('heading',{name:'Tickets desde el celular',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Conectar esta PC',exact:true}).count(),0);
   await page.getByRole('button',{name:'Computadora',exact:true}).click();await page.getByRole('heading',{name:'Tu PC desde el celular',exact:true}).waitFor();
   await page.getByRole('button',{name:'Comunicación',exact:true}).click();await page.screenshot({path:'artifacts/mobile-'+device.replace(/ /g,'-')+'.png'});
   assert.deepEqual(localRequests,[]);assert.deepEqual(errors,[]);
   await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   const cached=await page.evaluate(async()=>{const keys=await caches.keys();return (await Promise.all(keys.map(async key=>(await (await caches.open(key)).keys()).map(request=>new URL(request.url).pathname)))).flat();});
   assert(cached.includes('/offline.html'));assert(cached.every(url=>!url.startsWith('/api/')&&url!=='/'));
   const manifest=await (await context.request.get(origin+'/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');assert.deepEqual(manifest.icons.map(icon=>icon.sizes),['192x192','512x512']);
   await context.setOffline(true);await page.goto(origin+'/?offline-test=1');await page.getByRole('heading',{name:'Sin conexión',exact:true}).waitFor();assert(!(await page.locator('body').innerText()).includes('Respuesta de prueba móvil.'));await context.setOffline(false);
   await context.close();console.log('PASS '+device+': instalación, historial, chat SSE, teclado, sectores, sin falsas conexiones a PC, service worker sin APIs privadas y pantalla offline. Voz simulada.');
  }
  assert(apiCalls>0);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
