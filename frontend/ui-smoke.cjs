const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

// Interfaz compilada con API simulada: no usa claves ni envía tickets reales.
const dist = path.join(__dirname, 'dist');
const artifacts = path.join(__dirname, '..', 'artifacts');
let submitted;
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
      res.setHeader('Content-Type', 'text/event-stream');
      res.end('event: token\ndata: {"text":"Análisis de prueba completado."}\n\nevent: done\ndata: {}\n\n');
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
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('BACKEND CONECTADO', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ticket de prueba' }).click();
    await page.getByText('Historial de prueba.').waitFor();
    await page.getByRole('button', { name: 'Nueva misión' }).click();
    await page.getByText('¿Cuál es la misión?').waitFor();
    const textarea = page.getByRole('textbox', { name: 'Mensaje para Jarvis' });
    await page.getByRole('button', { name: 'Resolver un ticket' }).click();
    assert.match(await textarea.inputValue(), /OhlimpiaERP/);
    const upload = page.locator('input[type=file]');
    await upload.setInputFiles({ name: 'ticket.html', mimeType: 'text/html', buffer: Buffer.from('<h1>Error al guardar</h1><p>La factura falla.</p><script>window.ticketExecuted = true;</script>') });
    await page.waitForFunction(() => document.querySelector('textarea').value.includes('La factura falla.'));
    assert(!(await textarea.inputValue()).includes('window.ticketExecuted'));
    assert.equal(await page.evaluate(() => window.ticketExecuted), undefined);
    assert.equal(submitted, undefined, 'Importar no debe enviar automáticamente');
    await upload.setInputFiles({ name: 'ticket.md', mimeType: 'text/markdown', buffer: Buffer.from('# Ticket\nCorregir validación de factura.') });
    await page.waitForFunction(() => document.querySelector('textarea').value.includes('Corregir validación'));
    await textarea.press('Enter');
    await page.getByText('Análisis de prueba completado.', { exact: true }).waitFor();
    assert.match(submitted.message, /Corregir validación/);
    await upload.setInputFiles({ name: 'grande.md', mimeType: 'text/markdown', buffer: Buffer.alloc(66000, 'x') });
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /64 KB/);
    await upload.setInputFiles({ name: 'limpio.md', mimeType: 'text/markdown', buffer: Buffer.from('Ticket de prueba') });
    await page.waitForFunction(() => document.querySelector('textarea').value.includes('limpio.md'));
    await page.getByRole('button', { name: 'Nueva misión' }).click();
    await page.getByText('¿Cuál es la misión?').waitFor();
    assert.equal(await textarea.inputValue(), '');
    fs.mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, 'jarvis-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await textarea.isVisible());
    assert(await page.getByRole('button', { name: 'Importar ticket' }).isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Sin desborde horizontal en móvil');
    await page.screenshot({ path: path.join(artifacts, 'jarvis-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: historial, nueva misión, accesos, importación MD/HTML, envío, límites y vista móvil. API simulada.');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
