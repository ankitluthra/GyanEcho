from fastapi import FastAPI
from pydantic import BaseModel
import base64
import tempfile
import whisper

app = FastAPI()
model = whisper.load_model("base")  # "base" is faster than "small"

class AudioRequest(BaseModel):
    audioBase64: str

@app.post("/transcribe")
async def transcribe_audio(request: AudioRequest):
    try:
        audio_data = base64.b64decode(request.audioBase64)
        print(f"Received audio data: {len(audio_data)} bytes")
        
        # Use .webm extension since browser MediaRecorder typically outputs WebM
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            tmp.write(audio_data)
            tmp.flush()
            tmp_path = tmp.name
        
        print(f"Transcribing file: {tmp_path}")
        # Whisper will use ffmpeg to convert WebM to the format it needs
        # Let Whisper auto-detect language and transcribe in original script
        result = model.transcribe(tmp_path, language=None, fp16=False, task="transcribe")
        
        transcription = result["text"].strip()
        detected_language = result.get("language", "unknown")
        print(f"Detected language: {detected_language}")
        print(f"Transcription result: '{transcription}'")
        
        return {"text": transcription, "language": detected_language}
    except Exception as e:
        print(f"Error during transcription: {str(e)}")
        return {"text": ""}
