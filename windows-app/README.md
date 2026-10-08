# Jarvis dentro de Windows

Desde la raíz del proyecto:

```powershell
powershell -NoProfile -File windows-app/install.ps1
```

Crea accesos **Jarvis** en Inicio y en el inicio automático del usuario. Abre el conector local y una ventana de Chrome en modo aplicación, conservando el reconocimiento de voz existente. No requiere administrador ni un servicio pago.

- Abrí **Jarvis** desde Inicio o con **Ctrl + Alt + J**.
- Al entrar a Windows abre la aplicación y conecta archivos, voz y Claude Code.
- Activá **manos libres** y permití el micrófono para llamarlo diciendo «Jarvis» mientras la ventana está abierta. Minimizar conserva la aplicación; cerrar con la X termina la escucha hasta volver a abrirla.

El perfil privado `data/jarvis-desktop-browser` conserva la sesión de Jarvis y no comparte las pestañas del Chrome habitual. Para preparar la sesión automáticamente con la clave local, antes del primer inicio se puede ejecutar `node windows-app/signin.cjs`; también podés ingresar desde la ventana. Ninguna clave se incorpora al lanzador o al acceso directo.

Claude y Ohlimpia requieren internet. La interfaz se actualiza desde el despliegue de Jarvis. Para desactivar el inicio automático, quitá únicamente `Jarvis.lnk` de la carpeta Inicio del usuario (`shell:startup`).

Esta versión usa Chrome y PowerShell instalados. El prototipo de bandeja con ejecutable propio fue bloqueado por Smart App Control; no forma parte de esta instalación. Una bandeja propia queda pendiente de una distribución que Windows acepte.
