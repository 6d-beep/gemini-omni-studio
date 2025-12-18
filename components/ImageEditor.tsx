import React, { useState, useRef, useEffect } from 'react';
import { editImageWithPrompt, extractTextFromImage } from '../services/geminiService';
import { 
  ImagePlus, Wand2, Loader2, Download, ArrowRight, Undo, Redo, 
  History, Sparkles, Archive, Settings2, Layers, Plus, Trash, 
  Save, FileUp, Play, CheckCircle2, AlertOctagon, LayoutGrid, X, Image as ImageIcon,
  FileText, Clock, RefreshCw, ChevronRight, Eye, Copy, Printer
} from 'lucide-react';

const EXAMPLE_PROMPTS = [
  "Ubah menjadi lukisan cat air",
  "Tambahkan cahaya neon cyberpunk futuristik",
  "Ubah latar belakang menjadi malam berbintang",
  "Buat terlihat seperti sketsa pensil",
  "Tambahkan topi lucu ke subjek",
  "Ubah musim menjadi musim dingin bersalju",
  "Ubah menjadi gaya seni piksel",
  "Buat terlihat seperti foto vintage"
];

// Declaration for JSZip from global scope (loaded via script tag)
declare const JSZip: any;

const HISTORY_STORAGE_KEY = 'gemini_img_edit_history_v1';

