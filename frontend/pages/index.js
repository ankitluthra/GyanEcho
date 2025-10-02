import { useEffect, useState, useRef } from "react";
import SubtitleDisplay from "../components/SubtitleDisplay";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [recording, setRecording] = useState(false);
  const [continuousText, setContinuousText] = useState({
    original: "",
    en: "",
    fr: "",
    pa: "",
    hi: ""
  });
  const ws = useRef(null);
  const mediaRecorderRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
  
    const socket = new WebSocket("ws://localhost:8080");
    ws.current = socket;
  
    socket.onopen = () => {
      console.log("✅ WebSocket connected");
    };
  
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📩 Received:", data);
        
        // Append to continuous text
        setContinuousText((prev) => ({
          original: prev.original + " " + data.original,
          en: prev.en + " " + (data.translations.en || ""),
          fr: prev.fr + " " + (data.translations.fr || ""),
          pa: prev.pa + " " + (data.translations.pa || ""),
          hi: prev.hi + " " + (data.translations.hi || "")
        }));
        
        // Also keep individual messages for reference
        setMessages((prev) => [...prev, data]);
      } catch (err) {
        console.error("Failed to parse message:", err);
      }
    };
  
    socket.onclose = () => {
      console.log("⚠️ WebSocket disconnected");
    };
  
    socket.onerror = (err) => {
      console.error("❌ WebSocket error:", err);
    };
  
    return () => {
      socket.close();
    };
  }, []);

  // Start capturing mic and sending audio as Base64
  const startMic = async () => {
    if (!ws.current) {
      alert("WebSocket not initialized yet!");
      return;
    }
  
    if (ws.current.readyState === WebSocket.CONNECTING) {
      console.log("⏳ Waiting for WebSocket to connect...");
      ws.current.addEventListener("open", () => {
        startRecording();
      }, { once: true });
    } else if (ws.current.readyState === WebSocket.OPEN) {
      startRecording();
    } else {
      alert("WebSocket not connected. Please refresh the page.");
    }
  };
  
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Try to use audio/wav if supported, otherwise use default
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      }
      
      console.log(`Using MIME type: ${mimeType}`);
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
  
      const audioChunks = [];
  
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
          console.log(`Chunk received: ${event.data.size} bytes`);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunks.length > 0 && ws.current && ws.current.readyState === WebSocket.OPEN) {
          const audioBlob = new Blob(audioChunks, { type: mimeType });
          console.log(`Sending audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
          const buffer = await audioBlob.arrayBuffer();
          const base64Audio = arrayBufferToBase64(buffer);
          ws.current.send(JSON.stringify({ audioBase64: base64Audio }));
          audioChunks.length = 0; // Clear the array
        }
      };
  
      // Record for 5 seconds at a time (longer = better context)
      mediaRecorder.start();
      
      // Send audio every 5 seconds
      const intervalId = setInterval(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
          mediaRecorder.start();
        }
      }, 5000);
      
      // Store interval ID so we can clear it later
      mediaRecorderRef.current.intervalId = intervalId;
    } catch (err) {
      console.error("❌ Error accessing mic:", err);
      alert("Cannot access microphone. Check permissions.");
    }
  };
  
  // Convert ArrayBuffer -> Base64
  const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };
  
  const stopMic = () => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.intervalId) {
        clearInterval(mediaRecorderRef.current.intervalId);
      }
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
      setRecording(false);
    }
  };

  const clearTranscript = () => {
    setContinuousText({
      original: "",
      en: "",
      fr: "",
      pa: "",
      hi: ""
    });
    setMessages([]);
  };

  return (
    <div className="p-6 bg-black text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-4">🌍 GyanEcho Live Subtitles</h1>

      <div className="flex gap-4 mb-6">
        <button
          className={`px-4 py-2 rounded ${recording ? "bg-red-500" : "bg-green-500"}`}
          onClick={recording ? stopMic : startMic}
        >
          {recording ? "🎤 Stop Mic" : "🎤 Start Mic"}
        </button>
        <button
          className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-600"
          onClick={clearTranscript}
        >
          🗑️ Clear
        </button>
      </div>

      {/* Continuous Translation Display */}
      <div className="mb-8 p-6 bg-gray-900 rounded-lg shadow-lg">
        <h2 className="text-xl font-bold mb-4 text-yellow-400">📝 Continuous Transcript</h2>
        
        <div className="space-y-4">
          <div className="p-3 bg-gray-800 rounded">
            <p className="text-sm text-gray-400 mb-1">Original:</p>
            <p className="text-yellow-300">{continuousText.original || "Waiting for speech..."}</p>
          </div>
          
          <div className="p-3 bg-gray-800 rounded">
            <p className="text-sm text-gray-400 mb-1">🇬🇧 English:</p>
            <p>{continuousText.en || "..."}</p>
          </div>
          
          <div className="p-3 bg-gray-800 rounded">
            <p className="text-sm text-gray-400 mb-1">🇫🇷 French:</p>
            <p>{continuousText.fr || "..."}</p>
          </div>
          
          <div className="p-3 bg-gray-800 rounded">
            <p className="text-sm text-gray-400 mb-1">🇮🇳 Punjabi:</p>
            <p>{continuousText.pa || "..."}</p>
          </div>
          
          <div className="p-3 bg-gray-800 rounded">
            <p className="text-sm text-gray-400 mb-1">🇮🇳 Hindi:</p>
            <p>{continuousText.hi || "..."}</p>
          </div>
        </div>
      </div>

      {/* Individual Messages (for debugging) */}
      <details className="mb-4">
        <summary className="cursor-pointer text-gray-400 hover:text-white">Show individual segments ({messages.length})</summary>
        <div className="mt-4">
          {messages.map((msg, idx) => (
            <SubtitleDisplay key={idx} data={msg} />
          ))}
        </div>
      </details>
    </div>
  );
}
