const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

// Interfaz compilada con API simulada: no usa claves ni envía tickets reales.
const dist = path.join(__dirname, 'dist');
const artifacts = path.join(__dirname, '..', 'artifacts');
let submitted;
let requestCount = 0;
const replyParts = ['Análisis de prueba completado. Esta es la primera parte de una respuesta larga. ', 'La segunda parte también debe escucharse completa y sin interrupciones. ', 'Fin de la respuesta.'];
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/health') return res.end(JSON.stringify({ provider: 'modo prueba', model: 'API simulada' }));
  if (req.url === '/api/brief') return res.end('{}');
  if (req.url === '/api/conversations') return res.end(JSON.stringify([{ id: 'demo', title: 'Ticket de prueba' }]));
  if (req.url === '/api/conversations/demo') return res.end(JSON.stringify({ messages: [{ role: 'assistant', text: 'Historial de prueba.' }] }));
  if (req.url === '/api/chat') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      submitted = JSON.parse(body);
      requestCount++;
      res.setHeader('Content-Type', 'text/event-stream');
      res.end(replyParts.map(text => `event: token\ndata: ${JSON.stringify({text})}\n\n`).join('') + 'event: done\ndata: {}\n\n');
    });
    return;
  }
  const file = path.resolve(dist, '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) {
    res.statusCode = 404;
    return res.end('{}');
  }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

