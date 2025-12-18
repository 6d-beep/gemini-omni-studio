
import React, { useState, useRef, useEffect } from 'react';
import { editImageWithPrompt, generateImage, extractTextFromImage } from '../services/geminiService';
import { 
  ImagePlus, Wand2, Loader2, Download, ArrowRight, Undo, Redo, 
  History, Sparkles, Archive, Settings2, Layers, Plus, Trash, 
  Save, FileUp, Play, CheckCircle2, AlertOctagon, LayoutGrid, X, Image as ImageIcon,
  FileText, Clock, RefreshCw, Eye, Copy, Printer, Bookmark, BookmarkPlus,
  Monitor, Smartphone, Maximize2, Settings, Edit3
} from 'lucide-react';

const DEFAULT_EXAMPLE_PROMPTS = [
  "Style: Cute paper cut soft and miniature diorama",
  "Style: Cute paper quilling soft and miniature diorama",
  "Style: Cute toys 3D and miniature diorama",
  "Style: Cute handcrafted knitted world and miniature diorama",
  "Buat gambar seperti buku mewarnai dan berbingkai",
  "Ubah menjadi lukisan cat air",
  "Tambahkan cahaya neon cyberpunk futuristik",
  "Ubah latar belakang menjadi malam berbintang",
  "Buat terlihat seperti sketsa pensil",
  "Ubah menjadi gaya seni piksel",
  "Buat terlihat seperti foto vintage"
];

// Declaration for JSZip from global scope (loaded via script tag)
declare const JSZip: any;

const HISTORY_STORAGE_KEY = 'gemini_img_edit_history_v1';
const PRESETS_STORAGE_KEY = 'gemini_edit_presets_v1';
const QUICK_PROMPTS_KEY = 'gemini_quick_prompts_v1';

type QualityLevel = 'low' | 'medium' | 'high';
type EditorMode = 'edit' | 'generate' | 'batch';

interface BatchItem {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: string;
  currentStep: number;
  error?: string;
  extractedText?: string;
}

interface Preset {
  id: string;
  name: string;
  steps: string[];
}

