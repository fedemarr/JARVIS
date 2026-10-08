# Conector de Jarvis para esta PC

La entrada del usuario es https://jarvis-eta-blue.vercel.app. La web se conecta al agente en segundo plano mediante un token temporal firmado, de diez minutos, emitido solo tras iniciar sesión. El token habilita lectura de proyectos y síntesis de voz; no sirve para iniciar sesión en la nube ni ejecutar comandos. El agente valida su firma y el origen exacto de producción. La clave personal nunca se envía al conector desde el navegador y el token no se guarda en localStorage. No se modifica el esquema de Neon.

En esta etapa se puede consultar Git, navegar carpetas y cargar archivos de texto al cuadro del chat. El usuario revisa y envía el contexto: no se suben carpetas completas ni archivos automáticamente. El análisis del chat sigue consumiendo la API de Claude configurada. El lector no ejecuta comandos arbitrarios ni escribe en los proyectos.

## Iniciar

1. `npm ci` y `npm run build` desde la raíz del repositorio.
2. Copiar `desktop-agent/projects.example.json` a `data/desktop-projects.json` y establecer exclusivamente proyectos autorizados, usando sus raíces de Git.
3. Conservar la clave personal de Jarvis en `data/jarvis-access-key.txt`.
4. Ejecutar `powershell -File desktop-agent/start.ps1` para iniciar en segundo plano. Para iniciarlo al entrar a Windows, ejecutar `powershell -File desktop-agent/install-startup.ps1`; crea un acceso en la carpeta Inicio del usuario actual, sin abrir ventanas. Se puede quitar ese acceso para desactivarlo.
5. Abrir https://jarvis-eta-blue.vercel.app e ingresar la clave habitual. Permitir acceso a la red local si el navegador lo solicita. La web conecta esta PC automáticamente; si falla, ofrece «Conectar esta PC» para reintentar. No se abre otra pantalla ni se ingresan otras claves.

El servicio escucha únicamente en `127.0.0.1`, valida Host y Origin y exige sesión para las lecturas. Excluye `.env`, credenciales habituales, enlaces/junctions, carpetas privadas y archivos binarios. Un detector adicional bloquea patrones comunes de secretos dentro del texto; no sustituye la revisión del contenido antes de enviarlo al chat. Git usa argumentos fijos, no shell, y desactiva fsmonitor y escrituras opcionales.

## Voz

Ver [voice-local](../voice-local/README.md). La voz Alex se usa automáticamente desde la misma web cuando esta PC está conectada; si el motor está ocupado, no está instalado o la reproducción falla, continúa la voz del navegador. Activar manos libres durante una respuesta espera su final, sin interrumpirla; el micrófono se reabre después de la lectura. La cola lee todos los fragmentos y cancelar interrumpe la reproducción. Los archivos HTML se entregan como texto: no se ejecutan.

## Alcance actual

La conexión funciona desde la web abierta en la misma PC que ejecuta el agente. En el celular o en otra computadora el chat e internet siguen funcionando con voz del navegador; conectar la PC de casa remotamente requiere la siguiente etapa. El ejecutor de tickets integra Claude Code para preparar cambios en copias separadas y ejecutar pruebas/build. No integra automáticamente cambios en el original, publica OhlimpiaERP ni cierra tickets. No se abrieron puertos del router. `127.0.0.1:3002` queda como interfaz opcional de desarrollo, no como entrada requerida.

La siguiente etapa necesita vinculación con credenciales individuales revocables, heartbeat y cola persistente de trabajos entre el agente y la nube. Probar sus migraciones en una rama aislada de Neon antes de llevarlas a producción. La ejecución actual se limita a trabajos iniciados por Federico y a herramientas de archivos en la copia del ticket; ampliar el control remoto requiere autenticación por dispositivo y políticas para cada capacidad.

Validación: `npm test -w backend`, `npm run typecheck`, `npm run build`, `node frontend/ui-smoke.cjs`.

## Tickets con Claude Code

En la web, elegí OhlimpiaERP, seleccioná un archivo .md/.html y usá **Resolver ticket con Claude**. También podés pegar una tarea concreta en el panel. El chat reconoce pedidos que comienzan con «Resolvé el ticket…» y los deriva al ejecutor. No hay que abrir ni copiar mensajes a la terminal de Claude.

Claude Code debe estar instalado mediante npm y tener una sesión iniciada en esta PC. Se usa su autenticación local, sin exportar claves a la web ni heredar ANTHROPIC_API_KEY del servidor. El consumo y los límites dependen de esa cuenta. La integración usa [modo print y herramientas MCP](https://code.claude.com/docs/en/cli-reference): se deshabilitan herramientas nativas, Chrome, otros MCP y configuraciones de sesión. El MCP de Jarvis solo permite listar, leer por líneas, buscar texto y escribir/editar archivos permitidos en la copia; bloquea enlaces, secretos y cambios de configuración. No se entrega una terminal libre.

Los trabajos se guardan en `data/ticket-jobs/<id>`. El snapshot conserva el código actual, incluidos cambios locales, sin modificar el original; es un repositorio Git independiente sin remoto. Se instala desde el lockfile con scripts de instalación deshabilitados. Para OhlimpiaERP se ejecutan Vitest excluyendo staging y e2e, y Vite build; las comprobaciones pendientes se muestran como tales. Una comprobación fallida provoca un intento de corrección antes del resultado final. El resultado incluye resumen, diff y salida de pruebas, con botón para abrir la copia en VS Code. Solo hay una tarea activa, con cancelación y límite de veinte minutos; los cambios parciales se conservan.

La credencial para iniciar/consultar/cancelar trabajos o abrir VS Code tiene una firma de propósito distinta de la credencial de lectura/voz. Las tareas requieren una acción explícita del usuario en la web autenticada.

## Bandeja de OhlimpiaERP

«Conectar OhlimpiaERP» abre una ventana de https://ohlimpiaerp.vercel.app para iniciar sesión con el perfil DEVELOPER. Jarvis usa un perfil de navegador propio, guardado únicamente en `data/ohlimpia-browser`; no copia el perfil habitual ni envía contraseñas o cookies a Vercel. Después de iniciar sesión, las consultas pasan a segundo plano. La implementación usa [sesiones persistentes y descargas de Playwright](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context).

«Ver tickets de la web» consulta la bandeja. «Descargar y resolver» guarda una especificación Markdown y adjuntos .md/.html en `ohlimpiaerp/jarvis-tickets/<id>-<sufijo>/`, sin sobrescribir archivos existentes, y los pasa al ejecutor de Claude. Se admiten diez adjuntos de hasta 512 KB cada uno; los adjuntos no compatibles requieren revisión antes de ejecutar. Claude consulta esos archivos por líneas para no cargar todos los mockups en el prompt inicial. El HTML descargado se trata como referencia, nunca se abre como página. No se pulsa Guardar, Eliminar, Generar prompt, ni se modifican estados del ERP.

El chat/manos libres reconoce «Entrá a OhlimpiaERP y hacé el siguiente ticket» y «Resolvé el ticket 191 de OhlimpiaERP». Siguiente significa el primer Abierto/En progreso en el orden de la bandeja. Los números son los que muestra el ERP y pueden cambiar al ingresar tickets nuevos; la selección visual utiliza el ID interno. La ejecución prepara cambios en una copia independiente y los comprueba; integrar los cambios al original sigue siendo manual.
