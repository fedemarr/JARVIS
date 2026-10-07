import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, publicFetch, publicUrl } from './publicFetch';
import { parseSearch, relevantResults } from './tools';
import { cloudTools } from '../cloud/tools';
import { CloudStore } from '../cloud/store';

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
