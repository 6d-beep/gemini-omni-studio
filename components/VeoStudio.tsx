import React, { useState, useRef } from 'react';
import { generateVeoVideo, fetchVideoBlob } from '../services/geminiService';
import { Video, Upload, Loader2, Play } from 'lucide-react';

const VeoStudio: React.FC = () => {
  const [hasKey, setHasKey] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const fileRef = useRef<HTMLInputElement>(null);

  // Check API Key on mount
  React.useEffect(() => {
    const checkKey = async () => {
      try {
        if (window.aistudio && window.aistudio.hasSelectedApiKey) {
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasKey(selected);
        } else {
          // Fallback for env where window.aistudio might not be injected yet or mocked
          // We assume true if process.env.API_KEY is present in a standard dev environment,
          // but specific Veo instructions require the selector. 
          // If the user didn't select, we show the button.
          setHasKey(false); 
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio && window.aistudio.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasKey(true); // Assume success as per race condition mitigation instruction
    } else {
      alert("API Key Selector not available in this environment.");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => setImage(evt.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!prompt) return;
    setLoading(true);
    setVideoUrl(null);

    try {
      // Prepare image bytes if exists (strip base64 header)
      const imageBytes = image ? image.split(',')[1] : null;
      
      const uri = await generateVeoVideo(prompt, imageBytes, aspectRatio);
      
      // Fetch actual video data
      const blobUrl = await fetchVideoBlob(uri);
      setVideoUrl(blobUrl);

    } catch (err: any) {
      console.error("Veo Error", err);
      if (err.message && err.message.includes("Requested entity was not found")) {
        setHasKey(false); // Reset key state
        alert("API Key invalid or project not found. Please select a key again.");
      } else {
        alert("Video generation failed. This operation can take a few minutes.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (isCheckingKey) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  if (!hasKey) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="p-4 bg-gray-800 rounded-full">
           <Video size={48} className="text-purple-500" />
        </div>
        <h2 className="text-2xl font-bold">Veo Video Generation</h2>
        <p className="max-w-md text-gray-400">
          To generate videos with Veo, you need to select a paid Google Cloud Project API key.
        </p>
        <button
          onClick={handleSelectKey}
          className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-lg font-bold transition-colors"
        >
          Select API Key
        </button>
        <a 
          href="https://ai.google.dev/gemini-api/docs/billing" 
          target="_blank" 
          rel="noreferrer"
          className="text-purple-400 hover:underline text-sm"
        >
          Learn more about billing
        </a>
      </div>
    );
  }

  return (
    <div className="h-full p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold text-white">Veo Studio</h2>
          <div className="flex gap-2 text-sm bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setAspectRatio('16:9')}
              className={`px-3 py-1 rounded-md transition-colors ${aspectRatio === '16:9' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}
            >
              16:9
            </button>
            <button
              onClick={() => setAspectRatio('9:16')}
              className={`px-3 py-1 rounded-md transition-colors ${aspectRatio === '9:16' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}
            >
              9:16
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="space-y-6">
             <div 
               onClick={() => fileRef.current?.click()}
               className="border border-gray-700 border-dashed rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-800/50 transition-colors overflow-hidden relative"
             >
               {image ? (
                 <img src={image} alt="Reference" className="w-full h-full object-cover opacity-60" />
               ) : (
                 <div className="flex flex-col items-center text-gray-500">
                   <Upload size={32} className="mb-2" />
                   <span>Upload Start Image (Optional)</span>
                 </div>
               )}
               <input type="file" ref={fileRef} onChange={handleImageUpload} className="hidden" accept="image/png, image/jpeg" />
             </div>

             <div>
               <label className="block text-sm text-gray-400 mb-2">Video Prompt</label>
               <textarea
                 value={prompt}
                 onChange={(e) => setPrompt(e.target.value)}
                 placeholder="Describe the video you want to generate... (e.g. A neon hologram of a cat driving at top speed)"
                 className="w-full bg-gray-800 border border-gray-600 rounded-xl p-4 text-white focus:ring-2 focus:ring-purple-500 outline-none resize-none h-32"
               />
             </div>

             <button
               onClick={handleGenerate}
               disabled={loading || !prompt}
               className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2"
             >
               {loading ? (
                 <>
                   <Loader2 className="animate-spin" /> Generating (this may take minutes)...
                 </>
               ) : (
                 <>
                   <Video size={20} /> Generate Video
                 </>
               )}
             </button>
          </div>

          {/* Output */}
          <div className="bg-black rounded-xl border border-gray-800 flex items-center justify-center h-[500px] overflow-hidden relative">
             {videoUrl ? (
               <video 
                 src={videoUrl} 
                 controls 
                 autoPlay 
                 loop 
                 className="w-full h-full object-contain"
               />
             ) : (
               <div className="text-center text-gray-600 p-6">
                 {loading ? (
                   <div className="space-y-4">
                     <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto"></div>
                     <p className="animate-pulse text-purple-400">Veo is rendering frames...</p>
                     <p className="text-xs text-gray-500">Please do not close this tab.</p>
                   </div>
                 ) : (
                   <>
                     <Play size={48} className="mx-auto mb-4 opacity-20" />
                     <p>Generated video will appear here.</p>
                   </>
                 )}
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VeoStudio;