# Consultas de internet

La nube y Jarvis Desktop (a través de su proxy HTTPS) ofrecen:

- `web_search`: resultados públicos con título, URL y fragmento; DuckDuckGo HTML con respaldo Bing RSS. No requiere cuenta ni clave. Los buscadores pueden bloquear solicitudes, cambiar su formato o devolver resultados poco pertinentes; se informa el fallo y se puede leer una URL directa. No se garantiza equivalencia con Google.
- `read_web_page`: extracción del texto de una página pública HTTPS. Sin JavaScript, cookies, sesiones ni interacción con botones; no descarga PDFs ni ejecutables. Texto limitado a 8.000 caracteres y descarga limitada a 256 KB.
- `get_weather`: geocodificación de ciudad/país y condiciones estimadas actuales con pronóstico del día, unidades, hora y fuente Open-Meteo. Confirmar localidades ambiguas. No se presenta como una estación meteorológica.

Cada consulta valida protocolo, puerto, credenciales en URL e IPs resueltas. Bloquea redes privadas/reservadas, IPv4 mapeada en IPv6 y redirects hacia esas redes. Fija la IP validada en la conexión TLS para impedir una segunda resolución DNS. Se aplican límites de tiempo y descarga. No se envían cookies o claves de Jarvis a las páginas.

El prompt trata páginas y fragmentos como referencias no confiables: no autorizan acciones ni permiten enviar datos privados. Jarvis cita las URLs y no debe inventar resultados cuando una consulta falla. El chat conserva su consumo normal de Claude.

El endpoint gratuito de Open-Meteo es para uso personal/no comercial y tiene límites; esta configuración es para el asistente personal de Federico. Evaluar licencia/proveedor antes de integrarlo en un producto comercial. No se contrató ningún servicio. Fuentes: [documentación y atribución](https://open-meteo.com/en/docs), [términos](https://open-meteo.com/en/terms).

Control visual del navegador de la PC, sesiones privadas, clicks y formularios siguen fuera de esta versión del agente de escritorio. La lectura web funciona también cuando la PC está apagada, desde Vercel.
