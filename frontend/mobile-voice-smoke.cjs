const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium,devices}=require('playwright');
const dist=path.resolve('frontend/dist');let chats=0;
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/session')return res.end('{"authenticationRequired":false}');
  if(req.url==='/api/conversations')return res.end('[]');
  if(req.url==='/api/health')return res.end('{"provider":"Claude","model":"test"}');
  if(req.url==='/api/chat'){chats++;res.setHeader('Content-Type','text/event-stream');return setTimeout(()=>res.end('event: token\ndata: {"text":"Esta es la respuesta hablada completa número '+chats+'."}\n\nevent: done\ndata: {}\n\n'),80);}
  return res.end('{}');
 }
 const name=req.url.split('?')[0],file=path.resolve(dist,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  for(const device of ['Pixel 7','iPhone 13']){
   const context=await browser.newContext({...devices[device],reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    const state=window.voiceTest={owner:null,starts:0,conflicts:0,spoken:[],unlocked:false,failSound:false,missingEnd:false,neverStart:false,failPermission:false};
    window.webkitSpeechRecognition=class{
     start(){if(state.owner){state.conflicts++;throw new DOMException('Microphone already running','InvalidStateError');}state.owner=this;state.starts++;if(state.failPermission){setTimeout(()=>{this.onerror?.({error:'not-allowed'});this.abort();},10);}}
     stop(){this.abort();}
     abort(){const instance=this;setTimeout(()=>{if(state.owner===instance)state.owner=null;instance.onend?.();},80);}
    };
    window.feedVoice=text=>{const instance=state.owner;if(!instance)throw new Error('No microphone');instance.onresult?.({resultIndex:0,results:[{isFinal:true,0:{transcript:text}}]});};
    Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],addEventListener(){},removeEventListener(){},cancel(){},resume(){},speak(utterance){
     if(navigator.userActivation.isActive)state.unlocked=true;
     if(!utterance.text.trim())return;
     if(!state.unlocked||state.failSound){setTimeout(()=>utterance.onerror?.({error:'not-allowed'}),10);return;}
     if(state.owner){state.conflicts++;setTimeout(()=>utterance.onerror?.({error:'audio-busy'}),10);return;}
     if(state.neverStart)return;
     state.spoken.push(utterance.text);setTimeout(()=>utterance.onstart?.(),5);if(!state.missingEnd)setTimeout(()=>utterance.onend?.(),45);
    }}});
   });
   await page.goto('http://127.0.0.1:'+server.address().port);
   const enable=page.getByRole('button',{name:'Activar manos libres',exact:true});await enable.click();
   for(let turn=1;turn<=4;turn++){
    await page.waitForFunction(()=>!!window.voiceTest.owner,{},{timeout:6000});
    await page.evaluate(turn=>window.feedVoice(turn===1?'Jarvis, ayudame a estudiar':'Seguimos con el siguiente tema '+turn),turn);
    await page.waitForFunction(turn=>window.voiceTest.spoken.filter(text=>text.includes('respuesta hablada completa')).length>=turn,turn,{timeout:6000});
   }
   await page.waitForFunction(()=>!!window.voiceTest.owner);
   let state=await page.evaluate(()=>({starts:voiceTest.starts,conflicts:voiceTest.conflicts,spoken:voiceTest.spoken}));assert.equal(state.conflicts,0);assert(state.starts>=5);assert.equal(state.spoken.filter(text=>text.includes('respuesta hablada completa')).length,4);
   await page.getByRole('button',{name:'Desactivar manos libres',exact:true}).click();await page.waitForFunction(()=>!window.voiceTest.owner);
   await page.evaluate(()=>window.voiceTest.failSound=true);await page.getByRole('button',{name:'Probar voz',exact:true}).click();await page.getByRole('alert').filter({hasText:'No pude reproducir la voz'}).waitFor();assert(await enable.isVisible());
   await page.evaluate(()=>{window.voiceTest.failSound=false;});await page.getByRole('button',{name:'Probar voz',exact:true}).click();await page.waitForFunction(()=>window.voiceTest.spoken.some(text=>text.includes('Esta es mi voz')));
   await page.waitForTimeout(100);await enable.click();await page.waitForFunction(()=>!!window.voiceTest.owner);await page.getByRole('button',{name:'Desactivar manos libres',exact:true}).click();await page.waitForFunction(()=>!window.voiceTest.owner);
   if(device==='Pixel 7'){
    await page.evaluate(()=>window.voiceTest.failPermission=true);await enable.click();await page.getByRole('alert').filter({hasText:'El navegador bloqueó el micrófono'}).waitFor({timeout:6000});assert(await enable.isVisible());
    await page.evaluate(()=>{window.voiceTest.failPermission=false;window.voiceTest.neverStart=true;});await page.getByRole('button',{name:'Probar voz',exact:true}).click();await page.getByRole('alert').filter({hasText:'No pude reproducir la voz'}).waitFor({timeout:12000});assert(await enable.isVisible());
   }
   assert.deepEqual(errors,[]);await context.close();console.log('PASS '+device+': cuatro turnos de voz, reescucha automática, cierre nativo demorado sin micrófonos simultáneos, activación de sonido y recuperación del bloqueo. Motores simulados.');
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1});