type QualityLevel = 'low' | 'medium' | 'high';

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
  const [mode, setMode] = useState<'single' | 'batch'>('single');

  // Single Editor State
  const [history, setHistory] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [processingDownload, setProcessingDownload] = useState(false);
  const [quality, setQuality] = useState<QualityLevel>('high');
  const [restoredSession, setRestoredSession] = useState(false);
  
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
      const savedPresets = localStorage.getItem('gemini_edit_presets');
      if (savedPresets) setPresets(JSON.parse(savedPresets));
    } catch (e) { console.error(e); }

    // Load History (Auto-Restore)
    try {
      const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (parsed && Array.isArray(parsed.history) && parsed.history.length > 0 && typeof parsed.currentStep === 'number') {
           setHistory(parsed.history);
           setCurrentStep(parsed.currentStep);
           setRestoredSession(true);
           // Clear the restored flag after a moment
           setTimeout(() => setRestoredSession(false), 3000);
        }
      }
    } catch (e) {
      console.error("Failed to restore session", e);
    }
  }, []);

  // Auto-Save History Effect
  useEffect(() => {
    if (history.length === 0) return;

    const saveState = () => {
      try {
        const stateToSave = {
          history,
          currentStep,
          timestamp: Date.now()
        };
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(saveState));
      } catch (e) {
        console.warn("LocalStorage full, attempting to save compact state...");
        try {
          // Fallback: Save only original and current state to save space
          // This prevents losing work even if full undo stack can't be saved
          const compactHistory = [history[0]]; 
          
          // Only add current if it's different from original
          const currentImg = history[currentStep];
          if (currentImg && currentImg !== history[0]) {
             compactHistory.push(currentImg);
          }

          const compactState = {
            history: compactHistory,
            currentStep: compactHistory.length - 1,
            timestamp: Date.now()
          };
          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(compactState));
        } catch (innerE) {
          console.error("Failed to save state even in compact mode. Storage likely full.", innerE);
        }
      }
    };

    // Debounce save to avoid blocking UI with heavy JSON serialization
    const timeoutId = setTimeout(saveState, 1000);
    return () => clearTimeout(timeoutId);
  }, [history, currentStep]);

  // Keyboard Shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'single') return;
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            // Ctrl+Shift+Z = Redo
            if (currentStep < history.length - 1) setCurrentStep(prev => prev + 1);
          } else {
            // Ctrl+Z = Undo
            if (currentStep > 0) setCurrentStep(prev => prev - 1);
          }
        } else if (e.key.toLowerCase() === 'y') {
          // Ctrl+Y = Redo
          e.preventDefault();
          if (currentStep < history.length - 1) setCurrentStep(prev => prev + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, currentStep, history.length]);

  const savePresetsToStorage = (newPresets: Preset[]) => {
    setPresets(newPresets);
    localStorage.setItem('gemini_edit_presets', JSON.stringify(newPresets));
  };

  const originalImage = history.length > 0 ? history[0] : null;
  const currentImage = currentStep >= 0 ? history[currentStep] : null;

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
        // We explicitly don't clear local storage here; the useEffect will overwrite it shortly
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearHistory = () => {
    if(confirm("Apakah Anda yakin? Ini akan menghapus semua riwayat pengeditan.")) {
        setHistory([]);
        setCurrentStep(-1);
        setPrompt('');
        localStorage.removeItem(HISTORY_STORAGE_KEY);
    }
  };

  const handleEdit = async () => {
    if (!currentImage || !prompt) return;
    setLoading(true);
    try {
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
    } catch (error) {
      console.error(error);
      alert("Gagal mengedit gambar. Coba instruksi yang berbeda.");
    } finally {
      setLoading(false);
    }
  };

  const handleSingleOCR = async () => {
    if (!currentImage) return;
    setOcrLoading(true);
    try {
      const parts = currentImage.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
      const b64 = parts[1];
      const text = await extractTextFromImage(b64, mime);
      setOcrResult(text || "Tidak ada teks yang ditemukan pada gambar.");
      setShowOcrModal(true);
    } catch (e) {
      console.error(e);
      alert("Gagal mengekstrak teks dari gambar.");
    } finally {
      setOcrLoading(false);
    }
  };

  const handlePrint = () => {
    if (!currentImage) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Print Image - Omni Studio</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background-color: #fff; }
              img { max-width: 100%; max-height: 100vh; object-fit: contain; }
              @media print { 
                @page { margin: 0; size: auto; }
                body { -webkit-print-color-adjust: exact; } 
              }
            </style>
          </head>
          <body>
            <img src="${currentImage}" onload="setTimeout(() => { window.print(); window.close(); }, 500)" />
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleUndo = () => {
    if (currentStep > 0) setCurrentStep(prev => prev + 1);
  };

  const handleRedo = () => {
    if (currentStep < history.length - 1) setCurrentStep(prev => prev + 1);
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

  const handleSingleDownload = async () => {
    if (!currentImage) return;
    setProcessingDownload(true);
    try {
      const { data, ext } = await getCompressedImage(currentImage, quality);
      const link = document.createElement('a');
      link.href = data;
      link.download = `gemini-edit-${currentStep}-${quality}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Download failed", e);
      alert("Gagal memproses gambar untuk diunduh.");
    } finally {
      setProcessingDownload(false);
    }
  };

  const handleDownloadZip = async () => {
    if (history.length === 0) return;
    setProcessingDownload(true);
    try {
      if (typeof JSZip === 'undefined') {
        alert("Pustaka Zip sedang dimuat. Silakan coba lagi sebentar lagi.");
        return;
      }
      const zip = new JSZip();
      await Promise.all(history.map(async (imgData, index) => {
        const { data, ext } = await getCompressedImage(imgData, quality);
        const base64Data = data.split(',')[1];
        const filename = index === 0 ? `original-${quality}.${ext}` : `edit_step_${index}-${quality}.${ext}`;
        zip.file(filename, base64Data, { base64: true });
      }));
      // Fix: Ensure zipBlob is correctly typed as Blob by casting from the generic generateAsync promise.
      const zipBlob = (await zip.generateAsync({ type: 'blob' })) as any;
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gemini_edit_history_${quality}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Zip generation failed", error);
      alert("Gagal membuat berkas zip.");
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
      if (batchInputRef.current) batchInputRef.current.value = '';
    }
  };

  const removeBatchItem = (id: string) => {
    setBatchItems(prev => prev.filter(item => item.id !== id));
  };

  const addEditStep = () => setEditSteps(prev => [...prev, '']);
  const removeEditStep = (index: number) => setEditSteps(prev => prev.filter((_, i) => i !== index));
  const updateEditStep = (index: number, value: string) => {
    const newSteps = [...editSteps];
    newSteps[index] = value;
    setEditSteps(newSteps);
  };

  const savePreset = () => {
    const validSteps = editSteps.filter(s => s.trim() !== '');
    if (validSteps.length === 0) {
      alert("Tambahkan setidaknya satu langkah edit sebelum menyimpan.");
      return;
    }
    // Fix: Explicitly use window.prompt because the state variable 'prompt' shadows the global function.
    const name = window.prompt("Masukkan nama untuk preset ini:");
    if (name) {
      const existingIndex = presets.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
      
      if (existingIndex !== -1) {
         if (confirm(`Preset "${name}" sudah ada. Apakah Anda ingin menimpanya?`)) {
            const updatedPresets = [...presets];
            updatedPresets[existingIndex] = {
               ...updatedPresets[existingIndex],
               steps: validSteps
            };
            savePresetsToStorage(updatedPresets);
         }
      } else {
          const newPreset: Preset = {
            id: Date.now().toString(),
            name,
            steps: validSteps
          };
          savePresetsToStorage([...presets, newPreset]);
      }
    }
  };

  const handleLoadPreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetId = e.target.value;
    if (!presetId) return;
    
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
        setEditSteps([...preset.steps]);
    }
    // Reset selection to allow re-selection
    e.target.value = "";
  };

  const deletePreset = (e: React.MouseEvent, presetId: string) => {
    e.stopPropagation(); 
  };

  const runBatchProcessing = async () => {
    const validSteps = editSteps.filter(s => s.trim() !== '');
    // Allow processing if either we have steps OR OCR is enabled
    if ((validSteps.length === 0 && !enableOCR) || batchItems.length === 0) return;

    setIsBatchProcessing(true);
    
    // Process items sequentially to avoid rate limits
    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      if (item.status === 'completed') continue; // Skip already done

      setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'processing', currentStep: 0, error: undefined, extractedText: undefined } : p));

      try {
        let currentData = item.preview;
        let stepCount = 0;
        
        // Editing Steps
        for (let stepIndex = 0; stepIndex < validSteps.length; stepIndex++) {
           stepCount++;
           setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, currentStep: stepCount } : p));

           const stepPrompt = validSteps[stepIndex];
           
           // Extract base64
           const parts = currentData.split(',');
           const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
           const b64 = parts[1];
           
           const res = await editImageWithPrompt(b64, stepPrompt, mime);
           currentData = `data:image/png;base64,${res}`;
        }
        
        // OCR Step
        let textResult = undefined;
        if (enableOCR) {
           stepCount++;
           setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, currentStep: stepCount } : p));
           
           const parts = currentData.split(',');
           const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
           const b64 = parts[1];
           textResult = await extractTextFromImage(b64, mime);
        }
        
        setBatchItems(prev => prev.map(p => p.id === item.id ? { 
            ...p, 
            status: 'completed', 
            result: currentData,
            extractedText: textResult
        } : p));

      } catch (err: any) {
        console.error(err);
        setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'failed', error: err.message || "Gagal" } : p));
      }
    }
    
    setIsBatchProcessing(false);
  };

  const downloadBatchResults = async () => {
    const completed = batchItems.filter(i => i.status === 'completed' && i.result);
    if (completed.length === 0) return;
    
    setProcessingDownload(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("batch_edits");
      
      await Promise.all(completed.map(async (item, idx) => {
        if (!item.result) return;
        const { data, ext } = await getCompressedImage(item.result, quality);
        const base64Data = data.split(',')[1];
        const name = item.file.name.split('.')[0];
        folder.file(`${name}_edited.${ext}`, base64Data, { base64: true });
        
        if (item.extractedText) {
             folder.file(`${name}_text.txt`, item.extractedText);
        }
      }));

      // Fix: Ensure zipBlob is correctly typed as Blob by casting from the generic generateAsync promise.
      const zipBlob = (await zip.generateAsync({ type: 'blob' })) as any;
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gemini_batch_results_${new Date().getTime()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Gagal meng-zip hasil batch.");
    } finally {
      setProcessingDownload(false);
    }
  };

  const handleCopyAllText = () => {
    const texts = batchItems
      .filter(item => item.status === 'completed' && item.extractedText)
      .map(item => `--- ${item.file.name} ---\n${item.extractedText}`)
      .join('\n\n');

    if (!texts) return;

    navigator.clipboard.writeText(texts).then(() => {
      alert("Semua hasil teks (OCR) berhasil disalin ke clipboard!");
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* Header / Mode Switch */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 p-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
           <div>
             <h2 className="text-2xl font-bold text-white flex items-center gap-2">
               <Wand2 className="text-green-400" />
               Editor Ajaib
             </h2>
             <p className="text-gray-400 text-sm flex items-center gap-2">
               Ubah gambar dengan Gemini 2.5 Flash
               {restoredSession && (
                 <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full border border-green-800/50 flex items-center gap-1 animate-pulse">
                   <RefreshCw size={10} /> Sesi Dipulihkan
                 </span>
               )}
             </p>
           </div>
           
           <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700">
             <button
               onClick={() => setMode('single')}
               className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
                 mode === 'single' ? 'bg-green-600 text-white shadow' : 'text-gray-400 hover:text-white'
               }`}
             >
               <ImageIcon size={16} /> Satu Gambar
             </button>
             <button
               onClick={() => setMode('batch')}
               className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
                 mode === 'batch' ? 'bg-green-600 text-white shadow' : 'text-gray-400 hover:text-white'
               }`}
             >
               <Layers size={16} /> Pemrosesan Batch
             </button>
           </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-6xl mx-auto h-full">
          
          {mode === 'single' ? (
            /* --- SINGLE MODE UI --- */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start h-full">
               {/* Input Column */}
              <div className="space-y-6">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl h-96 flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden group ${
                    originalImage ? 'border-gray-600 bg-black' : 'border-gray-700 hover:border-green-500 hover:bg-gray-800/50'
                  }`}
                >
                  {originalImage ? (
                    <img src={originalImage} alt="Original" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center p-6">
                      <ImagePlus size={48} className="mx-auto mb-4 text-gray-500 group-hover:text-green-400 transition-colors" />
                      <p className="text-gray-400 font-medium">Klik untuk unggah gambar</p>
                      <p className="text-sm text-gray-600 mt-2">Mendukung JPG, PNG, WebP, HEIC</p>
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                    accept="image/png, image/jpeg, image/webp, image/heic, image/heif"
                  />
                  {originalImage && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <p className="text-white font-semibold">Klik untuk ganti gambar dasar</p>
                    </div>
                  )}
                </div>

                <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                  <label className="block text-sm text-gray-400 mb-2">Instruksi Edit</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
                      placeholder="contoh, 'Tambahkan filter retro', 'Ubah kucing jadi harimau'"
                      className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-green-500 outline-none"
                    />
                    <button 
                      onClick={handleEdit}
                      disabled={!currentImage || !prompt || loading}
                      className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                      {loading ? <Loader2 className="animate-spin" /> : <Wand2 size={20} />}
                    </button>
                  </div>

                  {/* Example Prompts */}
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={12} className="text-yellow-400" />
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Coba contoh ini:</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {EXAMPLE_PROMPTS.map((ex, i) => (
                        <button 
                          key={i}
                          onClick={() => setPrompt(ex)}
                          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-gray-500 rounded-lg text-xs text-gray-300 transition-colors"
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Output Column */}
              <div className="space-y-6">
                {/* Toolbar */}
                <div className="flex items-center justify-between bg-gray-800 p-3 rounded-xl border border-gray-700">
                    <div className="flex items-center gap-2">
                      <History size={18} className="text-gray-400" />
                      <span className="text-sm text-gray-300 font-medium">
                          Riwayat Edit ({currentStep + 1}/{history.length})
                      </span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={handleClearHistory}
                        disabled={history.length === 0}
                        className="p-2 hover:bg-gray-700 rounded-lg text-gray-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors hover:text-red-400"
                        title="Hapus Riwayat"
                      >
                         <Trash size={20} />
                      </button>
                      <div className="w-px h-6 bg-gray-600 mx-1"></div>
                      <button
                        onClick={handleDownloadZip}
                        disabled={history.length === 0 || processingDownload}
                        className="p-2 hover:bg-gray-700 rounded-lg text-gray-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center gap-1"
                        title="Unduh Semua Riwayat (ZIP)"
                      >
                        {processingDownload ? <Loader2 size={20} className="animate-spin" /> : <Archive size={20} />}
                      </button>
                      <div className="w-px h-6 bg-gray-600 mx-1"></div>
                      <button
                        onClick={handleUndo}
                        disabled={currentStep <= 0}
                        className="p-2 hover:bg-gray-700 rounded-lg text-gray-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        title="Urung (Ctrl+Z)"
                      >
                        <Undo size={20} />
                      </button>
                      <button
                        onClick={handleRedo}
                        disabled={currentStep >= history.length - 1}
                        className="p-2 hover:bg-gray-700 rounded-lg text-gray-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        title="Ulang (Ctrl+Y)"
                      >
                        <Redo size={20} />
                      </button>
                    </div>
                </div>

                <div className={`border-2 border-gray-800 rounded-2xl h-96 flex flex-col items-center justify-center bg-black relative`}>
                    {currentImage ? (
                      <div className="relative w-full h-full">
                          <img src={currentImage} alt="Versi Saat Ini" className={`w-full h-full object-contain ${loading ? 'opacity-50 blur-sm' : ''}`} />
                          {loading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <Loader2 size={48} className="animate-spin text-green-500 mb-4" />
                              <p className="text-white font-medium animate-pulse">Memproses...</p>
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="text-center p-6 text-gray-600">
                        <div className="flex flex-col items-center">
                            <ArrowRight size={48} className="mb-4 opacity-20" />
                            <p>Gambar yang diunggah akan muncul di sini.</p>
                        </div>
                      </div>
                    )}
                </div>
                
                {currentImage && (
                  <div className="bg-gray-800 p-3 rounded-xl border border-gray-700 space-y-3">
                      <div className="flex flex-wrap items-center justify-between text-sm gap-2">
                        <div className="flex items-center gap-2">
                          <Settings2 size={16} className="text-gray-400" />
                          <span className="text-gray-300 font-medium">Kualitas Unduhan:</span>
                        </div>
                        <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-600">
                            {(['low', 'medium', 'high'] as const).map((q) => (
                              <button
                                key={q}
                                onClick={() => setQuality(q)}
                                className={`px-3 py-1 rounded-md text-xs font-bold capitalize transition-all ${
                                    quality === q ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                                }`}
                              >
                                {q}
                              </button>
                            ))}
                        </div>
                      </div>
                      
                      <button 
                        onClick={handleSingleOCR}
                        disabled={processingDownload || ocrLoading}
                        className="block w-full bg-blue-600 hover:bg-blue-500 text-center py-3 rounded-xl border border-blue-500 hover:border-blue-400 text-white transition-all flex items-center justify-center gap-2 font-medium"
                      >
                        {ocrLoading ? <Loader2 size={20} className="animate-spin" /> : <FileText size={20} />}
                        Ekstrak Teks (OCR)
                      </button>

                      <button 
                        onClick={handlePrint}
                        disabled={processingDownload}
                        className="block w-full bg-purple-600 hover:bg-purple-500 text-center py-3 rounded-xl border border-purple-500 hover:border-purple-400 text-white transition-all flex items-center justify-center gap-2 font-medium"
                      >
                        <Printer size={20} />
                        Cetak Gambar
                      </button>

                      <button 
                        onClick={handleSingleDownload}
                        disabled={processingDownload}
                        className="block w-full bg-gray-700 hover:bg-gray-600 text-center py-3 rounded-xl border border-gray-600 hover:border-gray-500 text-white transition-all flex items-center justify-center gap-2 font-medium"
                      >
                        {processingDownload ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
                        Unduh ({quality.charAt(0).toUpperCase() + quality.slice(1)})
                      </button>

                      <button 
                        onClick={handleDownloadZip}
                        disabled={history.length === 0 || processingDownload}
                        className="block w-full bg-gray-800 hover:bg-gray-700 text-center py-3 rounded-xl border border-gray-600 hover:border-gray-500 text-gray-300 transition-all flex items-center justify-center gap-2 font-medium"
                      >
                        {processingDownload ? <Loader2 size={20} className="animate-spin" /> : <Archive size={20} />}
                        Unduh Riwayat (ZIP)
                      </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* --- BATCH MODE UI --- */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
              
              {/* Left Panel: Configuration */}
              <div className="lg:col-span-4 space-y-6">
                 
                 {/* 1. Upload Section */}
                 <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                    <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                      <FileUp size={18} className="text-blue-400" /> 1. Unggah Gambar
                    </h3>
                    <div 
                      onClick={() => batchInputRef.current?.click()}
                      className="border-2 border-dashed border-gray-600 hover:border-blue-500 hover:bg-gray-700/50 rounded-xl p-6 text-center cursor-pointer transition-colors"
                    >
                      <ImagePlus size={32} className="mx-auto mb-2 text-gray-500" />
                      <p className="text-sm text-gray-300">Klik untuk memilih banyak gambar</p>
                      <input 
                        type="file" 
                        ref={batchInputRef} 
                        onChange={handleBatchFileChange} 
                        multiple 
                        className="hidden" 
                        accept="image/png, image/jpeg, image/webp, image/heic, image/heif"
                      />
                    </div>
                    {batchItems.length > 0 && (
                      <div className="mt-4 flex items-center justify-between text-sm text-gray-400 bg-gray-900 p-2 rounded-lg">
                         <span>{batchItems.length} gambar dipilih</span>
                         <button onClick={() => setBatchItems([])} className="text-red-400 hover:text-red-300">Hapus Semua</button>
                      </div>
                    )}
                 </div>

                 {/* 2. Sequence Editor */}
                 <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                       <h3 className="font-bold text-white flex items-center gap-2">
                         <Layers size={18} className="text-purple-400" /> 2. Urutan Edit
                       </h3>
                       {/* Preset Controls */}
                       <div className="flex gap-2 items-center">
                          <select 
                            onChange={handleLoadPreset}
                            className="bg-gray-900 text-white text-xs rounded border border-gray-600 outline-none py-1.5 pl-2 pr-8 w-32 cursor-pointer hover:border-gray-500 transition-colors appearance-none"
                            defaultValue=""
                            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em` }}
                          >
                             <option value="" disabled>Muat Preset...</option>
                             {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <button 
                            onClick={savePreset} 
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 hover:border-blue-500 rounded text-xs text-blue-200 hover:text-white transition-colors font-medium" 
                            title="Simpan urutan saat ini sebagai preset"
                          >
                            <Save size={14}/> Simpan
                          </button>
                       </div>
                    </div>

                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                       {editSteps.map((step, idx) => (
                         <div key={idx} className="flex gap-2">
                            <span className="text-xs font-bold text-gray-500 pt-3 w-4">{idx+1}.</span>
                            <div className="flex-1">
                               <input 
                                 type="text" 
                                 value={step}
                                 onChange={(e) => updateEditStep(idx, e.target.value)}
                                 placeholder={`Instruksi Langkah ${idx+1}...`}
                                 className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white focus:ring-1 focus:ring-purple-500 outline-none"
                               />
                            </div>
                            {editSteps.length > 1 && (
                              <button onClick={() => removeEditStep(idx)} className="text-gray-500 hover:text-red-400">
                                <Trash size={16} />
                              </button>
                            )}
                         </div>
                       ))}
                    </div>

                    <button 
                      onClick={addEditStep}
                      className="w-full py-2 border border-dashed border-gray-600 hover:border-gray-500 text-gray-400 text-sm rounded-lg flex items-center justify-center gap-1"
                    >
                      <Plus size={14} /> Tambah Langkah
                    </button>

                    <div className="flex items-center gap-2 pt-2 border-t border-gray-700 mt-2">
                      <input 
                        type="checkbox" 
                        id="enableOCR" 
                        checked={enableOCR} 
                        onChange={(e) => setEnableOCR(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500"
                      />
                      <label htmlFor="enableOCR" className="text-sm text-gray-300 flex items-center gap-2 cursor-pointer">
                         <FileText size={14} className="text-yellow-400" />
                         Ekstrak Teks (OCR) dari Hasil
                      </label>
                    </div>
                 </div>

                 {/* 3. Actions */}
                 <button
                   onClick={runBatchProcessing}
                   disabled={isBatchProcessing || batchItems.length === 0}
                   className="w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 disabled:opacity-50 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2"
                 >
                   {isBatchProcessing ? <Loader2 className="animate-spin" /> : <Play size={20} />}
                   {isBatchProcessing ? 'Memproses Batch...' : 'Proses Semua Gambar'}
                 </button>
              </div>

              {/* Right Panel: Grid & Results */}
              <div className="lg:col-span-8 flex flex-col h-[600px] lg:h-auto bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-2xl">
                 <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                    <h3 className="font-bold text-white flex items-center gap-2">
                       <LayoutGrid size={18} className="text-blue-400" /> Antrean Batch
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCopyAllText}
                        disabled={isBatchProcessing || !batchItems.some(i => i.extractedText)}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                        title="Salin semua teks hasil OCR ke Clipboard"
                      >
                        <Copy size={16} /> <span className="hidden sm:inline">Salin Teks</span>
                      </button>
                      <button
                        onClick={downloadBatchResults}
                        disabled={isBatchProcessing || !batchItems.some(i => i.status === 'completed')}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-gray-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                      >
                        {processingDownload ? <Loader2 className="animate-spin" size={16} /> : <Archive size={16} />}
                        <span className="hidden sm:inline">Unduh ZIP</span>
                      </button>
                    </div>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-900/50">
                    {batchItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-gray-700 rounded-xl m-4 bg-gray-800/30">
                         <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-6 shadow-inner">
                            <Layers size={40} className="text-gray-600" />
                         </div>
                         <h4 className="text-lg font-bold text-gray-300 mb-2">Antrean Batch Kosong</h4>
                         <p className="max-w-xs text-center text-sm">Unggah gambar dari panel kiri untuk mulai memproses banyak berkas sekaligus.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                         {batchItems.map((item) => {
                           // Calculate total steps including optional OCR
                           const validSteps = editSteps.filter(s => s.trim());
                           const stepsCount = validSteps.length;
                           const totalSteps = (stepsCount === 0 && !enableOCR) ? 1 : stepsCount + (enableOCR ? 1 : 0);
                           
                           // Determine current action text with Step Counting
                           let currentActionText = "";
                           if (item.status === 'processing') {
                               if (item.currentStep <= stepsCount && item.currentStep > 0) {
                                   currentActionText = `Langkah ${item.currentStep}/${totalSteps}: ${validSteps[item.currentStep - 1]}`;
                               } else if (enableOCR && item.currentStep > stepsCount) {
                                   currentActionText = `Langkah ${item.currentStep}/${totalSteps}: Ekstrak Teks (OCR)...`;
                               }
                           } else if (item.status === 'completed') {
                               currentActionText = "Pemrosesan Selesai";
                           } else if (item.status === 'failed') {
                               currentActionText = "Operasi Gagal";
                           } else {
                               currentActionText = "Menunggu mulai...";
                           }

                           return (
                           <div key={item.id} className={`bg-gray-900 rounded-xl border-2 overflow-hidden relative group transition-all duration-300 ${
                                item.status === 'completed' ? 'border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.15)]' :
                                item.status === 'failed' ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]' :
                                item.status === 'processing' ? 'border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)] scale-[1.02] z-10' :
                                'border-gray-800 hover:border-gray-700'
                           }`}>
                              {/* Remove Button (only pending) */}
                              {item.status === 'pending' && (
                                <button 
                                  onClick={() => removeBatchItem(item.id)}
                                  className="absolute top-2 left-2 z-30 bg-black/60 hover:bg-red-600/90 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                                >
                                  <X size={14} />
                                </button>
                              )}

                              {/* Action Buttons (Download / Retry) */}
                              <div className="absolute bottom-2 right-2 flex gap-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {item.status === 'completed' && item.result && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const link = document.createElement('a');
                                        link.href = item.result!;
                                        link.download = `edited_${item.file.name}`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                      }}
                                      className="bg-gray-800/90 hover:bg-blue-600 text-white p-2 rounded-lg backdrop-blur-sm border border-gray-600 shadow-lg"
                                      title="Unduh Gambar"
                                    >
                                      <Download size={16} />
                                    </button>
                                  )}
                                  {item.status === 'failed' && (
                                     <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'pending', error: undefined, currentStep: 0 } : p));
                                      }}
                                      className="bg-gray-800/90 hover:bg-green-600 text-white p-2 rounded-lg backdrop-blur-sm border border-gray-600 shadow-lg"
                                      title="Coba Lagi"
                                    >
                                      <RefreshCw size={16} />
                                    </button>
                                  )}
                              </div>

                              <div className="aspect-square relative bg-black/20">
                                 <img 
                                   src={item.result || item.preview} 
                                   alt="Pratinjau" 
                                   className={`w-full h-full object-cover transition-all duration-500 ${item.status === 'processing' ? 'blur-[3px] opacity-60 scale-105' : ''}`} 
                                 />

                                 {/* Processing Overlay */}
                                 {item.status === 'processing' && (
                                     <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                                          <div className="relative">
                                            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Wand2 size={16} className="text-blue-400 animate-pulse" />
                                            </div>
                                          </div>
                                          <span className="mt-3 text-xs font-bold text-blue-100 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-sm border border-blue-500/30 animate-pulse">Memproses...</span>
                                     </div>
                                 )}

                                 {/* Compare Hover (Success only) */}
                                 {item.status === 'completed' && item.result && (
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-crosshair">
                                       <img src={item.preview} alt="Asli" className="w-full h-full object-cover" />
                                       <div className="absolute bottom-2 left-2 bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-md border border-white/20 uppercase tracking-wider shadow-lg flex items-center gap-1"><Eye size={10}/> Asli</div>
                                    </div>
                                 )}
                                 
                                 {/* Status Badges */}
                                 {item.status === 'completed' && (
                                      <div className="absolute top-2 right-2 bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1 z-10 border border-green-400/50">
                                         <CheckCircle2 size={12} fill="currentColor" className="text-white" /> SELESAI
                                      </div>
                                 )}
                                 {item.status === 'failed' && (
                                      <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1 z-10 border border-red-400/50">
                                         <AlertOctagon size={12} fill="currentColor" className="text-white" /> GAGAL
                                      </div>
                                 )}
                                 {item.status === 'pending' && (
                                      <div className="absolute top-2 right-2 bg-gray-700/80 text-gray-300 text-[10px] font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1 z-10 backdrop-blur-sm border border-gray-600">
                                         <Clock size={12} /> ANTRE
                                      </div>
                                 )}
                              </div>

                              <div className="p-3 bg-gray-900 border-t border-gray-800/50">
                                 <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-semibold text-gray-200 truncate max-w-[150px]" title={item.file.name}>{item.file.name}</span>
                                    {item.status === 'processing' && (
                                        <span className="text-[10px] font-bold text-blue-400 animate-pulse flex items-center gap-1">
                                            <Loader2 size={10} className="animate-spin" /> {Math.round((item.currentStep / totalSteps) * 100)}%
                                        </span>
                                    )}
                                    {item.status === 'completed' && <span className="text-[10px] font-bold text-green-500">100%</span>}
                                 </div>
                                 
                                 {/* Progress Bar Container */}
                                 <div className="relative h-2.5 bg-gray-800 rounded-full overflow-hidden border border-gray-700 shadow-inner">
                                     <div 
                                        className={`absolute top-0 left-0 h-full transition-all duration-700 ease-out rounded-full ${
                                            item.status === 'completed' ? 'bg-gradient-to-r from-green-500 to-emerald-400 w-full' :
                                            item.status === 'failed' ? 'bg-red-500 w-full' :
                                            'bg-gradient-to-r from-blue-600 via-purple-500 to-blue-600 bg-[length:200%_100%] animate-gradient-x'
                                        }`}
                                        style={{ width: item.status === 'processing' ? `${(item.currentStep / totalSteps) * 100}%` : item.status === 'pending' ? '0%' : '100%' }}
                                     ></div>
                                 </div>
                                 
                                 {/* Dynamic Status Text */}
                                 <div className="mt-2.5 flex items-center gap-2 text-[10px] text-gray-400 h-8">
                                      {item.status === 'processing' && <Loader2 size={12} className="text-blue-400 animate-spin shrink-0" />}
                                      {item.status === 'completed' && <CheckCircle2 size={12} className="text-green-400 shrink-0" />}
                                      {item.status === 'failed' && <AlertOctagon size={12} className="text-red-400 shrink-0" />}
                                      
                                      <p className={`leading-tight line-clamp-2 ${
                                          item.status === 'processing' ? 'text-blue-300' :
                                          item.status === 'failed' ? 'text-red-300' : 
                                          item.status === 'completed' ? 'text-green-300' : ''
                                      }`}>
                                        {currentActionText}
                                      </p>
                                 </div>

                                 {item.error && (
                                    <div className="mt-2 p-2 bg-red-950/30 border border-red-900/50 rounded flex gap-2 items-start animate-in fade-in slide-in-from-top-1">
                                        <AlertOctagon size={14} className="text-red-400 shrink-0 mt-0.5" />
                                        <p className="text-[10px] text-red-300 leading-tight" title={item.error}>{item.error}</p>
                                    </div>
                                 )}
                                 
                                 {item.extractedText && (
                                    <div className="mt-2 p-2 bg-black/40 rounded text-xs text-gray-300 max-h-20 overflow-y-auto custom-scrollbar border border-gray-700/50 group/ocr">
                                      <strong className="block text-gray-500 mb-1 flex items-center justify-between">
                                        <span className="flex items-center gap-1"><FileText size={10}/> Hasil OCR</span>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(item.extractedText!);
                                            }}
                                            className="text-[9px] text-blue-400 hover:text-white opacity-0 group-hover/ocr:opacity-100 transition-opacity"
                                        >
                                            Salin
                                        </button>
                                      </strong>
                                      <p className="opacity-80 leading-relaxed font-mono text-[10px]">{item.extractedText.substring(0, 100)}{item.extractedText.length > 100 && '...'}</p>
                                    </div>
                                 )}
                              </div>
                           </div>
                         )})}
                      </div>
                    )}
                 </div>
              </div>

            </div>
          )}
        </div>
      </div>
      
      {/* OCR Result Modal (Single Mode) */}
      {showOcrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl max-w-2xl w-full flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900/50 rounded-t-xl">
               <h3 className="text-lg font-bold text-white flex items-center gap-2">
                 <FileText className="text-blue-400"/> Hasil Ekstraksi Teks (OCR)
               </h3>
               <button 
                 onClick={() => setShowOcrModal(false)}
                 className="p-1 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"
               >
                 <X size={20}/>
               </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
               <textarea 
                  readOnly 
                  value={ocrResult} 
                  className="w-full h-full min-h-[300px] bg-gray-900 border border-gray-700 rounded-lg p-4 text-gray-300 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none resize-none"
               />
            </div>
            <div className="p-4 border-t border-gray-700 bg-gray-900/30 rounded-b-xl flex justify-end gap-3">
               <button 
                 onClick={() => setShowOcrModal(false)}
                 className="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
               >
                 Tutup
               </button>
               <button 
                 onClick={() => {
                    navigator.clipboard.writeText(ocrResult);
                    alert("Teks berhasil disalin!");
                 }}
                 className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
               >
                 <Copy size={16}/> Salin Teks
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageEditor;
