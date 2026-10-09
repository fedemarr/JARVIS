import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, publicFetch, publicUrl } from './publicFetch';
import { parseSearch, relevantResults, readSearchSources } from './tools';
import { cloudTools } from '../cloud/tools';
import { CloudStore } from '../cloud/store';
import { renderPage } from './renderPage';
import { pageText } from './pageText';
import { webSourceLinks } from './sourceLinks';

test('internet: bloquear protocolos, puertos, credenciales e IPs privadas/reservadas',async()=>{
  for(const address of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','0.0.0.0','100.64.0.1','224.0.0.1','::1','::','fe80::1','fc00::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(publicAddress(address),false,address);
  for(const address of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])assert.equal(publicAddress(address),true,address);
  for(const url of ['file:///etc/passwd','http://example.com','https://127.1','https://2130706433','https://localhost','https://foo.local','https://example.com:8443','https://user:pass@example.com','https://[::ffff:127.0.0.1]/'])assert.throws(()=>publicUrl(url));
  assert.equal(publicUrl('https://example.com/page#fragment').href,'https://example.com/page');
  await assert.rejects(publicFetch('https://127.0.0.1/'));
});

test('resultados: enlaces reales, extracción acotada y descarte de destinos privados',()=>{
  const html='<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">Documentación</a><div class="result__snippet">Referencia &amp; ejemplos</div></div><div class="result"><a class="result__a" href="https://127.0.0.1/private">Privado</a></div>';
  assert.deepEqual(parseSearch(html,'duckduckgo'),[{title:'Documentación',url:'https://example.com/docs',snippet:'Referencia & ejemplos'}]);
  const xml='<rss><channel><item><title>Fuente</title><link>https://example.org/article</link><description>Descripción</description></item></channel></rss>';
  assert.deepEqual(parseSearch(xml,'bing'),[{title:'Fuente',url:'https://example.org/article',snippet:'Descripción'}]);
  assert.equal(relevantResults('TypeScript documentation', [{title:'Firebase',url:'https://firebase.google.com/',snippet:'Mobile apps'}]).length,0);
  assert.equal(relevantResults('precio dólar hoy', [{title:'Cotización del dólar',url:'https://example.org/',snippet:'Cotización actual'}]).length,1);
});

test('la nube expone internet sin habilitar herramientas de PC',async()=>{
  const registry=cloudTools({} as CloudStore);
  for(const name of ['web_search','read_web_page','get_weather'])assert(registry.get(name));
  assert(!registry.get('browser'));assert(!registry.get('execute_command'));
  assert.equal((await registry.run('web_search',{query:'x'.repeat(301)})).ok,false);
  assert.equal((await registry.run('read_web_page',{url:'https://169.254.169.254/'})).ok,false);
});

test('Google: extraer enlaces directos y redirigidos sin incluir destinos privados',()=>{
  const html='<a href="/url?q=https%3A%2F%2Fexample.org%2Fguide"><h3>Guía pública</h3></a><a href="https://example.com/docs"><h3>Documentación</h3></a><a href="https://127.0.0.1/"><h3>Privado</h3></a>';
  assert.deepEqual(parseSearch(html,'google').map(r=>r.url),['https://example.org/guide','https://example.com/docs']);
});

test('lector: reconocer una app JavaScript, un captcha y conservar texto y enlaces de una fuente',()=>{
  assert(pageText('<body><div id="root">Loading</div><script src="/bundle.js"></script></body>','https://example.com').needsJavaScript);
  assert(pageText('<title>Just a moment</title><body>Verify you are human</body>','https://example.com').blocked);
  const content=pageText('<main><h1>Informe</h1><p>Información importante</p><a href="/detalle">Más detalles</a><a href="http://127.0.0.1/">No seguir</a></main>','https://example.com');
  assert(content.text.includes('Información importante'));
  assert.deepEqual(content.links,[{title:'Más detalles',url:'https://example.com/detalle'}]);
  assert(pageText('<body><main><h1>Posiciones</h1><table><tbody></tbody></table></main><script src="/table.js"></script></body>','https://example.com').needsJavaScript);
  assert.equal(pageText('<head><meta property="article:published_time" content="2026-10-09"></head><body>Noticia</body>','https://example.com').publishedAt,'2026-10-09');
});

