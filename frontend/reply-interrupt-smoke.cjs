const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const {chromium}=require('playwright');
const dist=path.resolve('frontend/dist');let turns=0,closed=0;
const first='Esta es una explicación extensa que voy a leer por partes. La primera parte queda visible aunque interrumpas la respuesta. ';
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/api/chat'){
  turns++;req.resume();res.setHeader('Content-Type','text/event-stream');
  if(turns===4){res.write('event: token\ndata: '+JSON.stringify({text:first.repeat(4)})+'\n\n');res.end('event: done\ndata: {}\n\n');return;}
  res.write('event: token\ndata: '+JSON.stringify({text:first})+'\n\n');
  const timer=setTimeout(()=>{res.write('event: token\ndata: '+JSON.stringify({text:'ESTE TEXTO TARDÍO NO DEBE APARECER DESPUÉS DEL CORTE.'})+'\n\n');res.end('event: done\ndata: {}\n\n');},15000);
  res.once('close',()=>{clearTimeout(timer);closed++;});return;
 }
 if(req.url==='/api/health')return res.end(JSON.stringify({provider:'Prueba',model:'Simulado'}));
 if(req.url==='/api/conversations')return res.end('[]');
 if(req.url.startsWith('/api/'))return res.end('{}');
 const name=req.url.split('?')[0],file=path.resolve(dist,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.spoken=[];window.cancelCount=0;
   window.webkitSpeechRecognition=class{start(){this.active=true;if(this.continuous)window.interruptRecognition=this;else window.commandRecognition=this;}stop(){this.active=false;this.onend?.();}abort(){this.active=false;this.onend?.();}};
   window.sayStop=(text,final=true)=>{const r=window.interruptRecognition;if(!r?.active)throw new Error('No escucha interrupciones mientras responde');const result=[{transcript:text}];result.isFinal=final;r.onresult({resultIndex:0,results:[result]});};
   Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],addEventListener(){},removeEventListener(){},cancel(){window.cancelCount++;},speak(u){window.spoken.push(u.text);window.lastUtterance=u;}}});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('button',{name:'Activar manos libres'}).click();
  const chat=page.getByRole('textbox',{name:'Mensaje para Jarvis'});
  await chat.fill('Explicame un tema con mucho detalle');await page.getByRole('button',{name:'Enviar mensaje'}).click();
  await page.waitForFunction(()=>window.spoken.length>0&&window.interruptRecognition?.active);
  assert(await page.locator('.reactor-speaking').isVisible());
  await page.evaluate(()=>window.sayStop('Jarvis hacé el siguiente ticket'));
  assert.equal(turns,1,'La escucha durante la voz no acepta órdenes comunes ni genera eco al chat');
  assert(await page.getByRole('button',{name:'Detener respuesta'}).isVisible());
  const before=await page.evaluate(()=>window.cancelCount);
  await page.evaluate(()=>window.sayStop('Gracias, Jarvis',false));
  await page.getByText('Respuesta detenida. Decí «Jarvis» cuando me necesites.',{exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.reactor-speaking')&&!document.querySelector('.processing'));
  assert((await page.evaluate(()=>window.cancelCount))>before);assert.equal(turns,1,'La frase no consume otra llamada al modelo');
  assert(await page.getByText(first.trim(),{exact:true}).isVisible(),'El texto recibido se conserva');
  await page.evaluate(()=>window.lastUtterance.onend?.());
  assert.equal(await page.evaluate(()=>window.spoken.length),1,'Los callbacks tardíos no reanudan la voz');
  await page.waitForFunction(()=>window.commandRecognition?.active);
  assert.equal(closed,1,'Cancelar el chat cierra el stream hacia el servidor');
  await chat.fill('Otra pregunta');await page.getByRole('button',{name:'Enviar mensaje'}).click();await page.waitForFunction(()=>window.spoken.length===2&&window.interruptRecognition?.active);
  await page.evaluate(()=>window.sayStop('Jarvis, muchas gracias'));
  await page.waitForFunction(()=>!document.querySelector('.processing'));assert.equal(turns,2);
  await chat.fill('Tercera pregunta');await page.getByRole('button',{name:'Enviar mensaje'}).click();await page.waitForFunction(()=>window.spoken.length===3);
  await page.getByRole('button',{name:'Detener respuesta'}).click();await page.waitForFunction(()=>!document.querySelector('.processing'));
  assert.equal(turns,3);
  await chat.fill('Una respuesta completa para probar la cola de voz');await page.getByRole('button',{name:'Enviar mensaje'}).click();await page.waitForFunction(()=>window.spoken.length===4&&window.interruptRecognition?.active&&!document.querySelector('.processing'));
  await page.evaluate(()=>window.sayStop('Gracias, Yarvis'));
  await page.waitForFunction(()=>!document.querySelector('.reactor-speaking'));
  await page.evaluate(()=>window.lastUtterance.onend?.());assert.equal(await page.evaluate(()=>window.spoken.length),4,'Corta toda la cola aunque el modelo ya terminó');
  assert.equal(turns,4);assert.deepEqual(errors,[]);
  console.log('PASS: gracias Jarvis durante voz y generación, resultado parcial conservado, stream cerrado, sin otra llamada al modelo, sin reanudar voz tardía, conversación reutilizable y botón de corte. Micrófono y API simulados.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
