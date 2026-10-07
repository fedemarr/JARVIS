import { buildCloudApp } from './src/cloud/app';

const app = buildCloudApp();
app.listen({ port: Number(process.env.PORT || 3001), host: '0.0.0.0' }).catch(() => {
  console.error('No se pudo iniciar el backend de Jarvis. Revisá su configuración.');
  process.exitCode = 1;
});

export default app;