async function run() {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.spoken = [];
      window.recognitionStarts = 0;
      window.interruptionStarts = 0;
      window.webkitSpeechRecognition = class {
        start() {
          if(this.continuous){window.interruptionStarts++;window.lastInterruptionRecognition=this;}
          else {window.recognitionStarts++;window.lastRecognition=this;}
          this.active = true;
        }
        stop() { this.active = false; this.onend?.(); }
        abort() { this.active = false; this.onend?.(); }
      };
      window.say = (text) => {
        const recognition = window.lastRecognition;
        if (!recognition?.active) throw new Error('El micrófono no está activo');
        const result = [{ transcript: text }]; result.isFinal = true;
        recognition.onresult({ resultIndex: 0, results: [result] });
        recognition.active = false;
        recognition.onend();
      };
      Object.defineProperty(window, 'speechSynthesis', { value: {
        getVoices: () => [], addEventListener() {}, removeEventListener() {}, cancel() {},
        speak(utterance) { window.spoken.push(utterance.text); window.lastUtterance = utterance; },
      } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('EN LÍNEA', { exact: true }).waitFor();
    const coreBounds = await page.getByRole('region', { name: 'Estado del asistente' }).boundingBox();
    const chatBounds = await page.getByRole('region', { name: 'Conversación' }).boundingBox();
    assert(chatBounds.x >= coreBounds.x + coreBounds.width, 'Chat al costado del núcleo');
    const core = page.getByRole('button', { name: 'Saludar a Jarvis' });
    await core.focus();
    await core.press('Enter');
    await page.waitForFunction(() => window.spoken.length === 1);
    assert.deepEqual(await page.evaluate(() => window.spoken), ['Buenas, Federico. ¿En qué puedo ayudarte?']);
    assert(await page.locator('.reactor-speaking').isVisible());
    assert.equal(submitted, undefined, 'Saludar no consume la API');
    await core.click();
    await page.waitForFunction(() => window.spoken.length === 2);
    await page.evaluate(() => window.lastUtterance.onend());
    await page.locator('.reactor-idle').waitFor();
    await page.getByRole('button', { name: 'Ticket de prueba' }).click();
    await page.getByText('Historial de prueba.').waitFor();
    await page.getByRole('button', { name: 'Nueva misión' }).click();
    await page.getByText('¿Cuál es la misión?').waitFor();
    const textarea = page.getByRole('textbox', { name: 'Mensaje para Jarvis' });
    await page.getByRole('button', { name: 'Ir a tickets' }).click();
    assert(await page.getByRole('region', { name: 'Espacio de tickets' }).isVisible());
    assert(!(await textarea.isVisible()), 'El chat no comparte su sector con los tickets');
    const upload = page.locator('input[type=file]');
    await upload.setInputFiles({ name: 'ticket.html', mimeType: 'text/html', buffer: Buffer.from('<h1>Error al guardar</h1><p>La factura falla.</p><script>window.ticketExecuted = true;</script>') });
    await page.waitForFunction(() => document.querySelector('textarea').value.includes('La factura falla.'));
    assert(!(await textarea.inputValue()).includes('window.ticketExecuted'));
    assert.equal(await page.evaluate(() => window.ticketExecuted), undefined);
    assert.equal(submitted, undefined, 'Importar no debe enviar automáticamente');
    await upload.setInputFiles({ name: 'ticket.md', mimeType: 'text/markdown', buffer: Buffer.from('# Ticket\nCorregir validación de factura.') });
    await page.waitForFunction(() => document.querySelector('textarea').value.includes('Corregir validación'));
    await textarea.press('Enter');
    await page.getByText(replyParts.join(''), { exact: true }).waitFor();
    await page.waitForFunction(() => window.spoken.length === 3);
    await page.getByRole('button',{name:'Activar manos libres'}).click();
    await page.waitForFunction(()=>window.lastInterruptionRecognition?.active);
    assert.equal(await page.evaluate(()=>window.recognitionStarts),0,'Activar manos libres durante la lectura debe esperar sin cancelar la respuesta');
    for (let i = 0; i < replyParts.length; i++) {
      assert.equal((await page.evaluate(index => window.spoken[index + 2], i)).trim(), replyParts[i].trim());
      assert(await page.locator('.reactor-speaking').isVisible(), 'Animación durante toda la lectura');
      await page.evaluate(() => window.lastUtterance.onend());
      if (i < replyParts.length - 1) await page.waitForFunction(count => window.spoken.length === count, i + 4);
    }
    await page.locator('.reactor-idle').waitFor();
    await page.getByRole('button',{name:'Desactivar manos libres'}).click();
    assert.equal(await page.evaluate(()=>window.recognitionStarts),0,'No abrir el micrófono mientras está hablando');
    assert.equal(await page.evaluate(() => window.spoken.slice(2).map(text=>text.trim()).join(' ')), replyParts.join('').trim(), 'Leer toda la respuesta en orden');
    assert.match(submitted.message, /Corregir validación/);
    await page.getByRole('button', { name: /^Tickets/ }).click();
    await upload.setInputFiles({ name: 'grande.md', mimeType: 'text/markdown', buffer: Buffer.alloc(66000, 'x') });
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /64 KB/);
    await upload.setInputFiles({ name: 'limpio.md', mimeType: 'text/markdown', buffer: Buffer.from('Ticket de prueba') });
    await page.waitForFunction(() => document.querySelector('textarea').value.includes('limpio.md'));
    await page.getByRole('button', { name: 'Nueva misión' }).click();
    await page.getByText('¿Cuál es la misión?').waitFor();
    assert.equal(await textarea.inputValue(), '');
    await page.getByRole('button', { name: 'Activar manos libres' }).click();
    await page.waitForFunction(() => window.lastRecognition?.active);
    await page.evaluate(() => window.say('hola'));
    await page.waitForFunction(() => window.recognitionStarts === 2);
    assert.equal(requestCount, 1, 'Sin llamada al modelo antes de decir Jarvis');
    await page.evaluate(() => window.say('Jarvis'));
    await page.waitForFunction(() => window.spoken.length === 6);
    assert.equal(await page.evaluate(() => window.spoken[5]), 'Te escucho, Federico. ¿Qué necesitás?');
    assert.equal(await page.evaluate(() => window.lastRecognition.active), false, 'No escuchar su propia voz');
    await page.evaluate(() => window.lastUtterance.onend());
    await page.waitForFunction(() => window.recognitionStarts === 3);
    await page.getByRole('button', { name: /^Tickets/ }).click();
    await page.getByRole('button', { name: /^Computadora/ }).click();
    await page.getByRole('button', { name: /^Comunicación/ }).click();
    assert(await page.getByRole('button', { name: 'Desactivar manos libres' }).isVisible(), 'Cambiar de sector conserva la conversación por voz');
    await page.evaluate(() => window.say('ayudame a estudiar'));
    await page.getByText(replyParts.join(''), { exact: true }).waitFor();
    assert.equal(submitted.message, 'ayudame a estudiar');
    await page.waitForFunction(() => window.spoken.length === 7);
    for (let i = 0; i < replyParts.length; i++) {
      await page.evaluate(() => window.lastUtterance.onend());
      if (i < replyParts.length - 1) await page.waitForFunction(n => window.spoken.length === n, i + 8);
    }
    await page.waitForFunction(() => window.recognitionStarts === 4);
    await page.evaluate(() => window.say('dormí'));
    await page.waitForFunction(() => window.spoken.length === 10);
    await page.evaluate(() => window.lastUtterance.onend());
    await page.getByText('Decí «Jarvis» para llamarme', { exact: true }).waitFor();
    await page.waitForFunction(() => window.recognitionStarts === 5);
    await page.evaluate(() => window.say('Jarvis organiza mi día'));
    await page.waitForFunction(() => window.spoken.length === 11);
    assert.equal(submitted.message, 'organiza mi día');
    await page.getByRole('button', { name: 'Desactivar manos libres' }).click();
    for (let i = 0; i < replyParts.length; i++) {
      await page.evaluate(() => window.lastUtterance.onend());
      if (i < replyParts.length - 1) await page.waitForFunction(n => window.spoken.length === n, i + 12);
    }
    await page.getByRole('button', { name: 'Activar manos libres' }).waitFor();
    await page.getByRole('button', { name: 'Activar manos libres' }).click();
    await page.waitForFunction(() => window.recognitionStarts === 6);
    await page.evaluate(() => {
      const recognition = window.lastRecognition;
      recognition.onerror({ error: 'not-allowed' });
      recognition.onend?.();
    });
    await page.getByRole('alert').filter({ hasText: 'No pude usar el micrófono' }).waitFor();
    await page.getByRole('button', { name: 'Activar manos libres' }).waitFor();
    await page.getByRole('button', { name: 'Nueva misión' }).click();
    fs.mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, 'jarvis-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await textarea.isVisible());
    await page.getByRole('button', { name: /^Tickets/ }).click();
    assert(await page.getByRole('button', { name: 'Importar ticket' }).isVisible());
    await page.getByRole('button', { name: /^Computadora/ }).click();
    assert(await page.getByRole('region', { name: 'Espacio de computadora' }).isVisible());
    await page.getByRole('button', { name: /^Comunicación/ }).click();
    assert(await textarea.isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Sin desborde horizontal en móvil');
    await page.screenshot({ path: path.join(artifacts, 'jarvis-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: chat lateral, saludo, lectura completa, activación Jarvis, conversación manos libres sin eco, apagado, importación y móvil. API y micrófono simulados.');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
