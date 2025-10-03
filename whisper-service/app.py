from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
import base64
import tempfile
import whisper
import os
import subprocess

app = FastAPI()

# Use 'small' model for better accuracy with Hindi/multilingual content
# 'base' is faster but less accurate for non-English languages
MODEL_SIZE = os.getenv('WHISPER_MODEL', 'small')
model = whisper.load_model(MODEL_SIZE)
print(f"Loaded Whisper model: {MODEL_SIZE}")

class AudioRequest(BaseModel):
    audioBase64: str
    expectedLanguage: Optional[str] = None  # Proper optional typing for Pydantic v2

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
        
        # Configure Whisper for better multilingual performance
        # Specify Hindi if expected, otherwise let auto-detect
        language_hint = request.expectedLanguage if request.expectedLanguage else None
        
        result = model.transcribe(
            tmp_path,
            language=language_hint,  # Specify language for better accuracy
            fp16=False,  # Use float32 for better accuracy on CPU
            task="transcribe",
            verbose=False,  # Reduce console output
            # Optimized for speed vs accuracy balance for live translation
            beam_size=3,  # Reduced for faster processing
            best_of=3,    # Reduced for faster processing
            temperature=0.0,  # More deterministic results
            condition_on_previous_text=True,  # Better for continuous speech
            without_timestamps=True,  # Disable timestamps for speed
            word_timestamps=False,  # Disable word-level timestamps for speed
            no_speech_threshold=0.6,  # Threshold for no speech detection
        )
        
        transcription = result["text"].strip()
        detected_language = result.get("language", "unknown")
        confidence = result.get("segments", [{}])[0].get("avg_logprob", 0) if result.get("segments") else 0
        
        print(f"Detected language: {detected_language}, Confidence: {confidence:.3f}")
        print(f"Transcription result: '{transcription}'")
        
        # Clean up temporary file
        try:
            os.unlink(tmp_path)
        except:
            pass
        
        return {
            "text": transcription,
            "language": detected_language,
            "confidence": confidence
        }
    except Exception as e:
        print(f"Error during transcription: {str(e)}")
        return {"text": "", "error": str(e)}

