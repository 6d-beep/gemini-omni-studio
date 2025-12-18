
import React, { useState, useRef, useEffect } from 'react';
import { 
  RotateCw, 
  Sun, 
  Contrast as ContrastIcon, 
  Maximize, 
  Check, 
  X, 
  RefreshCcw,
  Move,
  Image as ImageIcon,
  Wind
} from 'lucide-react';

interface ImageAdjustmentModalProps {
  image: string;
  onSave: (newImage: string) => void;
  onClose: () => void;
}

const ImageAdjustmentModal: React.FC<ImageAdjustmentModalProps> = ({ image, onSave, onClose }) => {
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [grayscale, setGrayscale] = useState(0);
  const [sepia, setSepia] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = image;
    img.onload = () => {
      imageRef.current = img;
      renderPreview();
    };
  }, [image]);

  const renderPreview = () => {
    if (!canvasRef.current || !imageRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fixed internal resolution for quality
    const size = 1000;
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);
    
    // Apply filters string
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) grayscale(${grayscale}%) sepia(${sepia}%)`;

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    
    const img = imageRef.current;
    const ratio = img.width / img.height;
    let drawW, drawH;
    
    if (ratio > 1) {
      drawW = size;
      drawH = size / ratio;
    } else {
      drawH = size;
      drawW = size * ratio;
    }

    ctx.drawImage(
      img, 
      -drawW / 2 + offset.x, 
      -drawH / 2 + offset.y, 
      drawW, 
      drawH
    );
    
    ctx.restore();
  };

  useEffect(() => {
    renderPreview();
  }, [brightness, contrast, grayscale, sepia, rotation, zoom, offset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleSave = () => {
    if (!canvasRef.current) return;
    // Export with high quality
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.95);
    onSave(dataUrl);
  };

  const reset = () => {
    setBrightness(100);
    setContrast(100);
    setGrayscale(0);
    setSepia(0);
    setRotation(0);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 md:p-8">
      <div className="bg-gray-900 border border-white/10 rounded-[2.5rem] shadow-2xl max-w-5xl w-full overflow-hidden flex flex-col md:flex-row max-h-[95vh]">
        
        {/* Visual Preview / Canvas Area */}
        <div 
          className="flex-1 bg-black relative flex items-center justify-center overflow-hidden cursor-move touch-none group"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Grid lines for composition reference */}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-10">
             <div className="border border-white/20"></div><div className="border border-white/20"></div><div className="border border-white/20"></div>
             <div className="border border-white/20"></div><div className="border border-white/20"></div><div className="border border-white/20"></div>
             <div className="border border-white/20"></div><div className="border border-white/20"></div><div className="border border-white/20"></div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
             <div className="w-[320px] h-[320px] md:w-[600px] md:h-[600px] border-2 border-dashed border-white/40 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"></div>
          </div>
          
          <canvas 
            ref={canvasRef} 
            className="max-w-full max-h-full object-contain"
            style={{ width: '600px', height: '600px' }}
          />
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-xl px-4 py-2 rounded-full text-[10px] font-black text-white/80 flex items-center gap-2 border border-white/10 uppercase tracking-widest shadow-2xl">
            <Move size={12} className="text-blue-400" /> Geser & Zoom untuk Crop
          </div>
        </div>

        {/* Sidebar Controls */}
        <div className="w-full md:w-80 p-6 md:p-8 space-y-8 bg-gray-900 border-t md:border-t-0 md:border-l border-white/5 shrink-0 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
                <ImageIcon size={20} className="text-blue-400" /> Photo Edit
              </h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Adjustment Toolkit</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-all">
              <X size={24} />
            </button>
          </div>

          <div className="space-y-6">
            {/* Adjustment Group */}
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <span className="flex items-center gap-2"><Sun size={14}/> Brightness</span>
                  <span className="text-blue-400">{brightness}%</span>
                </div>
                <input 
                  type="range" min="0" max="200" value={brightness} 
                  onChange={(e) => setBrightness(parseInt(e.target.value))}
                  className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <span className="flex items-center gap-2"><ContrastIcon size={14}/> Contrast</span>
                  <span className="text-blue-400">{contrast}%</span>
                </div>
                <input 
                  type="range" min="0" max="200" value={contrast} 
                  onChange={(e) => setContrast(parseInt(e.target.value))}
                  className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <span className="flex items-center gap-2"><Maximize size={14}/> Zoom / Scale</span>
                  <span className="text-blue-400">{Math.round(zoom * 100)}%</span>
                </div>
                <input 
                  type="range" min="1" max="5" step="0.1" value={zoom} 
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>

            {/* Quick Filters */}
            <div className="pt-6 border-t border-white/5 space-y-4">
               <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Artistic Filters</label>
               <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => { setGrayscale(grayscale === 100 ? 0 : 100); setSepia(0); }}
                    className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all border ${grayscale === 100 ? 'bg-white text-black border-white' : 'bg-black/40 border-white/10 text-gray-400 hover:border-white/20'}`}
                  >
                    B&W Mode
                  </button>
                  <button 
                    onClick={() => { setSepia(sepia === 100 ? 0 : 100); setGrayscale(0); }}
                    className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all border ${sepia === 100 ? 'bg-orange-500 text-white border-orange-500' : 'bg-black/40 border-white/10 text-gray-400 hover:border-white/20'}`}
                  >
                    Vintage
                  </button>
               </div>
            </div>

            {/* Transform */}
            <div className="pt-6 border-t border-white/5 space-y-4">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Transform</label>
              <div className="flex gap-2">
                {[0, 90, 180, 270].map((deg) => (
                  <button 
                    key={deg}
                    onClick={() => setRotation(deg)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all border ${
                      rotation === deg ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-black/40 border-white/10 text-gray-400 hover:bg-white/5'
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
                <button 
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  className="p-2.5 bg-black/40 border border-white/10 rounded-xl text-gray-400 hover:text-white"
                >
                  <RotateCw size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 space-y-3">
            <button 
              onClick={handleSave}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-[1.25rem] font-black uppercase tracking-widest shadow-xl shadow-blue-900/40 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Check size={20} /> Simpan Hasil
            </button>
            <div className="flex gap-2">
              <button 
                onClick={reset}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all"
              >
                <RefreshCcw size={14} /> Reset
              </button>
              <button 
                onClick={onClose}
                className="flex-1 bg-red-900/10 hover:bg-red-900/20 text-red-500 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all border border-red-500/20"
              >
                <X size={14} /> Batal
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageAdjustmentModal;
