import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import type { Page } from 'playwright';
import { Tool } from './index';
import { getPage, screenshotDir, closeBrowser, setHeadful } from './browserSession';
import { projectRoot } from '../config';

const schema = z.object({
  action: z.enum(['status', 'send', 'logout'], {
    errorMap: () => ({ message: 'action debe ser status, send o logout.' }),
  }),
  contact: z.string().min(1, 'Falta el argumento contact.').optional(),
  message: z.string().min(1, 'Falta el argumento message.').optional(),
});

const WA_URL = 'https://web.whatsapp.com/';

// Selectores de la UI de WhatsApp Web (se estabilizaron bastante desde 2022).
const SEARCH_BOX = 'div[contenteditable="true"][data-tab="3"], [aria-label="Search input textbox"], [aria-label="Buscar input textbox"]';
const LOGGED_IN = 'div[aria-label="Chat list"], div[aria-label="Lista de chats"], header[data-testid="chatlist-header"]';

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(LOGGED_IN, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function openWhatsApp(page: Page): Promise<Page> {
  const target = await getPage();
  if (target.url() !== WA_URL) {
    await target.goto(WA_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  await target.waitForTimeout(2500);
  return target;
}

async function ensureLogin(): Promise<Page | string> {
  // Devuelve una página logueada o un mensaje de error instructivo.
  let p = await getPage();
  if (p.url() !== WA_URL) {
    await p.goto(WA_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  await p.waitForTimeout(2500);
  if (await isLoggedIn(p)) return p;

  // No logueado: abrir ventana visible con el QR vivo para escanear directo.
  setHeadful();
  p = await openWhatsApp(p);
  await p.waitForTimeout(4000);
  if (await isLoggedIn(p)) return p;
  return 'No hay sesión de WhatsApp iniciada. Se abrió una ventana de Chrome con el QR en pantalla: escanealo con el celular (WhatsApp → Dispositivos vinculados) y volvé a intentar.';
}

export const whatsapp: Tool<typeof schema> = {
  name: 'whatsapp',
  description:
    'Opera WhatsApp Web con sesión persistente. Actions: status abre WhatsApp Web y verifica si la sesión está iniciada (si no, abre una ventana de Chrome con el QR vivo para escanear); send {contact, message} busca el contacto por nombre y envía el mensaje (dangerous); logout cierra la sesión de WhatsApp.',
  schema,
  dangerous: true,
  dangerReason: (args) => {
    const action = String(args?.action ?? '');
    if (action === 'send') return 'whatsapp/send envía un mensaje real por WhatsApp al contacto indicado.';
    if (action === 'logout') return 'whatsapp/logout cierra la sesión de WhatsApp y hay que volver a escanear el QR.';
    return null;
  },
  handler: async (args) => {
    try {
      if (args.action === 'logout') {
        await closeBrowser();
        const profile = path.join(projectRoot(), 'data', 'browser', 'profile');
        fs.rmSync(profile, { recursive: true, force: true });
        return 'Sesión de WhatsApp cerrada. La próxima vez habrá que escanear el QR de nuevo.';
      }

      if (args.action === 'status') {
        const logged = await ensureLogin();
        if (typeof logged === 'string') return logged;
        return 'WhatsApp está logueado. Podés usar action send para enviar mensajes.';
      }

      // action === 'send'
      const contact = args.contact ?? '';
      const message = args.message ?? '';
      if (!contact || !message) return 'Faltan contact y message para send.';

      const logged = await ensureLogin();
      if (typeof logged === 'string') return logged;
      const page = logged;

      // Buscar contacto en el buscador de chats.
      const search = page.locator(SEARCH_BOX).first();
      await search.click({ timeout: 10000 });
      await search.fill(contact);
      await page.waitForTimeout(1500);

      // Click en el resultado que coincida con el nombre.
      const result = page.locator(`span[title="${contact}"]`).first();
      const count = await result.count();
      if (count === 0) {
        return `No encontré un chat con el nombre "${contact}". Puede que el contacto se llame distinto o que el número no esté en WhatsApp.`;
      }
      await result.click({ timeout: 10000 });
      await page.waitForTimeout(800);

      // Escribir el mensaje en el box de texto y enviarlo (Enter).
      const msgBox = page.locator('div[contenteditable="true"][data-tab="10"], [aria-label="Type a message"], [aria-label="Escribí un mensaje"], footer div[contenteditable="true"]').first();
      const msgCount = await msgBox.count();
      if (msgCount === 0) return 'No encontré el campo de mensaje. El chat se abrió pero la UI no respondió.';
      await msgBox.click({ timeout: 10000 });
      await msgBox.fill(message);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);

      return `Mensaje enviado a "${contact}": "${message}"`;
    } catch (err: any) {
      return `Error de WhatsApp: ${err?.message || String(err)}`;
    }
  },
};