const ImageEditor: React.FC = () => {
  // Mode State
  const [editorMode, setEditorMode] = useState<EditorMode>('edit');

  // Quick Prompts State
  const [quickPrompts, setQuickPrompts] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(QUICK_PROMPTS_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_EXAMPLE_PROMPTS;
    } catch { return DEFAULT_EXAMPLE_PROMPTS; }
  });
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  // Single Editor State
  const [history, setHistory] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [processingDownload, setProcessingDownload] = useState(false);
  const [quality, setQuality] = useState<QualityLevel>('high');
  const [restoredSession, setRestoredSession] = useState(false);
  
  // Generation Options
  const [genConfig, setGenConfig] = useState<{
    aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9",
    imageSize: "1K" | "2K" | "4K"
  }>({
    aspectRatio: "1:1",
    imageSize: "1K"
  });

  // Single OCR State
  const [ocrResult, setOcrResult] = useState<string>('');
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch Editor State
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [editSteps, setEditSteps] = useState<string[]>(['']);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [enableOCR, setEnableOCR] = useState(false);
  const batchInputRef = useRef<HTMLInputElement>(null);

  // Load presets and History effect
  useEffect(() => {
    // Load Presets
    try {
      const savedPresets = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (savedPresets) setPresets(JSON.parse(savedPresets));
    } catch (e) { console.error(e); }

    // Load History (Auto-Restore)
    try {
      const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (parsed && Array.isArray(parsed.history) && parsed.history.length > 0) {
           setHistory(parsed.history);
           setCurrentStep(parsed.currentStep);
           setRestoredSession(true);
           setTimeout(() => setRestoredSession(false), 3000);
        }
      }
    } catch (e) { console.error(e); }
  }, []);

  // Save quick prompts
  useEffect(() => {
    localStorage.setItem(QUICK_PROMPTS_KEY, JSON.stringify(quickPrompts));
  }, [quickPrompts]);

  // Auto-Save History Effect
  useEffect(() => {
    if (history.length === 0) return;
    const saveState = () => {
      try {
        const stateToSave = { history, currentStep, timestamp: Date.now() };
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(stateToSave));
      } catch (e) { console.warn("Storage full"); }
    };
    const timeoutId = setTimeout(saveState, 1000);
    return () => clearTimeout(timeoutId);
  }, [history, currentStep]);

  // Auto-Save Presets Effect
  useEffect(() => {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  }, [presets]);

  const currentImage = currentStep >= 0 ? history[currentStep] : null;
  const originalImage = history.length > 0 ? history[0] : null;

  // --- Preset Handlers ---
  const saveCurrentAsPreset = () => {
    const validSteps = editSteps.filter(s => s.trim() !== '');
    if (validSteps.length === 0) {
      alert("Masukkan setidaknya satu langkah edit untuk disimpan sebagai preset.");
      return;
    }
    const name = window.prompt("Masukkan nama untuk preset ini:", `Preset ${presets.length + 1}`);
    if (name) {
      const newPreset: Preset = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        steps: validSteps
      };
      setPresets([...presets, newPreset]);
    }
  };

  const loadPreset = (preset: Preset) => {
    setEditSteps([...preset.steps]);
  };

  const deletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Hapus preset ini?")) {
      setPresets(presets.filter(p => p.id !== id));
    }
  };

  // --- Single Mode Handlers ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setHistory([result]);
        setCurrentStep(0);
        setPrompt('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProcess = async () => {
    if (!prompt || loading) return;
    setLoading(true);
    try {
      if (editorMode === 'generate') {
        const resultBase64 = await generateImage(prompt, genConfig);
        const newImage = `data:image/png;base64,${resultBase64}`;
        const newHistory = history.slice(0, currentStep + 1);
        newHistory.push(newImage);
        setHistory(newHistory);
        setCurrentStep(newHistory.length - 1);
        setPrompt('');
      } else {
        if (!currentImage) return;
        const parts = currentImage.split(',');
        const mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
        const base64Data = parts[1];
        const resultBase64 = await editImageWithPrompt(base64Data, prompt, mimeType);
        const newImage = `data:image/png;base64,${resultBase64}`;
        const newHistory = history.slice(0, currentStep + 1);
        newHistory.push(newImage);
        setHistory(newHistory);
        setCurrentStep(newHistory.length - 1);
        setPrompt('');
      }
    } catch (error) {
      console.error(error);
      alert(editorMode === 'generate' ? "Gagal membuat gambar." : "Gagal mengedit gambar.");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSingleOCR = async () => {
    if (!currentImage) return;
    setOcrLoading(true);
    try {
      const parts = currentImage.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
      const b64 = parts[1];
      const text = await extractTextFromImage(b64, mime);
      setOcrResult(text || "Tidak ada teks yang ditemukan.");
      setShowOcrModal(true);
    } catch (e) {
      alert("Gagal OCR.");
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSingleDownload = async () => {
    if (!currentImage) return;
    setProcessingDownload(true);
    try {
      const link = document.createElement('a');
      link.href = currentImage;
      link.download = `gemini-studio-${Date.now()}.png`;
      link.click();
    } finally {
      setProcessingDownload(false);
    }
  };

  // --- Batch Mode Handlers ---
  const handleBatchFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          setBatchItems(prev => [...prev, {
            id: Math.random().toString(36).substr(2, 9),
            file,
            preview: evt.target?.result as string,
            status: 'pending',
            currentStep: 0
          }]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const getCompressedImage = (base64Data: string, qLevel: QualityLevel): Promise<{ data: string, ext: string }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          let qValue = 0.92;
          if (qLevel === 'medium') qValue = 0.6;
          if (qLevel === 'low') qValue = 0.3;
          const newData = canvas.toDataURL('image/jpeg', qValue);
          resolve({ data: newData, ext: 'jpg' });
        } else {
           resolve({ data: base64Data, ext: 'png' });
        }
      };
      img.src = base64Data;
    });
  };

  const startBatchProcess = async () => {
    if (batchItems.length === 0 || isBatchProcessing) return;
    
    const validSteps = editSteps.filter(s => s.trim() !== '');
    if (validSteps.length === 0 && !enableOCR) {
        alert("Pilih setidaknya satu langkah edit atau aktifkan OCR.");
        return;
    }

    setIsBatchProcessing(true);
    
    const updatedItems = [...batchItems];
    const totalInternalSteps = validSteps.length + (enableOCR ? 1 : 0);

    for (let i = 0; i < updatedItems.length; i++) {
       if (updatedItems[i].status === 'completed') continue;
       
       updatedItems[i] = Object.assign({}, updatedItems[i], { status: 'processing', currentStep: 0 });
       setBatchItems([...updatedItems]);
       
       try {
          let currentB64 = updatedItems[i].preview.split(',')[1];
          let currentMime = updatedItems[i].preview.split(',')[0].match(/:(.*?);/)?.[1] || 'image/png';
          
          // Execute Edits
          for (let sIdx = 0; sIdx < validSteps.length; sIdx++) {
             updatedItems[i] = Object.assign({}, updatedItems[i], { currentStep: sIdx + 1 });
             setBatchItems([...updatedItems]);
             
             const stepPrompt = validSteps[sIdx];
             currentB64 = await editImageWithPrompt(currentB64, stepPrompt, currentMime);
          }
          
          let extracted = '';
          if (enableOCR) {
             updatedItems[i] = Object.assign({}, updatedItems[i], { currentStep: totalInternalSteps });
             setBatchItems([...updatedItems]);
             extracted = await extractTextFromImage(currentB64, currentMime);
          }
          
          updatedItems[i] = Object.assign({}, updatedItems[i], { 
             status: 'completed', 
             result: `data:image/png;base64,${currentB64}`,
             extractedText: extracted,
             currentStep: totalInternalSteps
          });
       } catch (e) {
          console.error(e);
          updatedItems[i] = Object.assign({}, updatedItems[i], { status: 'failed', error: 'Gagal diproses' });
       }
       setBatchItems([...updatedItems]);
    }
    
    setIsBatchProcessing(false);
  };

  const handleCopyAllText = () => {
    const texts = batchItems
      .filter(item => item.status === 'completed' && item.extractedText)
      .map(item => `--- ${item.file.name} ---\n${item.extractedText}`)
      .join('\n\n');

    if (!texts) return;
    navigator.clipboard.writeText(texts).then(() => alert("Teks berhasil disalin!"));
  };

  const downloadBatchZip = async () => {
    const completed = batchItems.filter(i => i.status === 'completed' && i.result);
    if (completed.length === 0) return;
    
    setProcessingDownload(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("batch_results");
      
      await Promise.all(completed.map(async (item) => {
        if (!item.result) return;
        const { data, ext } = await getCompressedImage(item.result, quality);
        const base64Data = data.split(',')[1];
        const name = item.file.name.split('.')[0];
        
        folder.file(`${name}_edited.${ext}`, base64Data as any, { base64: true });
        if (item.extractedText) {
             folder.file(`${name}_ocr_text.txt`, item.extractedText as any);
        }
      }));

      // Fixed: Explicitly type the result as Blob to satisfy URL.createObjectURL
      const zipBlob: Blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url; a.download = `batch_edits_${Date.now()}.zip`; a.click();
      URL.revokeObjectURL(url);
      setProcessingDownload(false);
    } catch (e) {
      console.error(e);
      alert("Gagal membuat ZIP.");
    } finally {
      setProcessingDownload(false);
    }
  };

  const handleUpdateQuickPrompt = (index: number, value: string) => {
    const newPrompts = [...quickPrompts];
    newPrompts[index] = value;
    setQuickPrompts(newPrompts);
  };

  const handleAddQuickPrompt = () => {
    setQuickPrompts(['New cool prompt...', ...quickPrompts]);
  };

  const handleDeleteQuickPrompt = (index: number) => {
    setQuickPrompts(quickPrompts.filter((_, i) => i !== index));
  };

  return (
    <div className="h-full flex flex-col bg-gray-950 overflow-hidden">
      {/* Hidden Print Container */}
      <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:z-[9999]">
         {currentImage && <img src={currentImage} className="w-full h-auto object-contain" alt="Print" />}
      </div>

      {/* Header Mode Switch */}
      <div className="shrink-0 bg-gray-900 border-b border-gray-800 p-4 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
           <div className="text-center sm:text-left">
             <h2 className="text-xl md:text-2xl font-bold text-white flex items-center justify-center sm:justify-start gap-2">
               <Wand2 className="text-green-400" size={24} />
               Gemini Omni-Image
             </h2>
             <p className="text-gray-400 text-xs md:text-sm">
               Kecerdasan Buatan Gemini 2.5 & 3.0 Pro
               {restoredSession && <span className="ml-2 text-green-400 animate-pulse text-[10px] uppercase font-bold">Dipulihkan</span>}
             </p>
           </div>
           
           <div className="flex bg-black/40 p-1 rounded-xl border border-gray-700 w-full sm:w-auto">
             <button
               onClick={() => setEditorMode('edit')}
               className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                 editorMode === 'edit' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-300'
               }`}
             >
               <Edit3 size={16} /> Edit
             </button>
             <button
               onClick={() => setEditorMode('generate')}
               className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                 editorMode === 'generate' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-300'
               }`}
             >
               <Sparkles size={16} /> Generate
             </button>
             <button
               onClick={() => setEditorMode('batch')}
               className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                 editorMode === 'batch' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-300'
               }`}
             >
               <Layers size={16} /> Batch
             </button>
           </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
          {editorMode !== 'batch' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
              
              {/* Left Column: Input / Options */}
              <div className="space-y-4 md:space-y-6">
                {editorMode === 'edit' ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl h-64 md:h-96 flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden group ${
                      originalImage ? 'border-gray-700 bg-black' : 'border-gray-800 hover:border-green-500 hover:bg-gray-900/50'
                    }`}
                  >
                    {originalImage ? (
                      <img src={originalImage} alt="Input" className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-center p-6">
                        <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                          <ImagePlus size={32} className="text-gray-500 group-hover:text-green-400" />
                        </div>
                        <p className="text-gray-400 font-bold text-sm">Unggah Gambar untuk Edit</p>
                        <p className="text-xs text-gray-600 mt-1">Mendukung JPG, PNG, WebP</p>
                      </div>
                    )}
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                  </div>
                ) : (
                  <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-xl space-y-6">
                    <h3 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-widest border-b border-gray-800 pb-3">
                      <Settings size={18} className="text-purple-400" /> Generation Options
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest mb-3">Aspect Ratio</label>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {(["1:1", "3:4", "4:3", "9:16", "16:9"] as const).map(ratio => (
                            <button
                              key={ratio}
                              onClick={() => setGenConfig(prev => ({ ...prev, aspectRatio: ratio }))}
                              className={`py-2 px-1 text-[10px] font-bold rounded-lg border transition-all ${
                                genConfig.aspectRatio === ratio ? 'bg-purple-600 border-purple-500 text-white' : 'bg-black border-gray-800 text-gray-500 hover:border-gray-600'
                              }`}
                            >
                              {ratio}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest mb-3">Image Size (Resolution)</label>
                        <div className="grid grid-cols-3 gap-3">
                          {(["1K", "2K", "4K"] as const).map(size => (
                            <button
                              key={size}
                              onClick={() => setGenConfig(prev => ({ ...prev, imageSize: size }))}
                              className={`py-3 px-2 text-xs font-black rounded-xl border transition-all flex flex-col items-center gap-1 ${
                                genConfig.imageSize === size ? 'bg-purple-600 border-purple-500 text-white shadow-lg' : 'bg-black border-gray-800 text-gray-500 hover:border-gray-600'
                              }`}
                            >
                              <Maximize2 size={16} />
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-gray-900/50 p-4 md:p-5 rounded-2xl border border-gray-800 shadow-xl space-y-4">
                  <div>
                    <label className="block text-[10px] uppercase font-black text-gray-500 tracking-widest mb-3">
                      {editorMode === 'generate' ? 'Generation Prompt' : 'Instruksi Pengeditan'}
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={editorMode === 'generate' ? "Jelaskan gambar yang ingin dibuat..." : "e.g. Tambahkan kacamata hitam..."}
                        className="flex-1 bg-black border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:ring-2 focus:ring-green-500 outline-none resize-none h-20"
                      />
                      <button 
                        onClick={handleProcess}
                        disabled={loading || !prompt || (editorMode === 'edit' && !currentImage)}
                        className={`px-6 py-3 rounded-xl font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1 shadow-lg disabled:opacity-30 ${
                          editorMode === 'generate' ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/20' : 'bg-green-600 hover:bg-green-500 shadow-green-900/20'
                        }`}
                      >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : (
                          <>
                            {editorMode === 'generate' ? <Sparkles size={24} /> : <Wand2 size={24} />}
                            <span className="text-[10px]">{editorMode === 'generate' ? 'Create' : 'Edit'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                       <p className="text-[10px] text-gray-600 font-bold uppercase tracking-tighter">Cepat Pilih / Presets:</p>
                       <button 
                        onClick={() => setShowPromptEditor(!showPromptEditor)}
                        className="p-1 text-gray-500 hover:text-white transition-colors"
                        title="Edit Quick Prompts"
                       >
                         {showPromptEditor ? <X size={14}/> : <Settings2 size={14}/>}
                       </button>
                    </div>

                    {showPromptEditor ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                        {quickPrompts.map((p, i) => (
                          <div key={i} className="flex gap-2 group/item">
                            <input 
                              type="text" 
                              value={p} 
                              onChange={(e) => handleUpdateQuickPrompt(i, e.target.value)}
                              className="flex-1 bg-black border border-gray-800 rounded-lg p-2 text-[11px] text-gray-300 focus:ring-1 focus:ring-green-500"
                            />
                            <button onClick={() => handleDeleteQuickPrompt(i)} className="p-1.5 text-gray-600 hover:text-red-400"><Trash size={14}/></button>
                          </div>
                        ))}
                        <button onClick={handleAddQuickPrompt} className="w-full py-2 border border-dashed border-gray-800 rounded-lg text-[10px] font-bold text-gray-500 hover:text-white hover:border-gray-600 flex items-center justify-center gap-1">
                          <Plus size={12}/> Tambah Baru
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {quickPrompts.map((ex, i) => (
                          <button 
                            key={i} onClick={() => setPrompt(ex)}
                            className="px-3 py-1.5 bg-gray-800/50 hover:bg-gray-700 border border-gray-700 rounded-lg text-[11px] text-gray-400 hover:text-white transition-colors"
                          >
                            {ex}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Output */}
              <div className="space-y-4 md:space-y-6">
                <div className="flex flex-wrap items-center justify-between bg-gray-900/80 p-3 rounded-2xl border border-gray-800 gap-3 shadow-lg">
                    <div className="flex items-center gap-2 px-2">
                      <History size={16} className="text-blue-400" />
                      <span className="text-xs text-gray-300 font-bold uppercase tracking-tight">Riwayat ({currentStep + 1}/{history.length})</span>
                    </div>
                    <div className="flex gap-1.5 items-center ml-auto">
                      <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep <= 0} className="p-2 hover:bg-gray-800 text-gray-400 hover:text-white disabled:opacity-20 transition-all rounded-lg" title="Undo"><Undo size={18} /></button>
                      <button onClick={() => setCurrentStep(Math.min(history.length - 1, currentStep + 1))} disabled={currentStep >= history.length - 1} className="p-2 hover:bg-gray-800 text-gray-400 hover:text-white disabled:opacity-20 transition-all rounded-lg" title="Redo"><Redo size={18} /></button>
                      <div className="w-px h-4 bg-gray-700 mx-1"></div>
                      <button onClick={() => { setHistory([]); setCurrentStep(-1); }} className="p-2 hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-all rounded-lg" title="Bersihkan"><Trash size={18}/></button>
                    </div>
                </div>

                <div className="border-2 border-gray-900 rounded-2xl h-64 md:h-96 flex items-center justify-center bg-black relative shadow-2xl overflow-hidden group">
                    {currentImage ? (
                      <div className="relative w-full h-full">
                          <img src={currentImage} alt="Preview" className={`w-full h-full object-contain ${loading ? 'opacity-30 blur-md' : ''}`} />
                          {loading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                              <div className={`w-16 h-16 border-4 rounded-full animate-spin mb-4 ${editorMode === 'generate' ? 'border-purple-500/30 border-t-purple-500' : 'border-green-500/30 border-t-green-500'}`}></div>
                              <p className={`text-xs font-black uppercase tracking-widest animate-pulse ${editorMode === 'generate' ? 'text-purple-400' : 'text-green-400'}`}>
                                {editorMode === 'generate' ? 'Menciptakan Mahakarya...' : 'Memproses Perubahan...'}
                              </p>
                            </div>
                          )}
                          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
                             <button onClick={handlePrint} className="bg-black/60 hover:bg-black p-2 rounded-full text-white backdrop-blur-md border border-white/10 shadow-xl" title="Cetak"><Printer size={18}/></button>
                             <button onClick={handleSingleOCR} className="bg-black/60 hover:bg-black p-2 rounded-full text-white backdrop-blur-md border border-white/10 shadow-xl" title="Ekstrak Teks"><FileText size={18}/></button>
                             <button 
                              onClick={() => { setQuickPrompts([prompt || "My Saved Prompt", ...quickPrompts]); alert("Tersimpan ke Quick Prompts!"); }}
                              className="bg-black/60 hover:bg-black p-2 rounded-full text-white backdrop-blur-md border border-white/10 shadow-xl"
                              title="Simpan Prompt ke Quick Prompts"
                             >
                               <BookmarkPlus size={18} />
                             </button>
                          </div>
                      </div>
                    ) : (
                      <div className="text-center p-10">
                        <ArrowRight size={40} className="text-gray-700 mx-auto mb-3" />
                        <p className="text-gray-700 text-sm font-bold uppercase">Hasil akan muncul di sini</p>
                      </div>
                    )}
                </div>
                
                {currentImage && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button 
                        onClick={handleSingleDownload}
                        disabled={processingDownload}
                        className="bg-gray-800 hover:bg-gray-700 text-white py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 border border-gray-700 shadow-lg"
                      >
                        {processingDownload ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />} Unduh Gambar
                      </button>
                      <button 
                        onClick={async () => {
                           setProcessingDownload(true);
                           const zip = new JSZip();
                           history.forEach((img, i) => zip.file(`step-${i}.png`, img.split(',')[1], {base64: true}));
                           // Explicitly type the result as Blob to satisfy URL.createObjectURL
                           const blob: Blob = await zip.generateAsync({type:"blob"});
                           const url = URL.createObjectURL(blob); 
                           const a = document.createElement('a');
                           a.href = url; a.download = "gemini_studio_history.zip"; a.click();
                           URL.revokeObjectURL(url);
                           setProcessingDownload(false);
                        }}
                        disabled={processingDownload}
                        className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                      >
                        {processingDownload ? <Loader2 className="animate-spin" size={18} /> : <Archive size={18} />} ZIP Riwayat
                      </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* --- BATCH MODE UI --- */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              <div className="lg:col-span-4 space-y-6">
                 <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800 shadow-xl">
                    <h3 className="text-sm font-black text-white mb-4 flex items-center gap-2 uppercase tracking-widest">
                      <FileUp size={16} className="text-blue-400" /> 1. Pilih Gambar
                    </h3>
                    <div 
                      onClick={() => batchInputRef.current?.click()}
                      className="border-2 border-dashed border-gray-800 hover:border-blue-500/50 hover:bg-blue-500/5 rounded-2xl p-8 text-center cursor-pointer transition-all group"
                    >
                      <ImagePlus size={32} className="text-gray-700 group-hover:text-blue-400 mx-auto mb-3" />
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-tighter">Klik untuk tambah file</p>
                      <input type="file" ref={batchInputRef} onChange={handleBatchFileChange} multiple className="hidden" accept="image/*" />
                    </div>
                    {batchItems.length > 0 && (
                      <div className="mt-4 flex items-center justify-between text-[10px] font-black text-gray-500 bg-black/40 p-3 rounded-xl border border-gray-800">
                         <span>{batchItems.length} GAMBAR TERPILIH</span>
                         <button onClick={() => setBatchItems([])} className="text-red-500 hover:text-red-400">HAPUS SEMUA</button>
                      </div>
                    )}
                 </div>

                 <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800 shadow-xl">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-widest">
                        <Layers size={16} className="text-purple-400" /> 2. Urutan Edit
                      </h3>
                      <div className="relative group/presets">
                        <button className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 transition-all">
                          <Bookmark size={16} />
                        </button>
                        <div className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl opacity-0 group-hover/presets:opacity-100 invisible group-hover/presets:visible transition-all z-50">
                           <div className="p-3 border-b border-gray-700 text-[10px] font-black uppercase text-gray-500 tracking-widest flex justify-between items-center">
                              Presets
                              <button onClick={saveCurrentAsPreset} className="text-blue-400 hover:text-blue-300"><Plus size={14}/></button>
                           </div>
                           <div className="max-h-48 overflow-y-auto custom-scrollbar">
                              {presets.length === 0 ? (
                                <div className="p-4 text-center text-xs text-gray-600">Belum ada preset</div>
                              ) : (
                                presets.map(p => (
                                  <div 
                                    key={p.id} 
                                    onClick={() => loadPreset(p)}
                                    className="p-3 hover:bg-gray-700 cursor-pointer flex justify-between items-center group/item"
                                  >
                                    <span className="text-xs text-gray-300 font-bold truncate pr-2">{p.name}</span>
                                    <button onClick={(e) => deletePreset(p.id, e)} className="text-gray-600 hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                      <Trash size={12} />
                                    </button>
                                  </div>
                                ))
                              )}
                           </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                       {editSteps.map((step, idx) => (
                         <div key={idx} className="flex gap-2">
                            <input 
                              type="text" value={step}
                              onChange={(e) => {
                                const s = [...editSteps]; s[idx] = e.target.value; setEditSteps(s);
                              }}
                              placeholder={`Langkah ${idx+1}...`}
                              className="flex-1 bg-black border border-gray-800 rounded-lg p-2 text-xs text-white focus:ring-1 focus:ring-purple-500 outline-none"
                            />
                            {editSteps.length > 1 && <button onClick={() => setEditSteps(editSteps.filter((_, i) => i !== idx))} className="text-gray-600 hover:text-red-400"><X size={16}/></button>}
                         </div>
                       ))}
                    </div>
                    <button onClick={() => setEditSteps([...editSteps, ''])} className="w-full py-2 border border-dashed border-gray-800 hover:border-gray-700 text-gray-500 text-[10px] font-black uppercase rounded-xl flex items-center justify-center gap-1 transition-colors"><Plus size={14}/> Tambah Langkah</button>
                    
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-800">
                      <input type="checkbox" id="ocr_batch" checked={enableOCR} onChange={(e) => setEnableOCR(e.target.checked)} className="rounded border-gray-700 bg-black text-blue-500" />
                      <label htmlFor="ocr_batch" className="text-xs text-gray-400 font-bold cursor-pointer flex items-center gap-1">
                        <FileText size={12} className="text-yellow-500" /> Ekstrak Teks (OCR) dari Hasil
                      </label>
                    </div>
                 </div>

                 <button
                   onClick={startBatchProcess}
                   disabled={isBatchProcessing || batchItems.length === 0}
                   className="w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 disabled:opacity-30 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-green-900/20 flex items-center justify-center gap-2"
                 >
                   {isBatchProcessing ? <Loader2 className="animate-spin" /> : <Play size={20} />} Mulai Proses
                 </button>
              </div>

              <div className="lg:col-span-8 space-y-4">
                 <div className="bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
                    <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-black/40">
                       <h3 className="text-xs font-black text-gray-300 flex items-center gap-2 uppercase tracking-widest"><LayoutGrid size={16} className="text-blue-400" /> Antrean ({batchItems.length})</h3>
                       <div className="flex gap-2">
                        <div className="flex items-center gap-2 mr-2 border-r border-gray-700 pr-2">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Kualitas:</span>
                          <select 
                            value={quality} 
                            onChange={(e) => setQuality(e.target.value as QualityLevel)}
                            className="bg-black border border-gray-700 rounded text-[10px] px-1 py-0.5 text-gray-300 outline-none"
                          >
                            <option value="high">Tinggi (HQ)</option>
                            <option value="medium">Sedang</option>
                            <option value="low">Rendah (Kecil)</option>
                          </select>
                        </div>
                        {batchItems.some(i => i.status === 'completed' && i.extractedText) && (
                            <button onClick={handleCopyAllText} className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5">
                                <Copy size={14} /> Salin Semua Teks
                            </button>
                        )}
                        {batchItems.some(i => i.status === 'completed') && (
                            <button onClick={downloadBatchZip} disabled={processingDownload} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-black uppercase transition-all shadow-lg shadow-blue-900/20 flex items-center gap-1.5">
                                {processingDownload ? <Loader2 className="animate-spin" size={14} /> : <Archive size={14} />} ZIP Hasil
                            </button>
                        )}
                       </div>
                    </div>
                    
                    <div className="p-4 min-h-[400px]">
                       {batchItems.length === 0 ? (
                         <div className="h-64 flex flex-col items-center justify-center text-gray-700 text-center">
                            <ImageIcon size={48} className="opacity-10 mb-2" />
                            <p className="text-xs font-bold uppercase tracking-widest opacity-20">Antrean Kosong</p>
                         </div>
                       ) : (
                         <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {batchItems.map((item) => {
                                const validStepsCount = editSteps.filter(s => s.trim()).length;
                                const totalInternalSteps = validStepsCount + (enableOCR ? 1 : 0);
                                const progress = item.status === 'completed' ? 100 : (item.currentStep / (totalInternalSteps || 1)) * 100;
                                
                                return (
                                <div key={item.id} className={`bg-black border rounded-xl overflow-hidden group relative transition-all ${item.status === 'completed' ? 'border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : item.status === 'failed' ? 'border-red-500/30' : 'border-gray-800'}`}>
                                    <div className="aspect-video bg-gray-900 relative">
                                        <img src={item.result || item.preview} className={`w-full h-full object-cover transition-opacity duration-300 ${item.status === 'processing' ? 'opacity-30' : 'opacity-80'}`} />
                                        
                                        {item.status === 'pending' && <div className="absolute inset-0 flex items-center justify-center"><Clock size={20} className="text-gray-700" /></div>}
                                        {item.status === 'processing' && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                                <Loader2 size={24} className="text-blue-500 animate-spin" />
                                                <span className="text-[10px] font-bold text-blue-400">{Math.round(progress)}%</span>
                                            </div>
                                        )}
                                        {item.status === 'completed' && (
                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => {
                                                        const link = document.createElement('a');
                                                        link.href = item.result!;
                                                        link.download = `result-${item.file.name}`;
                                                        link.click();
                                                    }}
                                                    className="bg-black/60 p-1.5 rounded-lg text-white hover:bg-black"
                                                >
                                                    <Download size={14} />
                                                </button>
                                            </div>
                                        )}
                                        {item.status === 'completed' && item.extractedText && (
                                            <div className="absolute bottom-2 right-2 bg-yellow-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded shadow-lg uppercase">OCR Ready</div>
                                        )}
                                    </div>
                                    <div className="p-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] font-black text-gray-500 truncate w-3/4">{item.file.name}</span>
                                            {!isBatchProcessing && <button onClick={() => setBatchItems(batchItems.filter(i => i.id !== item.id))} className="text-gray-700 hover:text-red-500"><X size={14}/></button>}
                                        </div>
                                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full transition-all duration-500 ${
                                                    item.status === 'completed' ? 'bg-green-500 w-full' : 
                                                    item.status === 'failed' ? 'border-red-500 w-full' : 
                                                    item.status === 'processing' ? 'bg-blue-600' : 'w-0'
                                                }`}
                                                style={{ width: item.status === 'processing' ? `${progress}%` : undefined }}
                                            ></div>
                                        </div>
                                        {item.error && <p className="text-[8px] text-red-500 mt-1 font-bold uppercase">{item.error}</p>}
                                    </div>
                                </div>
                                );
                            })}
                         </div>
                       )}
                    </div>
                 </div>
              </div>

            </div>
          )}
        </div>
      </div>
      
      {/* OCR Result Modal */}
      {showOcrModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-black/20">
               <h3 className="font-black text-white uppercase tracking-widest flex items-center gap-2"><FileText className="text-blue-400"/> Hasil OCR</h3>
               <button onClick={() => setShowOcrModal(false)} className="text-gray-500 hover:text-white"><X size={24}/></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-black/40">
               <pre className="text-xs md:text-sm text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">{ocrResult}</pre>
            </div>
            <div className="p-4 border-t border-gray-800 bg-black/20 flex justify-end gap-3">
               <button onClick={() => {navigator.clipboard.writeText(ocrResult); alert("Disalin!");}} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all"><Copy size={16}/> Salin</button>
               <button onClick={() => setShowOcrModal(false)} className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase">Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageEditor;
