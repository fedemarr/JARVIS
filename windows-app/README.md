# Jarvis dentro de Windows

Desde la raíz del proyecto:

```powershell
powershell -NoProfile -File windows-app/install.ps1
```

Crea accesos **Jarvis** en Inicio y en el inicio automático del usuario. Compila un compañero nativo de Windows con .NET Framework, que abre el conector local y una ventana de Chrome en modo aplicación, conservando el reconocimiento de voz existente. No requiere administrador ni un servicio pago.

- Abrí **Jarvis** desde Inicio o con **Ctrl + Alt + J**.
- El icono **J** junto al reloj permite abrir, ocultar y salir de Jarvis. Ocultar desde ese menú conserva la ventana y la conversación.
- Al entrar a Windows abre la aplicación y conecta archivos, voz y Claude Code.
- Activá **manos libres** y permití el micrófono para llamarlo diciendo «Jarvis» mientras la ventana está abierta. Minimizar conserva la aplicación; cerrar con la X termina la escucha hasta volver a abrirla.

El perfil privado `data/jarvis-desktop-browser` conserva la sesión de Jarvis y no comparte las pestañas del Chrome habitual. Para preparar la sesión automáticamente con la clave local, antes del primer inicio se puede ejecutar `node windows-app/signin.cjs`; también podés ingresar desde la ventana. Ninguna clave se incorpora al lanzador o al acceso directo.

Claude y Ohlimpia requieren internet. La interfaz se actualiza desde el despliegue de Jarvis. Para desactivar el inicio automático, quitá únicamente `Jarvis.lnk` de la carpeta Inicio del usuario (`shell:startup`).

El ejecutable se guarda en `data/windows-app/Jarvis.exe`. Para actualizarlo, primero elegí **Salir de Jarvis** desde la bandeja y ejecutá el instalador otra vez. Si Windows bloquea el ejecutable por sus políticas de firma, se conserva el lanzador alternativo `windows-app/start.ps1`; una distribución firmada queda pendiente. El instalador no modifica las protecciones de Windows.

Salir desde la bandeja cierra la interfaz, pero deja el conector independiente para que un ticket que ya se está trabajando pueda terminar. No cierra las ventanas de tu Chrome habitual. La instancia única y el atajo usan un identificador por carpeta del proyecto.
