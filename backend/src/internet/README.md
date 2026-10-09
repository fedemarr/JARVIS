# Consultas de internet

La nube y Jarvis Desktop (a través de su proxy HTTPS) ofrecen:

- `web_search`: resultados públicos con título, URL y fragmento; DuckDuckGo HTML, Bing RSS y Google como alternativas. Abre fuentes automáticamente y entrega su contenido en `sources`, con estado de lectura y fechas de publicación cuando existen. Intenta alternativas si una URL falla; limita la lectura automática a 45 segundos y cuatro páginas. Los snippets no se presentan como contenido verificado. Google puede intentar cargar resultados con JavaScript. No requiere cuenta ni clave; si ya existe una clave Tavily en el backend local, la usa y recurre a estos buscadores si falla. Los bloqueos y cambios de formato se informan, sin inventar resultados.
- `read_web_page`: páginas HTTPS públicas, con carga de JavaScript cuando el HTML parece una aplicación vacía. `mode: javascript` fuerza el navegador; `mode: text` usa solamente HTML. Devuelve título, método, enlaces, fecha y partes de 12.000 caracteres. `nextOffset` permite continuar documentos largos. La descarga inicial tiene un límite de 1,5 MB; el navegador limita tiempo, recursos y tamaño total. No inicia sesiones ni supera captchas; no descarga PDFs ni ejecutables.
- `get_weather`: geocodificación de ciudad/país y condiciones estimadas actuales con pronóstico del día, unidades, hora y fuente Open-Meteo. Confirmar localidades ambiguas. No se presenta como una estación meteorológica.

Cada consulta valida protocolo, puerto, credenciales en URL e IPs resueltas. Bloquea redes privadas/reservadas, IPv4 mapeada en IPv6 y redirects hacia esas redes. Fija la IP validada en la conexión TLS para impedir una segunda resolución DNS. Se aplican límites de tiempo y descarga. No se envían cookies o claves de Jarvis a las páginas.

El navegador usa un contexto nuevo sin sesiones guardadas. Cada recurso de texto GET pasa por el lector con DNS fijado; no se permite el acceso directo de Chromium a la red. Se bloquean service workers, websockets, escrituras, imágenes, fuentes, medios y ventanas nuevas. Las páginas con APIs que requieren POST o recursos bloqueados pueden no cargarse completas. Playwright usa Chromium instalado en la PC y `@sparticuz/chromium` incluido en la función de Vercel; no depende de que la PC esté encendida.

El prompt trata páginas y fragmentos como referencias no confiables: no autorizan acciones ni permiten enviar datos privados. Jarvis cita las URLs y no debe inventar resultados cuando una consulta falla. El chat conserva su consumo normal de Claude.

El chat recibe la fecha actual de Buenos Aires para investigar noticias y temporadas actuales. Las tablas vacías activan la carga con JavaScript; al extraerlas se separan sus celdas para conservar la lectura de puntuaciones y estadísticas. Si la respuesta omite enlaces, el ejecutor agrega hasta dos fuentes efectivamente leídas, sin citar snippets ni páginas fallidas.

El endpoint gratuito de Open-Meteo es para uso personal/no comercial y tiene límites; esta configuración es para el asistente personal de Federico. Evaluar licencia/proveedor antes de integrarlo en un producto comercial. No se contrató ningún servicio. Fuentes: [documentación y atribución](https://open-meteo.com/en/docs), [términos](https://open-meteo.com/en/terms).

Control visual del navegador de la PC, sesiones privadas, clicks y formularios siguen fuera de esta versión del agente de escritorio. La lectura web funciona también cuando la PC está apagada, desde Vercel.
