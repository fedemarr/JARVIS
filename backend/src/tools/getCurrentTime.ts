import { z } from 'zod';
import { Tool } from './index';

const schema = z.object({});

function formatInTz(): string {
  const tz = 'America/Argentina/Buenos_Aires';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: tz,
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(now);
  return `${parts} (${tz})`;
}

export const getCurrentTime: Tool<typeof schema> = {
  name: 'get_current_time',
  description: 'Obtiene la fecha y hora actual en la zona horaria de Argentina (America/Argentina/Buenos_Aires).',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: () => formatInTz(),
};
