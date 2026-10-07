"""Private JSON-lines bridge. Audio remains under data/; no network listener."""
import io
import json
import sys
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import os
os.environ.setdefault("HF_HOME", str(ROOT / "data" / "voice-models"))
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

def reply(value):
    print(json.dumps(value), flush=True)

try:
    with redirect_stdout(sys.stderr):
        import soundfile as sf
        from kokoro_onnx import Kokoro
        pipeline = Kokoro(str(ROOT / "data" / "voice-models" / "kokoro-v1.0.onnx"),
                          str(ROOT / "data" / "voice-models" / "voices-v1.0.bin"))
    reply({"ready": True})
except Exception:
    reply({"error": "No se pudo iniciar Kokoro."})
    sys.exit(1)

for line in sys.stdin:
    request = None
    try:
        request = json.loads(line)
        text = request["text"]
        if not isinstance(text, str) or not 1 <= len(text) <= 1000:
            raise ValueError("Invalid text")
        with redirect_stdout(sys.stderr):
            # El cliente corta en fragmentos breves para evitar truncar español.
            audio, rate = pipeline.create(text, voice="em_alex", speed=1.0, lang="es")
        if len(audio) == 0:
            raise ValueError("No audio")
        output = io.BytesIO()
        sf.write(output, audio, rate, format="WAV", subtype="PCM_16")
        import base64
        reply({"id": request["id"], "audio": base64.b64encode(output.getvalue()).decode("ascii")})
    except Exception:
        reply({"id": request.get("id") if isinstance(request, dict) else None, "error": "No se pudo generar la voz."})
