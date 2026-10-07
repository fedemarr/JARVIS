# Voz local de Jarvis

Motor Kokoro, voz masculina en español `em_alex`, ejecutado en CPU mediante `kokoro-onnx`. No requiere claves de voz ni pagos por caracteres. La calidad y el acento deben evaluarse escuchándolo; no es una clonación de voz argentina. El worker no escucha en ningún puerto y recibe fragmentos por stdin del agente local.

## Instalación verificada en Windows

Usar Python 3.14 instalado en Windows y `uv`:

```powershell
py -3.14 -m venv data/voice-system-venv
uv pip sync --python data/voice-system-venv/Scripts/python.exe voice-local/requirements.lock.txt
New-Item -ItemType Directory -Force data/voice-models
curl.exe -L --fail https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx -o data/voice-models/kokoro-v1.0.onnx
curl.exe -L --fail https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin -o data/voice-models/voices-v1.0.bin
npm run desktop
```

Descargas iniciales: modelo aproximado de 326 MB, voces y dependencias de Python. Todos permanecen en `data/`, excluida de Git y de Vercel. Después de la descarga, sintetizar voz no necesita internet. El chat con Claude sí lo necesita. El modelo tarda en cargarse al iniciar; la interfaz indica su disponibilidad.

En https://jarvis-eta-blue.vercel.app, hacer clic en la J permite probar el saludo. Si el conector está encendido en esa misma PC y el navegador permite la conexión local, la voz Alex se reproduce en la web mediante el puente autenticado. El selector ofrece Alex y las voces del navegador. En el celular o con el equipo desconectado se mantiene la voz del navegador; todavía no se retransmite el audio de la PC a otros dispositivos por internet.

SHA-256 de las descargas verificadas:

- `kokoro-v1.0.onnx`: `beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a`
- `voices-v1.0.bin`: `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d`

Fuentes y licencias: [Kokoro y voces oficiales](https://huggingface.co/hexgrad/Kokoro-82M) (modelo Apache 2.0), [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) (MIT). El fonetizador utiliza eSpeak NG. No se cambian las políticas de seguridad de Windows para instalar estos componentes.
