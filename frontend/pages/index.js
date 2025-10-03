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

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 2000;

    const connectWebSocket = () => {
      const socket = new WebSocket("ws://localhost:8080");
      ws.current = socket;

      socket.onopen = () => {
        console.log("✅ WebSocket connected");
        reconnectAttempts = 0; // Reset on successful connection
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("📩 Received:", data);

          // Append to continuous text
          setContinuousText((prev) => ({
            original: prev.original + " " + (data.original || ""),
            en: prev.en + " " + (data.translations?.en || ""),
            fr: prev.fr + " " + (data.translations?.fr || ""),
            pa: prev.pa + " " + (data.translations?.pa || ""),
            hi: prev.hi + " " + (data.translations?.hi || "")
          }));

          // Also keep individual messages for reference
          setMessages((prev) => [...prev, data]);
        } catch (err) {
          console.error("Failed to parse message:", err);
        }
      };

      socket.onclose = (event) => {
        console.log("⚠️ WebSocket disconnected", event.code, event.reason);
        // Attempt to reconnect if not intentionally closed
        if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`🔄 Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
          setTimeout(connectWebSocket, reconnectDelay);
        }
      };

      socket.onerror = (err) => {
        console.error("❌ WebSocket error:", err);
      };
    };

    connectWebSocket();

    return () => {
      if (ws.current) {
        ws.current.close(1000, "Component unmounting");
      }
    };
  }, []);

  // Start capturing mic and sending audio as Base64
  const startMic = async () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected. Current state:", ws.current?.readyState);
      alert("WebSocket not connected. Please wait for connection or refresh the page.");
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
      
      let mediaRecorder;
      let mimeType = '';
      
      // Try different approaches to create MediaRecorder
      try {
        // First, try without specifying MIME type (let browser choose)
        mediaRecorder = new MediaRecorder(stream);
        mimeType = 'default (browser-chosen)';
      } catch (e1) {
        console.log('Default MediaRecorder failed, trying specific MIME types...');
        
        // Try common supported MIME types
        const supportedTypes = [
          'audio/webm',
          'audio/webm;codecs=opus',
          'audio/mp4',
          'audio/wav'
        ];
        
        let foundSupported = false;
        for (const type of supportedTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            try {
              mediaRecorder = new MediaRecorder(stream, { mimeType: type });
              mimeType = type;
              foundSupported = true;
              console.log(`✅ Using supported MIME type: ${type}`);
              break;
            } catch (e2) {
              console.log(`❌ MIME type ${type} not supported despite isTypeSupported()`);
            }
          }
        }
        
        if (!foundSupported) {
          throw new Error('No supported audio MIME types found');
        }
      }
      
      console.log(`🎙️ MediaRecorder initialized with MIME type: ${mimeType}`);
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);

      const audioChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
          console.log(`📦 Audio chunk received: ${event.data.size} bytes`);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunks.length > 0 && ws.current && ws.current.readyState === WebSocket.OPEN) {
          try {
            const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });

            // Skip very small audio blobs (likely silence)
            if (audioBlob.size < 1000) { // Less than 1KB is probably silence
              console.log(`🔇 Skipping likely silence: ${audioBlob.size} bytes`);
              audioChunks.length = 0;
              return;
            }

            console.log(`📤 Sending audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
            const buffer = await audioBlob.arrayBuffer();
            const base64Audio = arrayBufferToBase64(buffer);

            // Send audio for transcription (let Whisper auto-detect language for multilingual support)
            ws.current.send(JSON.stringify({
              audioBase64: base64Audio
              // Removed hardcoded language hint - Whisper will auto-detect for better multilingual support
            }));
            audioChunks.length = 0; // Clear the array
          } catch (error) {
            console.error('❌ Error sending audio:', error);
          }
        }
      };

      // Record for much shorter intervals for live translation
      mediaRecorder.start(500); // Collect data every 0.5 seconds for faster response

      // Send audio every 1 second for near real-time translation
      const intervalId = setInterval(() => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
          mediaRecorder.stop();
          // Create new recorder for next chunk
          try {
            const newRecorder = new MediaRecorder(stream, { mimeType: mediaRecorder.mimeType || undefined });
            newRecorder.ondataavailable = mediaRecorder.ondataavailable;
            newRecorder.onstop = mediaRecorder.onstop;
            mediaRecorderRef.current = newRecorder;
            mediaRecorder = newRecorder;
            mediaRecorder.start(500); // 0.5 second chunks for live feel
          } catch (error) {
            console.error('❌ Error creating new MediaRecorder:', error);
          }
        }
      }, 1000); // Send every 1 second for much faster response
      
      // Store interval ID and stream so we can clear it later
      mediaRecorderRef.current.intervalId = intervalId;
      mediaRecorderRef.current.audioStream = stream;
      
    } catch (err) {
      console.error("❌ Error accessing microphone:", err);
      if (err.name === 'NotAllowedError') {
        alert("❌ Microphone permission denied. Please allow microphone access and try again.");
      } else if (err.name === 'NotFoundError') {
        alert("❌ No microphone found. Please connect a microphone and try again.");
      } else if (err.name === 'NotSupportedError') {
        alert("❌ Audio recording is not supported in this environment. Try using a different browser or environment.");
      } else {
        alert(`❌ Cannot access microphone: ${err.message}`);
      }
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
      if (mediaRecorderRef.current.audioStream) {
        mediaRecorderRef.current.audioStream.getTracks().forEach((track) => track.stop());
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
      <p className="text-sm text-gray-400 mb-4">🚀 Optimized for Hindi & multilingual speech • Real-time transcription</p>

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
