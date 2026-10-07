import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildCloudApp } from '../backend/src/cloud/app';

const app = buildCloudApp();

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  await app.ready();
  app.server.emit('request', request, response);
}
