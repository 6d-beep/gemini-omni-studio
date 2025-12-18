import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Volume2, Activity, Power, XCircle } from 'lucide-react';

// --- Audio Utils (from Guidelines) ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  // Create a copy of the buffer to avoid issues with offset
  const bufferCopy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const dataInt16 = new Int16Array(bufferCopy);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): { data: string, mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = Math.max(-1, Math.min(1, data[i])) * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

const LiveSession: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [transcription, setTranscription] = useState<{user: string, model: string}[]>([]);
  const [currentTurn, setCurrentTurn] = useState({ user: '', model: '' });
  const [isMuted, setIsMuted] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null); // To hold the active session promise or object

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const disconnect = () => {
     if (sessionRef.current) {
        sessionRef.current.then((session: any) => {
            try { session.close(); } catch(e) { console.error(e); }
        });
     }
     if (inputContextRef.current) {
       inputContextRef.current.close();
       inputContextRef.current = null;
     }
     if (outputContextRef.current) {
       outputContextRef.current.close();
       outputContextRef.current = null;
     }
     setConnected(false);
  };

  const connect = async () => {
    setConnected(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Audio Contexts
    const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
    const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
    inputContextRef.current = inputAudioContext;
    outputContextRef.current = outputAudioContext;
    
    const outputNode = outputAudioContext.createGain();
    outputNode.connect(outputAudioContext.destination);
    
    nextStartTimeRef.current = 0; // Reset
    
    // Get Mic Stream
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const config = {
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        systemInstruction: { parts: [{ text: 'You are a helpful assistant.' }] },
        inputAudioTranscription: { model: 'gemini-2.5-flash-native-audio-preview-09-2025' }, 
        outputAudioTranscription: { model: 'gemini-2.5-flash-native-audio-preview-09-2025' },
      },
    };

    const sessionPromise = ai.live.connect({
      model: config.model,
      config: config.config,
      callbacks: {
        onopen: () => {
          console.log("Session Opened");
          const source = inputAudioContext.createMediaStreamSource(stream);
          const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
          
          scriptProcessor.onaudioprocess = (e) => {
            if (isMuted) return; // Simple mute
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            sessionPromise.then((session) => {
               session.sendRealtimeInput({ media: pcmBlob });
            });
          };
          
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContext.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
           // Handle Transcription
           const serverContent = message.serverContent;
           if (serverContent) {
             if (serverContent.modelTurn) {
                // Audio Output
                const parts = serverContent.modelTurn.parts;
                for (const part of parts) {
                    if (part.inlineData && part.inlineData.data) {
                        const base64Audio = part.inlineData.data;
                        // Schedule Playback
                        // Ensure context is running
                        if (outputAudioContext.state === 'suspended') {
                            await outputAudioContext.resume();
                        }
                        
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
                        
                        const audioBuffer = await decodeAudioData(
                            decode(base64Audio),
                            outputAudioContext,
                            24000,
                            1
                        );
                        
                        const source = outputAudioContext.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputNode);
                        source.start(nextStartTimeRef.current);
                        
                        nextStartTimeRef.current += audioBuffer.duration;
                        
                        sourcesRef.current.add(source);
                        source.onended = () => {
                            sourcesRef.current.delete(source);
                        };
                    }
                }
             }
             
             // Handle Interruption
             if (serverContent.interrupted) {
                 sourcesRef.current.forEach(s => s.stop());
                 sourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
             }

             if (serverContent.outputTranscription) {
                 setCurrentTurn(prev => ({ ...prev, model: prev.model + serverContent.outputTranscription.text }));
             }
             if (serverContent.inputTranscription) {
                 setCurrentTurn(prev => ({ ...prev, user: prev.user + serverContent.inputTranscription.text }));
             }
             
             if (serverContent.turnComplete) {
                 setTranscription(prev => [...prev, { 
                    user: currentTurn.user, 
                    model: currentTurn.model 
                 }]);
                 setCurrentTurn({ user: '', model: '' });
             }
           }
        },
        onclose: () => {
            console.log("Session Closed");
            setConnected(false);
        },
        onerror: (err) => {
            console.error("Session Error", err);
            setConnected(false);
        }
      }
    });
    
    sessionRef.current = sessionPromise;
  };

  return (
    <div className="h-full flex flex-col p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
            <div>
               <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                 <Activity className="text-red-500" /> Live Voice
               </h2>
               <p className="text-gray-400 text-sm">Real-time voice conversation with Gemini 2.5</p>
            </div>
            <button 
               onClick={connected ? disconnect : connect}
               className={`px-6 py-3 rounded-full font-bold flex items-center gap-2 transition-all ${
                   connected ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white'
               }`}
            >
               {connected ? <><Power size={20}/> Disconnect</> : <><Mic size={20}/> Connect & Start</>}
            </button>
        </div>
        
        <div className="flex-1 bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden flex flex-col">
            <div className="flex-1 p-6 space-y-4 overflow-y-auto custom-scrollbar">
                {transcription.map((t, i) => (
                    <div key={i} className="space-y-2">
                        {t.user && (
                            <div className="flex justify-end">
                                <div className="bg-gray-700 text-gray-200 rounded-2xl rounded-tr-none px-4 py-2 max-w-[80%]">
                                    {t.user}
                                </div>
                            </div>
                        )}
                        {t.model && (
                            <div className="flex justify-start">
                                <div className="bg-blue-900/30 text-blue-100 border border-blue-500/30 rounded-2xl rounded-tl-none px-4 py-2 max-w-[80%]">
                                    {t.model}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                
                {/* Current Turn (Streaming) */}
                {(currentTurn.user || currentTurn.model) && (
                   <div className="space-y-2 opacity-70">
                        {currentTurn.user && (
                            <div className="flex justify-end">
                                <div className="bg-gray-700 text-gray-200 rounded-2xl rounded-tr-none px-4 py-2 max-w-[80%] italic">
                                    {currentTurn.user}...
                                </div>
                            </div>
                        )}
                        {currentTurn.model && (
                            <div className="flex justify-start">
                                <div className="bg-blue-900/30 text-blue-100 border border-blue-500/30 rounded-2xl rounded-tl-none px-4 py-2 max-w-[80%] italic">
                                    {currentTurn.model}...
                                </div>
                            </div>
                        )}
                   </div>
                )}
            </div>
            
            <div className="p-4 bg-gray-900 border-t border-gray-800 flex items-center justify-center gap-6">
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                     connected ? 'bg-red-500/20 animate-pulse' : 'bg-gray-800'
                 }`}>
                    <Mic size={32} className={connected ? 'text-red-500' : 'text-gray-500'} />
                 </div>
                 <div className="text-center">
                    <p className="text-sm font-medium text-gray-300">
                        {connected ? 'Listening...' : 'Ready to connect'}
                    </p>
                    <p className="text-xs text-gray-500">
                        {connected ? 'Speak naturally to Gemini' : 'Click connect to start'}
                    </p>
                 </div>
            </div>
        </div>
    </div>
  );
};

export default LiveSession;