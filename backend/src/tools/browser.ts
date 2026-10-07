import { z } from 'zod';
import path from 'path';
import { Tool } from './index';
import { getPage, pageText, screenshotDir, closeBrowser } from './browserSession';

const schema = z.object({
  action: z.enum(['open', 'extract', 'click', 'type', 'screenshot', 'close'], {
    errorMap: () => ({ message: 'action debe ser open, extract, click, type, screenshot o close.' }),
  }),
  url: z.string().url('url debe ser una URL válida (con http:// o https://).').optional(),
  selector: z.string().optional(),
  text: z.string().optional(),
  path: z.string().optional(),
});

function preview(text: string, max = 2500): string {
  return text.length > max ? text.slice(0, max) + `\n…(truncado, total ${text.length} caracteres)` : text;
}

export const browser: Tool<typeof schema> = {
  name: 'browser',
  description:
    'Controla un navegador Chromium (sesión persistente). Actions: open {url} abre una página y devuelve su contenido visible; extract {selector?} extrae texto visible de la página o de un selector CSS; click {selector} hace click en un elemento (dangerous); type {selector, text} escribe en un campo (dangerous); screenshot {path?} guarda una captura PNG en data/browser/ y devuelve la ruta; close cierra la sesión del navegador.',
  schema,
  dangerous: true,
  dangerReason: (args) => {
    const action = String(args?.action ?? '');
    if (action === 'click') return 'browser/click puede modificar estado en sitios externos (enviar formularios, borrar, etc.).';
    if (action === 'type') return 'browser/type escribe en sitios externos y puede enviar información.';
    return null;
  },
  handler: async (args) => {
    try {
      switch (args.action) {
        case 'open': {
          const url = args.url ?? '';
          const p = await getPage();
          await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await p.waitForTimeout(500);
          const title = await p.title();
          const body = await pageText();
          return `Título: ${title}\nURL: ${p.url()}\n\n${preview(body)}`;
        }
        case 'extract': {
          const p = await getPage();
          const sel = args.selector;
          if (sel) {
            const el = p.locator(sel).first();
            const count = await el.count();
            if (count === 0) return `No encontré ningún elemento con el selector "${sel}".`;
            const text = (await el.innerText()).trim().slice(0, 12000);
            return preview(text);
          }
          return preview(await pageText());
        }
        case 'click': {
          const p = await getPage();
          const sel = args.selector ?? '';
          if (!sel) return 'Falta el argumento selector para click.';
          const el = p.locator(sel).first();
          const count = await el.count();
          if (count === 0) return `No encontré ningún elemento con el selector "${sel}".`;
          await el.click({ timeout: 10000 });
          await p.waitForTimeout(500);
          const title = await p.title();
          return `Click hecho en "${sel}". Título actual: ${title}`;
        }
        case 'type': {
          const p = await getPage();
          const sel = args.selector ?? '';
          const text = args.text ?? '';
          if (!sel) return 'Falta el argumento selector para type.';
          const el = p.locator(sel).first();
          const count = await el.count();
          if (count === 0) return `No encontré ningún elemento con el selector "${sel}".`;
          await el.fill(text, { timeout: 10000 });
          return `Escribí ${text.length} caracteres en "${sel}".`;
        }
        case 'screenshot': {
          const p = await getPage();
          const file = args.path?.trim() || `browser-${Date.now()}.png`;
          const abs = path.isAbsolute(file) ? file : path.join(screenshotDir(), file);
          await p.screenshot({ path: abs });
          return `Captura guardada en: ${abs}`;
        }
        case 'close': {
          await closeBrowser();
          return 'Sesión del navegador cerrada.';
        }
      }
      return 'Acción no reconocida.';
    } catch (err: any) {
      return `Error de navegador: ${err?.message || String(err)}`;
    }
  },
};
