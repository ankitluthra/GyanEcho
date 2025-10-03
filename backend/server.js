import express from "express";
import dotenv from "dotenv";
import WebSocket, { WebSocketServer } from "ws";
import { translateText } from "./translate.js";
import axios from "axios";

dotenv.config();
const app = express();
const port = process.env.BACKEND_PORT || 4000;

// WebSocket setup
const wss = new WebSocketServer({ port: 8080 });
console.log("✅ WebSocket server running on ws://localhost:8080");

wss.on("connection", (ws) => {
  console.log("🔗 Client connected");

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.audioBase64) {
        console.log("📨 Received audio, sending to Whisper...");
        
        const resp = await axios.post(`http://whisper-service:5000/transcribe`, {
          audioBase64: data.audioBase64,
          expectedLanguage: data.expectedLanguage || null,
        });

        const transcription = resp.data.text.trim();
        const detectedLang = resp.data.language || "unknown";
        const confidence = resp.data.confidence || 0;
        console.log(`📝 Transcription (${detectedLang}, confidence: ${confidence.toFixed(3)}):`, transcription);

        // Only send if we got actual text
        if (transcription && transcription.length > 0) {
          const translations = await translateText(transcription);
          console.log("🌐 Translations:", translations);

          const response = { original: transcription, translations };
          console.log("📤 Sending to client:", JSON.stringify(response));
          ws.send(JSON.stringify(response));
          console.log("✅ Sent successfully");
        } else {
          console.log("⚠️ Empty transcription, skipping...");
        }
      }
    } catch (err) {
      console.error("❌ Error:", err.message);
      ws.send(JSON.stringify({ error: err.message }));
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
  });
});

app.listen(port, () =>
  console.log(`✅ Backend server running on http://localhost:${port}`)
);
