import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { FastifyInstance } from 'fastify';

const COOKIE = 'jarvis_session';
const SESSION_SECONDS = 8 * 60 * 60;

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001')
    .split(',').map((value) => value.trim()).filter(Boolean);
}

export function validateAccessConfig(): void {
  const cloud = process.env.JARVIS_MODE === 'cloud';
  const host = process.env.HOST || '127.0.0.1';
  const key = process.env.JARVIS_ACCESS_KEY;
  if ((cloud || !['127.0.0.1', 'localhost', '::1'].includes(host)) && !key) {
    throw new Error('El acceso remoto requiere JARVIS_ACCESS_KEY (mínimo 32 caracteres).');
  }
  if (key && key.length < 32) throw new Error('JARVIS_ACCESS_KEY debe tener al menos 32 caracteres.');
  if (cloud && !process.env.ALLOWED_ORIGINS) throw new Error('Configurá ALLOWED_ORIGINS con la URL de la interfaz.');
}

export function createSession(key: string, now = Date.now()): string {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(16).toString('hex')}`;
  return `${payload}.${createHmac('sha256', key).update(payload).digest('hex')}`;
}

export function validSession(token: string, key: string, now = Date.now()): boolean {
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{32}$/.test(parts[1])) return false;
  const expiry = Number(parts[0]);
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(now / 1000) || expiry > Math.floor(now / 1000) + SESSION_SECONDS) return false;
  return equal(parts[2], createHmac('sha256', key).update(`${parts[0]}.${parts[1]}`).digest('hex'));
}

export function registerAuth(app: FastifyInstance, options: { allowLogin?: (ipHash: string) => Promise<boolean> } = {}): void {
  validateAccessConfig();
  const key = process.env.JARVIS_ACCESS_KEY;
  const origins = allowedOrigins();
  const secure = process.env.NODE_ENV === 'production' || process.env.JARVIS_MODE === 'cloud';
  const attempts = new Map<string, { count: number; until: number }>();
  function authenticated(cookie?: string): boolean {
    if (!key) return true; // Solo permitido con escucha local.
    const token = cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    return !!token && validSession(token, key);
  }
  function cookie(value: string, maxAge: number): string {
    return `${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  }

  app.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0];
    if (!url.startsWith('/api/')) return;
    if (request.headers.origin && !origins.includes(request.headers.origin)) {
      return reply.code(403).send({ message: 'Origen no permitido.' });
    }
    if (url === '/api/health' || url === '/api/session' || request.method === 'OPTIONS') return;
    if (!authenticated(request.headers.cookie)) return reply.code(401).send({ message: 'Iniciá sesión para acceder a Jarvis.' });
  });

  app.get('/api/session', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { authenticationRequired: !!key, authenticated: authenticated(request.headers.cookie) };
  });
  app.post<{ Body: { accessKey: string } }>('/api/session', {
    schema: { body: { type: 'object', required: ['accessKey'], additionalProperties: false, properties: { accessKey: { type: 'string', minLength: 1, maxLength: 512 } } } },
  }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!key) return { authenticated: true };
    if (options.allowLogin && !await options.allowLogin(createHmac('sha256', key).update(request.ip).digest('hex'))) {
      return reply.code(429).header('Retry-After', '300').send({ message: 'Demasiados intentos. Esperá cinco minutos.' });
    }
    const now = Date.now();
    for (const [ip, attempt] of attempts) if (attempt.until <= now) attempts.delete(ip);
    const attempt = attempts.get(request.ip) || { count: 0, until: now + 5 * 60 * 1000 };
    if (attempt.count >= 10 || (attempts.size >= 10000 && !attempts.has(request.ip))) return reply.code(429).header('Retry-After', '300').send({ message: 'Demasiados intentos. Esperá cinco minutos.' });
    attempt.count++;
    attempts.set(request.ip, attempt);
    if (!equal(request.body.accessKey, key)) return reply.code(401).send({ message: 'Clave incorrecta.' });
    attempts.delete(request.ip);
    reply.header('Set-Cookie', cookie(createSession(key), SESSION_SECONDS));
    return { authenticated: true };
  });
  app.delete('/api/session', async (_request, reply) => {
    reply.header('Set-Cookie', cookie('', 0)).header('Cache-Control', 'no-store');
    return { authenticated: false };
  });
}