test('búsqueda: priorizar la entidad y entregar fuentes leídas aunque un resultado haya desaparecido',async()=>{
  const results=[{title:'Resultados de rugby',url:'https://example.com/generic',snippet:'Tabla de posiciones argentina 2026'},{title:'Los Cedros: último partido',url:'https://example.org/cedros',snippet:'Noticias de rugby'}];
  assert.equal(relevantResults('Los Cedros rugby noticias 2026',results)[0].title,'Los Cedros: último partido');
  const sourceResults=[{title:'Resultado viejo',url:'https://example.com/deleted',snippet:'Los Cedros'},{title:'Noticia actual',url:'https://example.org/current',snippet:'Los Cedros'}, {title:'Tabla',url:'https://example.net/table',snippet:'Los Cedros'}];
  const calls:string[]=[];
  const sources=await readSearchSources(sourceResults,'Los Cedros rugby',async url=>{
    calls.push(url);if(url.endsWith('/deleted'))throw new Error('HTTP 404');
    return JSON.stringify({url,title:'Fuente comprobada',text:'Texto preliminar. '.repeat(200)+'Los Cedros ganó su partido. '.repeat(8),publishedAt:'2026-10-09',retrievedAt:'2026-10-09T12:00:00Z',method:'html'});
  });
  assert.equal(sources.filter(source=>source.status==='read').length,2);
  assert.equal(sources[0].status,'unavailable');
  assert(sources.some(source=>String(source.text).includes('Los Cedros ganó su partido.')));
  assert.equal(sources[1].publishedAt,'2026-10-09');
  assert(calls.includes('https://example.net/table'));
});

test('respuesta: citar páginas leídas, sin convertir snippets o fallos en fuentes comprobadas',()=>{
  const sources=[{status:'unavailable',url:'https://example.com/deleted'},{status:'read',url:'https://example.org/report',title:'Informe deportivo',text:'Resultado comprobado'}];
  const messages=[{role:'tool' as const,results:[{id:'search',name:'web_search',ok:true,content:JSON.stringify({sources,results:[{url:'https://example.net/snippet'}]})}]}];
  assert.match(webSourceLinks(messages,'Resumen'),/\[Informe deportivo\]\(https:\/\/example.org\/report\)/);
  assert(!webSourceLinks(messages,'Resumen').includes('deleted'));
  assert(!webSourceLinks(messages,'Resumen').includes('snippet'));
  assert.equal(webSourceLinks(messages,'Ver https://example.org/report'),'');
  assert.equal(webSourceLinks([{role:'tool',results:[{id:'search',name:'web_search',ok:true,content:JSON.stringify({results:[{url:'https://example.org/snippet'}]})}]}],'Resumen'),'');
});

test('navegador: ejecutar JavaScript y fetch público, bloquear recursos privados y escrituras',async()=>{
  const fetched:string[]=[];
  const html=`<title>Fuente dinámica</title><main id="root">Cargando</main><script src="/app.js"></script>`;
  const js=`fetch('https://api.example.org/data').then(r=>r.json()).then(data=>{document.querySelector('main').textContent=data.text;});
    fetch('https://127.0.0.1/private').catch(()=>{});
    fetch('https://api.example.org/write',{method:'POST',body:'test'}).catch(()=>{});`;
  const render=await renderPage('https://example.org/',{fetch:async url=>{
    fetched.push(url);
    return {url,body:url.endsWith('/app.js')?js:url.endsWith('/data')?JSON.stringify({text:'Este informe fue cargado con JavaScript y una API pública. '.repeat(10)}):html,contentType:url.endsWith('/app.js')?'application/javascript':url.endsWith('/data')?'application/json':'text/html',truncated:false};
  }});
  const content=pageText(render.body,render.url);
  assert(content.text.includes('Este informe fue cargado con JavaScript'));
  assert(fetched.includes('https://api.example.org/data'));
  assert(!fetched.some(url=>url.includes('127.0.0.1')||url.endsWith('/write')));
  assert(render.blockedResources>=2);
});
