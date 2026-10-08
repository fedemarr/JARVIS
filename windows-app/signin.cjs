// Optional local bootstrap: no key in command arguments, source or browser storage.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const keyPath = path.join(root, 'data', 'jarvis-access-key.txt');
  if (!fs.existsSync(keyPath)) throw new Error('Ingresá desde la ventana de Jarvis: falta la clave local.');
  const context = await chromium.launchPersistentContext(path.join(root, 'data', 'jarvis-desktop-browser'), {
    channel: 'chrome', headless: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('https://jarvis-eta-blue.vercel.app/?desktop=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const entry = page.getByLabel('Clave de acceso');
    await Promise.race([entry.waitFor(), page.getByRole('textbox', { name: 'Mensaje para Jarvis' }).waitFor()]);
    if (await entry.isVisible()) {
      await entry.fill(fs.readFileSync(keyPath, 'utf8').trim());
      await page.getByRole('button', { name: 'Entrar a Jarvis', exact: true }).click();
    }
    await page.getByRole('textbox', { name: 'Mensaje para Jarvis' }).waitFor({ timeout: 30000 });
    console.log('Sesión de Jarvis preparada en el perfil privado de la aplicación.');
  } finally { await context.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
