import { chromium, type Browser } from 'playwright';
import { publicFetch, publicUrl } from './publicFetch';
let activeReaders=0;

// Every network request goes through the same TLS + pinned public-DNS reader.
// Never route.continue()/route.fetch(): browser DNS could reach private networks.
export async function renderPage(input:string, options:{fetch?:typeof publicFetch;timeout?:number}={}) {
  const url=publicUrl(input).href;
  if(activeReaders>=2)throw new Error('Hay otras páginas cargándose. Volvé a intentar esta fuente en el siguiente paso.');
  activeReaders++;
  const fetchPage=options.fetch || publicFetch;
  let browser:Browser|undefined;
  let timer:NodeJS.Timeout|undefined;
  let finished=false;
  const deadline=Date.now()+(options.timeout || 25000);
  const run=async()=>{
    if(process.env.VERCEL){
      const serverChromium=(await import('@sparticuz/chromium')).default;
      serverChromium.setGraphicsMode=false;
      browser=await chromium.launch({args:serverChromium.args,executablePath:await serverChromium.executablePath(),timeout:15000});
    } else browser=await chromium.launch({headless:true,timeout:15000,args:['--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
    if(finished || Date.now()>=deadline){await browser.close();throw new Error('La carga del navegador superó el tiempo disponible.');}
    const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false,locale:'es-AR',viewport:{width:1280,height:900}});
    await context.routeWebSocket('**/*',socket=>socket.close());
    let requests=0,bytes=0,blocked=0,inFlight=0;
    await context.route('**/*',async route=>{
      const request=route.request();
      inFlight++;
      try {
        if(finished || Date.now()>=deadline || ++requests>70 || inFlight>12 || bytes>6000000 || request.method()!=='GET'
          || !['document','script','stylesheet','xhr','fetch'].includes(request.resourceType())) throw new Error('Recurso omitido');
        const target=publicUrl(request.url()).href;
        const result=await fetchPage(target,1500000);
        bytes+=Buffer.byteLength(result.body);
        if(result.truncated || bytes>6000000)throw new Error('Recurso demasiado grande');
        await route.fulfill({status:200,contentType:result.contentType,body:result.body,headers:{'access-control-allow-origin':'*'}});
      } catch {blocked++;await route.abort().catch(()=>{});}
      finally {inFlight--;}
    });
    const page=await context.newPage();
    context.on('page',popup=>{if(popup!==page)void popup.close();});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:Math.max(1,deadline-Date.now())});
    // Wait for a stable DOM, including delayed fetch/render; avoid analytics networkidle.
    let previous='',stable=0;
    for(let i=0;i<18 && Date.now()<deadline-1000;i++){
      await page.waitForTimeout(400);
      const text=await page.locator('body').innerText({timeout:1000}).catch(()=>'');
      stable=text===previous?stable+1:0;previous=text;
      if(i>=4 && text.length>150 && stable>=3)break;
      if(i===8)await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    }
    publicUrl(page.url());
    return {url:page.url(),body:await page.content(),contentType:'text/html',truncated:false,blockedResources:blocked};
  };
  try {
    return await Promise.race([run(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('La lectura con JavaScript superó el tiempo disponible.')),Math.max(1,deadline-Date.now()));})]);
  } finally {finished=true;if(timer)clearTimeout(timer);await browser?.close().catch(()=>{});activeReaders--;}
}
