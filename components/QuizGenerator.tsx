
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { generateQuiz, getTrendingQuizTopics, generateMaterialSummary } from '../services/geminiService';
import { QuizData, QuestionType, ReferenceMaterial, QuizQuestion, QuizDistribution, QuizSection } from '../types';
import ImageAdjustmentModal from './ImageAdjustmentModal';
import { 
  BrainCircuit, Loader2, Search, TrendingUp, Save, 
  BookOpen, FileText, Hash, GraduationCap, Upload, Trash2, 
  Folder, Check, Printer, User, UserCog, Layers, MessageSquarePlus, 
  FileSpreadsheet, XCircle,
  Sparkles, ChevronDown, ChevronUp, X, Settings2, Bot, FileDown, 
  CheckCircle2, AlertCircle, Pencil, ImagePlus, XCircle as CloseIcon,
  CheckCircle,
  Scissors,
  Bold,
  Italic,
  List,
  Type as TypeIcon
} from 'lucide-react';

// Declaration for html2canvas
declare const html2canvas: any;
// Declaration for jsPDF
declare const jspdf: any;

const SUBJECT_OPTIONS = [
  "PENDIDIKAN PANCASILA",
  "BAHASA INDONESIA",
  "MATEMATIKA",
  "IPAS",
  "SENI RUPA",
  "SENI TARI",
  "SENI MUSIK",
  "SENI TEATER",
  "PKLH",
  "PAI",
  "PJOK",
  "BAHASA INGGRIS",
  "PRAMUKA",
  "KOKURIKULER",
  "KODING DAN AI",
  "FILE PENUNJANG"
];

const CATEGORY_OPTIONS = [
  "MATERI",
  "CP",
  "ATP",
  "MODUL AJAR",
  "BANK SOAL",
  "LAINNYA"
];

const QuizGenerator: React.FC = () => {
  // Load draft config on mount
  const [draftConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('quiz_draft_config_v2');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Form State
  const [subject, setSubject] = useState(draftConfig.subject || '');
  const [grade, setGrade] = useState(draftConfig.grade || '');
  const [topic, setTopic] = useState(draftConfig.topic || '');
  const [customInstruction, setCustomInstruction] = useState(draftConfig.customInstruction || ''); 
  
  // Multi-Type Configuration
  const [selectedTypes, setSelectedTypes] = useState<QuestionType[]>(draftConfig.selectedTypes || ['MULTIPLE_CHOICE']);
  const [configPerType, setConfigPerType] = useState<Record<QuestionType, QuizDistribution>>(
    draftConfig.configPerType || {
      'MULTIPLE_CHOICE': { easy: 5, medium: 3, hard: 2 },
      'SHORT_ANSWER': { easy: 3, medium: 2, hard: 0 },
      'ESSAY': { easy: 1, medium: 1, hard: 1 }
    }
  );

  const [kkm, setKkm] = useState(draftConfig.kkm || 75);
  const [isCustomSubject, setIsCustomSubject] = useState(() => {
    return !!(draftConfig.subject && !SUBJECT_OPTIONS.includes(draftConfig.subject));
  });

  const [includeRemedial, setIncludeRemedial] = useState(draftConfig.includeRemedial !== false);
  const [includeEnrichment, setIncludeEnrichment] = useState(draftConfig.includeEnrichment !== false);
  
  const [remedialCounts, setRemedialCounts] = useState<Record<QuestionType, number>>(
    draftConfig.remedialCounts || { 'MULTIPLE_CHOICE': 5, 'SHORT_ANSWER': 0, 'ESSAY': 0 }
  );
  const [enrichmentCounts, setEnrichmentCounts] = useState<Record<QuestionType, number>>(
    draftConfig.enrichmentCounts || { 'MULTIPLE_CHOICE': 0, 'SHORT_ANSWER': 0, 'ESSAY': 2 }
  );

  const [materials, setMaterials] = useState<ReferenceMaterial[]>(() => {
    try {
      const saved = localStorage.getItem('quiz_materials');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [matchedMaterials, setMatchedMaterials] = useState<ReferenceMaterial[]>([]);
  const [materialSummary, setMaterialSummary] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [stagingFiles, setStagingFiles] = useState<Omit<ReferenceMaterial, 'id' | 'uploadDate'>[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'library' | 'form'>('form');
  const [viewMode, setViewMode] = useState<'student' | 'teacher'>('student');
  
  // Inline Editing State
  const [editingRef, setEditingRef] = useState<{ sectionIdx: number, questionIdx: number, type: 'main' | 'remedial' | 'enrichment' } | null>(null);
  const [editBuffer, setEditBuffer] = useState<QuizQuestion | null>(null);
  const [showImageAdjustment, setShowImageAdjustment] = useState(false);

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printSettings, setPrintSettings] = useState({
    showHeader: true,
    showName: true,
    showRubric: true,
    fontSize: 'text-sm', 
    compactMode: false
  });
  
  const [trendingTopics, setTrendingTopics] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const questionImageRef = useRef<HTMLInputElement>(null);

  const questionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const explanationTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    localStorage.setItem('quiz_materials', JSON.stringify(materials));
  }, [materials]);

  useEffect(() => {
    const config = {
      subject, grade, topic, customInstruction, selectedTypes, configPerType,
      includeRemedial, includeEnrichment, remedialCounts, enrichmentCounts, kkm
    };
    localStorage.setItem('quiz_draft_config_v2', JSON.stringify(config));
  }, [subject, grade, topic, customInstruction, selectedTypes, configPerType, includeRemedial, includeEnrichment, remedialCounts, enrichmentCounts, kkm]);

  useEffect(() => {
    getTrendingQuizTopics().then(setTrendingTopics);
  }, []);

  useEffect(() => {
    if (subject && grade) {
        const matches = materials.filter(m => 
            m.type !== 'QUIZ' &&
            m.subject.toLowerCase() === subject.toLowerCase().trim() && 
            m.grade.toLowerCase() === grade.toLowerCase().trim()
        );
        setMatchedMaterials(matches);
        setSelectedMaterialIds([]);
        setMaterialSummary('');
        setShowSummary(false);
    } else {
        setMatchedMaterials([]);
        setMaterialSummary('');
        setShowSummary(false);
    }
  }, [subject, grade, materials]);

  const groupedMaterials = useMemo(() => {
    const groups: Record<string, Record<string, ReferenceMaterial[]>> = {};
    materials.forEach(m => {
      const subj = m.subject ? m.subject.toUpperCase() : 'TANPA MAPEL';
      const cat = m.category ? m.category.toUpperCase() : 'LAINNYA';
      if (!groups[subj]) groups[subj] = {};
      if (!groups[subj][cat]) groups[subj][cat] = [];
      groups[subj][cat].push(m);
    });
    return groups;
  }, [materials]);

  const handleMainSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'LAINNYA') {
      setIsCustomSubject(true);
      setSubject('');
    } else {
      setIsCustomSubject(false);
      setSubject(val);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newStagingItems: Omit<ReferenceMaterial, 'id' | 'uploadDate'>[] = [];
    let processedCount = 0;
    Array.from(files).forEach((file: globalThis.File) => {
      const reader = new FileReader();
      const isBinary = file.type.includes('image') || file.type === 'application/pdf';
      reader.onload = (event) => {
        const content = event.target?.result as string;
        newStagingItems.push({
          fileName: file.name,
          content: content, 
          subject: subject || '', 
          grade: grade || '',
          category: 'MATERI'
        });
        processedCount++;
        if (processedCount === files.length) {
          setStagingFiles(prev => [...prev, ...newStagingItems]);
          setActiveTab('upload');
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      if (isBinary) reader.readAsDataURL(file);
      else reader.readAsText(file);
    });
  };

  const updateStagingFile = (index: number, field: any, value: string) => {
    setStagingFiles(prev => {
      const copy = [...prev];
      // @ts-ignore
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const removeStagingFile = (index: number) => {
    setStagingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const saveStagingFile = (index: number) => {
    const file = stagingFiles[index];
    if (!file.subject || !file.grade) {
      alert("Mohon isi Mata Pelajaran dan Kelas");
      return;
    }
    const newMaterial: ReferenceMaterial = {
      ...file,
      id: Date.now().toString() + Math.random().toString(),
      uploadDate: Date.now()
    };
    setMaterials(prev => [...prev, newMaterial]);
    removeStagingFile(index);
  };

  const deleteMaterial = (id: string) => {
    if(confirm("Hapus materi ini?")) {
      setMaterials(prev => prev.filter(m => m.id !== id));
    }
  };

  const handleGenerateSummary = async () => {
    const targets = selectedMaterialIds.length > 0 
        ? matchedMaterials.filter(m => selectedMaterialIds.includes(m.id))
        : matchedMaterials;
    if (targets.length === 0) return;
    setGeneratingSummary(true);
    setShowSummary(true);
    try {
        const summary = await generateMaterialSummary(targets, subject, grade);
        setMaterialSummary(summary);
    } catch (e) {
        console.error(e);
        alert("Gagal membuat ringkasan materi.");
    } finally {
        setGeneratingSummary(false);
    }
  };

  const handleGenerate = async () => {
    if (!subject.trim() || !grade.trim()) {
      alert("Mohon isi Mata Pelajaran dan Kelas.");
      return;
    }
    if (selectedTypes.length === 0) {
      alert("Pilih setidaknya satu bentuk soal.");
      return;
    }
    const finalMaterials = materials.filter(m => selectedMaterialIds.includes(m.id));
    setLoading(true);
    setQuizData(null);
    setGroundingSources([]);
    setShowSuggestions(false);
    setViewMode('student');
    try {
      const sectionConfigs = selectedTypes.map(type => ({ type, distribution: configPerType[type] }));
      const cleanRemedial = Object.fromEntries(Object.entries(remedialCounts).filter(([_, count]) => (count as number) > 0));
      const cleanEnrichment = Object.fromEntries(Object.entries(enrichmentCounts).filter(([_, count]) => (count as number) > 0));
      const { quiz, groundingMetadata } = await generateQuiz(topic, subject, grade, sectionConfigs, finalMaterials, customInstruction, includeRemedial ? cleanRemedial : {}, includeEnrichment ? cleanEnrichment : {});
      quiz.kkm = kkm; 
      quiz.id = Date.now().toString(); // Assign a unique ID to allow tracking edits
      setQuizData(quiz);
      setGroundingSources(groundingMetadata?.groundingChunks || []);
      
      const newSavedQuiz: ReferenceMaterial = {
        id: quiz.id, type: 'QUIZ', category: 'BANK SOAL', fileName: `SOAL: ${quiz.topic || 'Tanpa Topik'} (${new Date().toLocaleDateString()})`,
        content: quiz, subject: quiz.subject, grade: quiz.grade, uploadDate: Date.now()
      };
      setMaterials(prev => [...prev, newSavedQuiz]);
    } catch (error) {
      console.error("Quiz Gen Error:", error);
      alert("Gagal membuat soal. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveQuiz = () => {
    if (!quizData) return;
    
    setMaterials(prev => {
      // Find if this quiz already exists in Bank Soal by ID
      const existingIdx = prev.findIndex(m => m.id === quizData.id);
      
      const updatedQuizMaterial: ReferenceMaterial = {
        id: quizData.id || Date.now().toString(),
        type: 'QUIZ',
        category: 'BANK SOAL',
        fileName: `SOAL: ${quizData.topic || 'Tanpa Topik'} (Terakhir Simpan: ${new Date().toLocaleTimeString()})`,
        content: quizData,
        subject: quizData.subject,
        grade: quizData.grade,
        uploadDate: Date.now()
      };

      if (existingIdx >= 0) {
        const newMaterials = [...prev];
        newMaterials[existingIdx] = updatedQuizMaterial;
        return newMaterials;
      } else {
        return [...prev, updatedQuizMaterial];
      }
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleExportPDF = async (type: 'student' | 'teacher') => {
    if (!quizData) return;
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
      alert("Pustaka PDF sedang dimuat. Harap tunggu.");
      return;
    }
    setExportingPdf(true);
    setTimeout(async () => {
        try {
            const elementId = type === 'student' ? 'pdf-student-view' : 'pdf-teacher-view';
            const element = document.getElementById(elementId);
            if (!element) { setExportingPdf(false); return; }
            const pdfWidth = 210; 
            const pdfHeight = 297; 
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false, windowWidth: pdfWidth * 3.7795275591, x: 0, y: 0 });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const { jsPDF } = jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            const imgProps = doc.getImageProperties(imgData);
            const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
            let heightLeft = imgHeight;
            let position = 0;
            doc.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pdfHeight;
            while (heightLeft > 0) {
                position -= pdfHeight;
                doc.addPage();
                doc.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
                heightLeft -= pdfHeight;
            }
            const timestamp = new Date().toISOString().split('T')[0];
            doc.save(`Soal_${quizData.subject}_${type.toUpperCase()}_${timestamp}.pdf`);
        } catch (e) {
            console.error("PDF Export Error", e);
            alert("Gagal mengekspor PDF.");
        } finally {
            setExportingPdf(false);
        }
    }, 100);
  };

  const calculateRoundedScore = (maxScore: number, questionCount: number): number => {
     if (questionCount === 0) return 0;
     const raw = maxScore / questionCount;
     return Math.round(raw);
  };

  const getLabelForType = (t: QuestionType) => {
      if (t === 'MULTIPLE_CHOICE') return 'Pilihan Ganda';
      if (t === 'SHORT_ANSWER') return 'Isian Singkat';
      if (t === 'ESSAY') return 'Uraian';
      return t;
  };

  const renderInstruction = (type: QuestionType) => {
    switch (type) {
      case 'MULTIPLE_CHOICE': return "Pilihlah salah satu jawaban yang dianggap paling benar dan tepat!";
      case 'SHORT_ANSWER': return "Isilah soal berikut dengan jawaban yang benar dan tepat!";
      case 'ESSAY': return "Jawablah pertanyaan berikut dengan uraian yang jelas dan tepat!";
      default: return "Kerjakan soal berikut dengan teliti.";
    }
  };

  // --- Inline Question Editor Handlers ---

  const startEditing = (sectionIdx: number, questionIdx: number, type: 'main' | 'remedial' | 'enrichment') => {
    if (!quizData) return;
    let targetSection: QuizSection | undefined;
    if (type === 'main') targetSection = quizData.sections[sectionIdx];
    else if (type === 'remedial') targetSection = quizData.remedial[sectionIdx];
    else if (type === 'enrichment') targetSection = quizData.enrichment[sectionIdx];
    
    if (targetSection) {
        setEditingRef({ sectionIdx, questionIdx, type });
        setEditBuffer({ ...targetSection.questions[questionIdx] });
    }
  };

  const saveQuestionEdit = () => {
    if (!quizData || !editingRef || !editBuffer) return;
    const newData = { ...quizData };
    const { sectionIdx, questionIdx, type } = editingRef;
    
    let targetSection: QuizSection | undefined;
    if (type === 'main') targetSection = newData.sections[sectionIdx];
    else if (type === 'remedial') targetSection = newData.remedial[sectionIdx];
    else if (type === 'enrichment') targetSection = newData.enrichment[sectionIdx];
    
    if (targetSection) {
        targetSection.questions[questionIdx] = editBuffer;
        setQuizData(newData);
        setEditingRef(null);
        setEditBuffer(null);
    }
  };

  const handleQuestionImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editBuffer) {
        const reader = new FileReader();
        reader.onload = (evt) => {
            setEditBuffer({ ...editBuffer, image: evt.target?.result as string });
        };
        reader.readAsDataURL(file);
    }
  };

  const insertFormatting = (textareaRef: React.RefObject<HTMLTextAreaElement>, prefix: string, suffix: string = '', isBufferField: 'question' | 'explanation' = 'question') => {
    if (!textareaRef.current || !editBuffer) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const selected = text.substring(start, end);
    const after = text.substring(end);

    const newText = before + prefix + (selected || '') + suffix + after;
    
    setEditBuffer({ ...editBuffer, [isBufferField]: newText });
    
    // Restore focus and selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const MarkdownToolbar = ({ refObj, fieldName }: { refObj: React.RefObject<HTMLTextAreaElement>, fieldName: 'question' | 'explanation' }) => (
    <div className="flex items-center gap-1 mb-2 bg-blue-50/50 p-1 rounded-lg border border-blue-100 w-fit">
      <button 
        type="button" 
        onClick={() => insertFormatting(refObj, '**', '**', fieldName)}
        className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-blue-600" 
        title="Tebal (Ctrl+B)"
      >
        <Bold size={16} />
      </button>
      <button 
        type="button" 
        onClick={() => insertFormatting(refObj, '*', '*', fieldName)}
        className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-blue-600"
        title="Miring (Ctrl+I)"
      >
        <Italic size={16} />
      </button>
      <button 
        type="button" 
        onClick={() => insertFormatting(refObj, '- ', '', fieldName)}
        className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-blue-600"
        title="Daftar (List)"
      >
        <List size={16} />
      </button>
      <div className="w-px h-4 bg-blue-200 mx-1"></div>
      <span className="text-[10px] font-bold text-blue-400 px-1 select-none">MARKDOWN READY</span>
    </div>
  );

  const renderSectionContent = (questions: QuizQuestion[], showAnswers: boolean, settings: typeof printSettings, sectionIdx: number, type: 'main' | 'remedial' | 'enrichment') => {
    const spacingClass = settings.compactMode ? 'space-y-3' : 'space-y-6';
    const itemClass = settings.compactMode ? 'mb-1' : 'mb-2';
    
    return (
      <div className={spacingClass}>
        {questions.map((q, qIdx) => {
          const isEditing = editingRef?.sectionIdx === sectionIdx && editingRef?.questionIdx === qIdx && editingRef?.type === type;
          
          return (
            <div key={qIdx} className={`break-inside-avoid relative group transition-all duration-200 ${isEditing ? 'bg-blue-50/80 p-6 rounded-3xl border-2 border-blue-200 my-4 shadow-xl' : 'hover:bg-gray-50/50 p-2 rounded-xl'}`}>
              
              {/* Tombol Edit Soal (Floating/Visible on Hover) */}
              {!isEditing && (
                <button 
                  onClick={() => startEditing(sectionIdx, qIdx, type)}
                  className="absolute right-2 top-2 p-2 bg-blue-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:scale-110 z-10 print:hidden flex items-center gap-1.5 text-xs font-bold"
                  title="Edit Soal"
                >
                  <Pencil size={14} /> Edit Soal
                </button>
              )}

              <div className="flex gap-2">
                <span className="font-bold">{qIdx + 1}.</span>
                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-5">
                        {/* Editor Teks Pertanyaan */}
                        <div>
                          <div className="flex justify-between items-end mb-2">
                             <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest">Pertanyaan</label>
                             <MarkdownToolbar refObj={questionTextareaRef} fieldName="question" />
                          </div>
                          <textarea 
                              ref={questionTextareaRef}
                              value={editBuffer?.question}
                              onChange={(e) => setEditBuffer(p => p ? { ...p, question: e.target.value } : null)}
                              className="w-full bg-white border border-blue-200 rounded-xl p-3 text-sm focus:ring-4 focus:ring-blue-500/10 outline-none shadow-sm transition-all"
                              rows={5}
                              placeholder="Tulis pertanyaan di sini... Gunakan Markdown untuk format."
                          />
                        </div>
                        
                        {/* Editor Gambar */}
                        <div className="space-y-2">
                          <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Gambar Pendukung</label>
                          <div className="flex flex-wrap items-center gap-4">
                            {editBuffer?.image && (
                              <div className="relative inline-block group/img">
                                <img src={editBuffer.image} className="max-h-40 rounded-lg border border-gray-200 shadow-sm" />
                                <div className="absolute -top-2 -right-2 flex gap-1">
                                    <button 
                                        onClick={() => setShowImageAdjustment(true)}
                                        className="bg-blue-600 text-white rounded-full p-1.5 shadow-lg hover:bg-blue-700 transition-colors"
                                        title="Crop & Adjust"
                                    >
                                        <Scissors size={14} />
                                    </button>
                                    <button 
                                        onClick={() => setEditBuffer(p => p ? { ...p, image: undefined } : null)}
                                        className="bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:bg-red-600 transition-colors"
                                        title="Hapus Gambar"
                                    >
                                        <CloseIcon size={14} />
                                    </button>
                                </div>
                                {showImageAdjustment && editBuffer.image && (
                                  <ImageAdjustmentModal 
                                    image={editBuffer.image}
                                    onClose={() => setShowImageAdjustment(false)}
                                    onSave={(newImg) => {
                                      setEditBuffer(p => p ? { ...p, image: newImg } : null);
                                      setShowImageAdjustment(false);
                                    }}
                                  />
                                )}
                              </div>
                            )}
                            <button 
                                onClick={() => questionImageRef.current?.click()}
                                className="flex flex-col items-center justify-center gap-2 w-32 h-32 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all text-gray-500 hover:text-blue-500"
                            >
                                <ImagePlus size={24} />
                                <span className="text-[10px] font-bold uppercase">{editBuffer?.image ? 'Ganti Gambar' : 'Tambah Gambar'}</span>
                            </button>
                            <input type="file" ref={questionImageRef} onChange={handleQuestionImageUpload} className="hidden" accept="image/*" />
                          </div>
                        </div>

                        {/* Editor Opsi (Khusus PG) */}
                        {q.type === 'MULTIPLE_CHOICE' && editBuffer?.options && (
                           <div className="space-y-3 bg-white p-4 rounded-xl border border-blue-100">
                              <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Opsi Jawaban</label>
                              {editBuffer.options.map((opt, i) => (
                                <div key={i} className="flex gap-3 items-center">
                                   <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-black shadow-sm shrink-0">{String.fromCharCode(65 + i)}</div>
                                   <input 
                                      type="text" 
                                      value={opt}
                                      onChange={(e) => {
                                        const newOpts = [...(editBuffer.options || [])];
                                        newOpts[i] = e.target.value;
                                        setEditBuffer({ ...editBuffer, options: newOpts });
                                      }}
                                      className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
                                      placeholder={`Tulis opsi ${String.fromCharCode(65+i)} di sini...`}
                                   />
                                </div>
                              ))}
                           </div>
                        )}

                        {/* Editor Kunci & Penjelasan */}
                        <div className="grid grid-cols-1 gap-6">
                           <div>
                              <label className="block text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">Kunci Jawaban</label>
                              <input 
                                 type="text"
                                 value={editBuffer?.correctAnswer}
                                 onChange={(e) => setEditBuffer(p => p ? { ...p, correctAnswer: e.target.value } : null)}
                                 className="w-full bg-white border border-green-200 rounded-lg p-2.5 text-sm font-bold focus:ring-4 focus:ring-green-500/10 outline-none transition-all"
                                 placeholder="Contoh: A atau Jawaban Singkat"
                              />
                           </div>
                           <div>
                              <div className="flex justify-between items-end mb-2">
                                <label className="block text-[10px] font-black text-purple-600 uppercase tracking-widest">Penjelasan / Pembahasan</label>
                                <MarkdownToolbar refObj={explanationTextareaRef} fieldName="explanation" />
                              </div>
                              <textarea 
                                 ref={explanationTextareaRef}
                                 value={editBuffer?.explanation}
                                 onChange={(e) => setEditBuffer(p => p ? { ...p, explanation: e.target.value } : null)}
                                 className="w-full bg-white border border-purple-200 rounded-lg p-2.5 text-sm focus:ring-4 focus:ring-purple-500/10 outline-none transition-all"
                                 rows={3}
                                 placeholder="Berikan alasan mengapa jawaban tersebut benar..."
                              />
                           </div>
                        </div>

                        {/* Kontrol Simpan/Batal */}
                        <div className="flex gap-3 pt-4 border-t border-blue-100">
                           <button onClick={saveQuestionEdit} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 transition-all">
                             <Save size={18} /> Simpan Perubahan
                           </button>
                           <button onClick={() => setEditingRef(null)} className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-sm font-black uppercase tracking-wider transition-all">
                             Batal
                           </button>
                        </div>
                    </div>
                  ) : (
                    <>
                      {/* Tampilan Normal */}
                      <div className={`${itemClass} text-justify leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2`}>
                          <ReactMarkdown>{q.question}</ReactMarkdown>
                      </div>
                      
                      {q.image && (
                        <div className="my-4">
                           <img src={q.image} className="max-w-full md:max-w-md max-h-80 rounded-xl object-contain border border-gray-200 p-1 bg-white shadow-sm" />
                        </div>
                      )}

                      {q.type === 'MULTIPLE_CHOICE' && q.options && (
                        <div className={`grid grid-cols-1 gap-1.5 ml-2 mt-3`}>
                          {q.options.map((opt, i) => (
                             <div key={i} className="flex gap-3 items-start group/opt">
                                <div className="w-6 h-6 border-2 border-gray-300 group-hover/opt:border-blue-400 transition-colors rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5 print:border-black">
                                  {String.fromCharCode(65 + i)}
                                </div>
                                <span className="text-sm">{opt}</span>
                             </div>
                          ))}
                        </div>
                      )}

                      {q.type !== 'MULTIPLE_CHOICE' && (
                        <div className={`mt-4 border-b border-black border-dashed w-full opacity-30 ${settings.compactMode ? 'h-4' : 'h-16'}`}></div>
                      )}

                      {showAnswers && (
                         <div className="mt-4 text-sm bg-gray-50 border border-gray-200 rounded-xl p-4 print:bg-transparent print:border-black print:p-2 print:mt-2">
                            <div className="flex items-center gap-2 mb-1">
                               <CheckCircle2 size={16} className="text-green-600 print:text-black" />
                               <strong className="text-green-900 print:text-black uppercase text-xs tracking-widest">Kunci Jawaban:</strong>
                               <span className="font-bold text-blue-700 print:text-black">{q.correctAnswer}</span>
                            </div>
                            <div className="mt-2 text-gray-700 print:text-black border-t border-gray-200 pt-2 italic text-xs leading-relaxed prose prose-sm max-w-none">
                               <strong>Pembahasan:</strong> <ReactMarkdown className="inline-block">{q.explanation}</ReactMarkdown>
                            </div>
                         </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderScoreTable = (section: QuizSection, settings: typeof printSettings) => {
    const scorePerItem = calculateRoundedScore(100, section.questions.length);
    const totalScore = scorePerItem * section.questions.length;
    return (
      <div className="mt-6 break-inside-avoid">
        <h5 className="font-bold text-sm mb-2 uppercase border-b border-gray-400 inline-block">
            Tabel Skor: {getLabelForType(section.type)}
        </h5>
        <table className="w-full border-collapse border border-black text-xs">
          <thead>
            <tr className="bg-gray-200 print:bg-gray-100">
               <th className="border border-black p-1 w-10 text-center">No</th>
               <th className="border border-black p-1">Jawaban Kunci / Poin</th>
               <th className="border border-black p-1 w-20 text-center">Skor</th>
            </tr>
          </thead>
          <tbody>
            {section.questions.map((q, i) => (
              <tr key={i}>
                <td className="border border-black p-1 text-center">{i+1}</td>
                <td className="border border-black p-1"><div className="font-mono font-bold">{q.correctAnswer}</div></td>
                <td className="border border-black p-1 text-center font-bold">{scorePerItem}</td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-100 print:bg-gray-100">
              <td colSpan={2} className="border border-black p-1 text-right">TOTAL NILAI MAKSIMAL (Pembulatan)</td>
              <td className="border border-black p-1 text-center">{totalScore}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderQuizPaper = (id: string | undefined, currentSettings: typeof printSettings, modeOverride?: 'student' | 'teacher') => {
    if (!quizData) return null;
    const effectiveMode = modeOverride || viewMode;
    return (
      <div id={id} className={`bg-white text-black mx-auto shadow-2xl print:shadow-none p-[1cm] max-w-[210mm] min-h-[297mm] print:w-[210mm] print:max-w-[210mm] print:m-0 print:p-[1cm] overflow-hidden ${currentSettings.fontSize}`}>
          {currentSettings.showHeader && (
            <div className="text-center border-b-2 border-black pb-4 mb-6">
              <h1 className="text-2xl font-black tracking-wider uppercase">LEMBAR KERJA PESERTA DIDIK</h1>
            </div>
          )}
          <div className="mb-6">
              <div className="flex justify-between items-start text-sm font-semibold">
                 <table className="w-full">
                    <tbody>
                       <tr>
                          <td className="w-32 py-1">MATA PELAJARAN</td>
                          <td className="py-1">: {quizData.subject.toUpperCase()}</td>
                          <td className="w-20 py-1 pl-4">WAKTU</td>
                          <td className="py-1">: 90 MENIT</td>
                       </tr>
                       <tr>
                          <td className="py-1">KELAS</td>
                          <td className="py-1">: {quizData.grade}</td>
                          <td className="py-1 pl-4">HARI/TGL</td>
                          <td className="py-1">: ............................</td>
                       </tr>
                       <tr>
                          <td className="py-1">TOPIK</td>
                          <td className="py-1" colSpan={3}>: {quizData.topic.toUpperCase() || "-"}</td>
                       </tr>
                    </tbody>
                 </table>
              </div>
              {currentSettings.showName && (
                 <div className="mt-4 border border-black p-2 rounded-sm flex items-center">
                    <span className="font-bold w-24">NAMA SISWA :</span>
                    <div className="flex-1 border-b border-black border-dashed h-4"></div>
                 </div>
              )}
          </div>
          <div className="space-y-8">
              {quizData.sections.map((section, idx) => (
                  <div key={idx} className="break-inside-avoid">
                      <h3 className="font-bold text-base mb-2 uppercase bg-gray-100 p-1 print:bg-transparent print:p-0">
                          {String.fromCharCode(65 + idx)}. {getLabelForType(section.type)}
                      </h3>
                      <p className="italic mb-4 font-medium text-sm">{renderInstruction(section.type)}</p>
                      {renderSectionContent(section.questions, effectiveMode === 'teacher', currentSettings, idx, 'main')}
                  </div>
              ))}
          </div>
          {effectiveMode === 'teacher' && (
            <>
              <div className="mt-8 pt-8 print:break-before-page">
                  <div className="border-b-2 border-black pb-2 mb-4 text-center">
                    <h2 className="font-bold text-xl uppercase">LAMPIRAN GURU: KUNCI JAWABAN & PENSKORAN</h2>
                    <p className="text-sm">Dokumen Rahasia - Pegangan Guru</p>
                  </div>
                  {quizData.sections.map((section, idx) => (
                      <div key={idx} className="mb-8">{renderScoreTable(section, currentSettings)}</div>
                  ))}
              </div>
              {includeRemedial && quizData.remedial.length > 0 && (
                <div className="mt-8 pt-8 print:break-before-page">
                  <div className="text-center border-b-4 border-double border-black pb-2 mb-6">
                    <h1 className="text-xl font-bold uppercase">PROGRAM REMEDIAL</h1>
                    <p className="text-sm font-semibold">UNTUK SISWA DENGAN NILAI DI BAWAH KKM ({quizData.kkm || 75})</p>
                  </div>
                  <div className="mb-6 text-sm font-medium border-b border-black pb-4">
                     <p>Mata Pelajaran: {quizData.subject}</p>
                     <p>Kelas: {quizData.grade}</p>
                     <div className="mt-4 border border-black p-2 flex">
                        <span className="w-24">Nama Siswa:</span>
                        <span className="border-b border-dotted border-black flex-1"></span>
                     </div>
                  </div>
                  {quizData.remedial.map((section, idx) => (
                      <div key={idx} className="mb-6 break-inside-avoid">
                          <h4 className="font-bold underline mb-2 uppercase">{getLabelForType(section.type)}</h4>
                          {renderSectionContent(section.questions, true, currentSettings, idx, 'remedial')}
                          {renderScoreTable(section, currentSettings)}
                      </div>
                  ))}
                </div>
              )}
              {includeEnrichment && quizData.enrichment.length > 0 && (
                <div className="mt-8 pt-8 print:break-before-page">
                  <div className="text-center border-b-4 border-double border-black pb-2 mb-6">
                    <h1 className="text-xl font-bold uppercase">PROGRAM PENGAYAAN</h1>
                    <p className="text-sm font-semibold">UNTUK SISWA DENGAN NILAI DI ATAS KKM ({quizData.kkm || 75})</p>
                  </div>
                   <div className="mb-6 text-sm font-medium border-b border-black pb-4">
                     <p>Mata Pelajaran: {quizData.subject}</p>
                     <p>Kelas: {quizData.grade}</p>
                     <div className="mt-4 border border-black p-2 flex">
                        <span className="w-24">Nama Siswa:</span>
                        <span className="border-b border-dotted border-black flex-1"></span>
                     </div>
                  </div>
                  {quizData.enrichment.map((section, idx) => (
                      <div key={idx} className="mb-6 break-inside-avoid">
                          <h4 className="font-bold underline mb-2 uppercase">{getLabelForType(section.type)}</h4>
                          {renderSectionContent(section.questions, true, currentSettings, idx, 'enrichment')}
                          {renderScoreTable(section, currentSettings)}
                      </div>
                  ))}
                </div>
              )}
            </>
          )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 pb-32 print:p-0 print:pb-0 print:m-0">
      {quizData && (
        <div className="fixed top-0 left-[-10000px] w-[210mm]">
          <div id="pdf-student-view">{renderQuizPaper(undefined, printSettings, 'student')}</div>
          <div id="pdf-teacher-view">{renderQuizPaper(undefined, printSettings, 'teacher')}</div>
        </div>
      )}
      <div className="text-center space-y-2 print:hidden">
        <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center justify-center gap-3">
          <BrainCircuit className="text-blue-400" size={32} />
          Buat Soal (Quiz Generator)
        </h2>
        <p className="text-gray-400">Upload materi, instruksi AI otomatis, dan multi-format soal.</p>
      </div>
      {!quizData && (
        <>
          <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 space-y-6 print:hidden">
            <div className="flex border-b border-gray-700 space-x-4 mb-6">
                <button onClick={() => setActiveTab('form')} className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'form' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-300'}`}>Konfigurasi Soal</button>
                <button onClick={() => setActiveTab('upload')} className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'upload' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-300'}`}>Kelola Materi</button>
                <button onClick={() => setActiveTab('library')} className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'library' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-300'}`}>Bank Materi ({materials.length})</button>
            </div>
            {activeTab === 'upload' && (
               <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                  <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center hover:bg-gray-700/50 transition-colors cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
                     <Upload size={40} className="mx-auto text-gray-500 group-hover:text-blue-400 mb-2 transition-colors" />
                     <p className="text-gray-300 font-medium">Klik untuk upload materi (PDF, Gambar, Teks)</p>
                     <p className="text-xs text-gray-500 mt-1">Materi akan dianalisis oleh AI</p>
                     <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.txt,.doc,.docx,image/*" />
                  </div>
                  {stagingFiles.length > 0 && (
                     <div className="space-y-3">
                        {stagingFiles.map((file, idx) => {
                           const isReady = !!(file.subject && file.grade);
                           return (
                           <div key={idx} className={`bg-gray-700/50 p-4 rounded-xl border flex flex-col md:flex-row gap-4 items-start md:items-center transition-all duration-300 ${isReady ? 'border-green-500/30 shadow-[0_0_15px_-5px_rgba(34,197,94,0.3)]' : 'border-gray-600'}`}>
                              <div className="flex-shrink-0 relative">
                                {typeof file.content === 'string' && file.content.startsWith('data:image') ? <img src={file.content} alt={file.fileName} className="w-16 h-16 object-cover rounded-lg border border-gray-500 bg-black/20" /> : <div className="w-16 h-16 bg-gray-800 rounded-lg border border-gray-600 flex items-center justify-center"><FileText size={24} className="text-gray-400" /></div>}
                                {isReady && <div className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full p-0.5 border-2 border-gray-800"><CheckCircle2 size={10} /></div>}
                              </div>
                              <div className="flex-1 space-y-3 w-full">
                                 <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <span className="font-bold text-white truncate block max-w-[200px] md:max-w-sm text-sm" title={file.fileName}>{file.fileName}</span>
                                        <div className="flex items-center gap-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border ${isReady ? 'bg-green-900/40 text-green-400 border-green-700/50' : 'bg-yellow-900/40 text-yellow-400 border-yellow-700/50'}`}>{isReady ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}{isReady ? 'Siap Disimpan' : 'Lengkapi Info'}</span></div>
                                    </div>
                                    <button onClick={() => removeStagingFile(idx)} className="text-gray-500 hover:text-red-400 p-1 transition-colors"><Trash2 size={16}/></button>
                                 </div>
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                     <select value={file.subject} onChange={(e) => updateStagingFile(idx, 'subject', e.target.value)} className="bg-gray-800 border border-gray-600 rounded text-xs px-2 py-2 text-white focus:ring-1 focus:ring-blue-500 outline-none"><option value="">Pilih Mapel...</option>{SUBJECT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}<option value="LAINNYA">Lainnya...</option></select>
                                     <select value={file.category || 'MATERI'} onChange={(e) => updateStagingFile(idx, 'category', e.target.value)} className="bg-gray-800 border border-gray-600 rounded text-xs px-2 py-2 text-white focus:ring-1 focus:ring-blue-500 outline-none"><option value="" disabled>Kategori...</option>{CATEGORY_OPTIONS.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select>
                                     <input type="text" value={file.grade} onChange={(e) => updateStagingFile(idx, 'grade', e.target.value)} placeholder="Kelas..." className="bg-gray-800 border border-gray-600 rounded text-xs px-2 py-2 text-white focus:ring-1 focus:ring-blue-500 outline-none" />
                                 </div>
                                 <div className="flex justify-end"><button onClick={() => saveStagingFile(idx)} disabled={!isReady} className={`text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 font-bold transition-all ${isReady ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg hover:shadow-green-500/20' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>{isReady ? <Save size={14} /> : <AlertCircle size={14} />}{isReady ? 'Simpan' : 'Isi Data Dulu'}</button></div>
                              </div>
                           </div>
                        )})}
                     </div>
                  )}
               </div>
            )}
            {activeTab === 'library' && (
               <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                  {materials.length === 0 ? <div className="text-center p-8 text-gray-500">Belum ada materi tersimpan.</div> : (
                     <div className="space-y-6">
                        {Object.entries(groupedMaterials).sort().map(([subjectName, categories]) => (
                           <div key={subjectName} className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
                              <div className="p-4 bg-gray-800 border-b border-gray-700 flex items-center gap-2"><BookOpen className="text-blue-400" size={18} /><h3 className="font-bold text-lg text-white">{subjectName}</h3><span className="text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded-full ml-auto">{Object.values(categories).reduce((acc, arr) => acc + arr.length, 0)} Files</span></div>
                              <div className="p-4 space-y-6">
                                 {Object.entries(categories).sort().map(([categoryName, items]) => (
                                    <div key={categoryName}><h4 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-2"><Folder size={14} className="text-yellow-500" /> {categoryName}<span className="text-gray-600 font-normal">({items.length})</span></h4><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pl-4 border-l-2 border-gray-700/50 ml-1.5">{items.map((m) => (<div key={m.id} className="bg-gray-700/30 p-3 rounded-lg border border-gray-600 flex justify-between items-center group hover:bg-gray-700/50 transition-colors"><div className="flex items-center gap-3 overflow-hidden"><div className={`p-2 rounded-lg flex-shrink-0 ${m.type === 'QUIZ' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>{m.type === 'QUIZ' ? <FileSpreadsheet size={16} /> : <FileText size={16} />}</div><div className="truncate min-w-0"><h4 className="font-bold text-sm text-gray-200 truncate" title={m.fileName}>{m.fileName}</h4><p className="text-[10px] text-gray-500 flex gap-2 mt-0.5"><span className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">{m.grade}</span><span>{new Date(m.uploadDate).toLocaleDateString()}</span></p></div></div><button onClick={() => deleteMaterial(m.id)} className="p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button></div>))}</div></div>
                                 ))}
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
            )}
            {activeTab === 'form' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="space-y-4">
                   <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-300"><BookOpen size={16} className="text-blue-400"/> Mata Pelajaran</label>
                      {isCustomSubject ? (
                        <div className="relative"><input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Tulis Nama Mapel..." className="w-full bg-gray-900 border border-gray-600 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none pr-10" /><button onClick={() => { setIsCustomSubject(false); setSubject(''); }} className="absolute right-3 top-3 text-gray-400 hover:text-white"><XCircle size={20} /></button></div>
                      ) : (
                        <select value={subject} onChange={handleMainSubjectChange} className="w-full bg-gray-900 border border-gray-600 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"><option value="" disabled>Pilih Mata Pelajaran</option>{SUBJECT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}<option value="LAINNYA">LAINNYA (Tulis Sendiri)...</option></select>
                      )}
                   </div>
                   <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium text-gray-300"><GraduationCap size={16} className="text-blue-400"/> Kelas</label><input type="text" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Contoh: X, 10, XII" className="w-full bg-gray-900 border border-gray-600 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                </div>
                <div className="space-y-4">
                   <div className="space-y-2 relative">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-300"><Search size={16} className="text-blue-400"/> Topik (Opsional)</label>
                      <div className="relative"><input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} placeholder="Contoh: Aljabar, Ekosistem" className="w-full bg-gray-900 border border-gray-600 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none" />{showSuggestions && trendingTopics.length > 0 && (<div className="absolute top-full left-0 right-0 mt-2 bg-gray-700 border border-gray-600 rounded-xl shadow-2xl overflow-hidden z-50"><div className="px-4 py-2 bg-gray-800 border-b border-gray-600 text-xs font-semibold text-gray-400 flex items-center gap-2"><TrendingUp size={12} /> TRENDING</div>{trendingTopics.map((t, i) => <button key={i} onClick={() => setTopic(t)} className="w-full text-left px-4 py-2 hover:bg-gray-600 text-sm text-gray-200">{t}</button>)}</div>)}</div>
                   </div>
                   <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium text-gray-300"><MessageSquarePlus size={16} className="text-yellow-400"/> Perintah Pembuat Soal (Instruksi Khusus)</label><textarea value={customInstruction} onChange={(e) => setCustomInstruction(e.target.value)} placeholder="Instruksi spesifik (opsional). Jika kosong, AI akan generate berdasarkan Topik/Mapel." className="w-full bg-gray-900 border border-gray-600 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none resize-none h-24 text-sm" /></div>
                </div>
              </div>
            )}
            {activeTab === 'form' && matchedMaterials.length > 0 && (
               <div className="border border-gray-700 bg-gray-800/50 rounded-xl p-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-white flex items-center gap-2"><Bot className="text-purple-400" /> AI Generate Pro: Telaah Materi</h3><div className="flex gap-2 text-xs"><button onClick={() => setSelectedMaterialIds(matchedMaterials.map(m => m.id))} className="bg-blue-600/30 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-600/50 transition-colors">Pilih Semua</button><button onClick={() => setSelectedMaterialIds([])} className="bg-gray-700 text-gray-300 px-3 py-1.5 rounded hover:bg-gray-600 transition-colors">Reset</button></div></div>
                  <div className="overflow-x-auto border border-gray-700 rounded-lg max-h-60 overflow-y-auto custom-scrollbar"><table className="w-full text-left text-sm text-gray-300"><thead className="bg-gray-900 text-gray-400 sticky top-0"><tr><th className="p-3 w-10 text-center">#</th><th className="p-3">Materi Referensi</th><th className="p-3">Uraian</th><th className="p-3 w-20 text-center">Aksi</th></tr></thead><tbody className="divide-y divide-gray-700">{matchedMaterials.map((m, i) => (<tr key={m.id} className="hover:bg-gray-700/30"><td className="p-3 text-center">{i+1}</td><td className="p-3 font-medium text-white">{m.fileName}</td><td className="p-3 text-xs text-gray-400 truncate max-w-xs">{m.content.substring(0, 100)}...</td><td className="p-3 text-center"><input type="checkbox" checked={selectedMaterialIds.includes(m.id)} onChange={(e) => { if (e.target.checked) setSelectedMaterialIds(p => [...p, m.id]); else setSelectedMaterialIds(p => p.filter(id => id !== m.id)); }} className="rounded border-gray-500 bg-gray-800 text-purple-600 w-4 h-4 cursor-pointer" /></td></tr>))}</tbody></table></div>
                  <div className="mt-3 flex gap-4 text-xs text-gray-400 items-center"><span>{selectedMaterialIds.length} materi dipilih untuk ditelaah.</span>{customInstruction && <span className="text-yellow-400 flex items-center gap-1"><Sparkles size={10}/> Fokus pada instruksi khusus aktif.</span>}</div>
                  <div className="mt-4 pt-4 border-t border-gray-700"><div className="flex items-center justify-between"><button onClick={handleGenerateSummary} disabled={generatingSummary} className="flex items-center gap-2 text-sm font-bold text-yellow-400 hover:text-yellow-300 transition-colors bg-yellow-400/10 px-4 py-2 rounded-lg border border-yellow-400/20 hover:bg-yellow-400/20">{generatingSummary ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}{materialSummary ? "Perbarui Ringkasan" : "Buat Ringkasan AI"}</button>{materialSummary && !generatingSummary && (<button onClick={() => setShowSummary(!showSummary)} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs">{showSummary ? "Sembunyikan" : "Tampilkan"}{showSummary ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>)}</div>{showSummary && (<div className="mt-4 bg-gray-900 rounded-xl border border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-2"><div className="flex items-center justify-between p-3 bg-gray-800 border-b border-gray-700"><h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2"><Bot size={14} className="text-blue-400"/> Ringkasan Materi</h4></div><div className="p-4 text-sm text-gray-300 leading-relaxed max-h-60 overflow-y-auto custom-scrollbar prose prose-invert prose-sm max-w-none">{generatingSummary ? (<div className="flex flex-col items-center justify-center py-8 text-gray-500 gap-2"><Loader2 className="animate-spin text-blue-500" size={24} /> <span className="animate-pulse">Sedang menganalisis konten materi...</span></div>) : (<ReactMarkdown>{materialSummary}</ReactMarkdown>)}</div></div>)}</div>
               </div>
            )}
            {activeTab === 'form' && (
            <div className="border-t border-gray-700 pt-6 space-y-6">
                <div className="space-y-4"><h4 className="font-bold text-lg text-white">Bentuk Soal & Tingkat Kesulitan</h4><p className="text-sm text-gray-400">Centang jenis soal yang ingin dibuat. Masing-masing bagian memiliki skor maksimal 100.</p><div className="flex flex-wrap gap-6 p-4 bg-gray-900 rounded-xl border border-gray-700">{(['MULTIPLE_CHOICE', 'SHORT_ANSWER', 'ESSAY'] as QuestionType[]).map(type => (<label key={type} className="flex items-center gap-2 cursor-pointer group"><div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedTypes.includes(type) ? 'bg-blue-600 border-blue-600' : 'border-gray-500 group-hover:border-blue-400'}`}>{selectedTypes.includes(type) && <Check size={14} className="text-white" />}</div><input type="checkbox" className="hidden" checked={selectedTypes.includes(type)} onChange={(e) => { if (e.target.checked) setSelectedTypes(p => [...p, type]); else setSelectedTypes(p => p.filter(t => t !== type)); }} /><span className={`text-sm font-medium ${selectedTypes.includes(type) ? 'text-white' : 'text-gray-400'}`}>{getLabelForType(type)}</span></label>))}</div>{selectedTypes.map(type => (<div key={type} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-gray-700/20 p-4 rounded-xl border border-gray-700/50"><div className="md:col-span-3 font-bold text-blue-300 text-sm flex items-center gap-2"><Hash size={16}/> {getLabelForType(type)}</div><div className="md:col-span-9 grid grid-cols-4 gap-4">{['easy', 'medium', 'hard'].map((diff) => (<div key={diff}><label className="text-[10px] uppercase text-gray-500 block mb-1 font-bold">{diff}</label><input type="number" min="0" value={configPerType[type][diff as keyof QuizDistribution]} onChange={(e) => { const val = parseInt(e.target.value) || 0; setConfigPerType(prev => ({ ...prev, [type]: { ...prev[type], [diff]: val } })); }} className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-center text-white text-sm" /></div>))}<div><label className="text-[10px] uppercase text-blue-500 block mb-1 font-bold">Total</label><div className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-center text-white text-sm font-bold">{configPerType[type].easy + configPerType[type].medium + configPerType[type].hard}</div></div></div></div>))}</div>
                <div className="bg-gray-700/30 p-4 rounded-xl border border-gray-600 space-y-6"><div className="flex items-center justify-between border-b border-gray-600 pb-2"><div className="flex items-center gap-2 text-sm font-bold text-gray-300"><Layers size={16} className="text-purple-400" />Konfigurasi Remedial & Pengayaan (Skor Max 100)</div><div className="flex items-center gap-2"><label className="text-xs text-gray-400 font-bold">KKM:</label><input type="number" min="0" max="100" value={kkm} onChange={(e) => setKkm(parseInt(e.target.value) || 0)} className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white w-14 text-center text-xs" /></div></div><div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center"><div className="md:col-span-3 flex items-center justify-between"><span className="text-sm font-bold text-gray-400">REMEDIAL</span><label className="flex items-center gap-2 cursor-pointer"><span className="text-xs text-gray-500">Aktif</span><input type="checkbox" checked={includeRemedial} onChange={e => setIncludeRemedial(e.target.checked)} className="rounded bg-gray-800 border-gray-500 text-purple-600" /></label></div><div className={`md:col-span-9 grid grid-cols-4 gap-4 ${!includeRemedial ? 'opacity-50 pointer-events-none' : ''}`}>{['MULTIPLE_CHOICE', 'SHORT_ANSWER', 'ESSAY'].map((t) => (<div key={t}><label className="text-[10px] text-gray-500 block mb-1">{t === 'MULTIPLE_CHOICE' ? 'PG' : t === 'SHORT_ANSWER' ? 'Isian' : 'Uraian'}</label><input type="number" min="0" value={remedialCounts[t as QuestionType]} onChange={e => setRemedialCounts(p => ({...p, [t]: parseInt(e.target.value)||0}))} className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-center text-white text-sm" /></div>))}<div><label className="text-[10px] text-blue-500 block mb-1">Total</label><div className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-center text-white text-sm font-bold">{remedialCounts.MULTIPLE_CHOICE + remedialCounts.SHORT_ANSWER + remedialCounts.ESSAY}</div></div></div></div><div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center"><div className="md:col-span-3 flex items-center justify-between"><span className="text-sm font-bold text-gray-400">PENGAYAAN</span><label className="flex items-center gap-2 cursor-pointer"><span className="text-xs text-gray-500">Aktif</span><input type="checkbox" checked={includeEnrichment} onChange={e => setIncludeEnrichment(e.target.checked)} className="rounded bg-gray-800 border-gray-500 text-purple-600" /></label></div><div className={`md:col-span-9 grid grid-cols-4 gap-4 ${!includeEnrichment ? 'opacity-50 pointer-events-none' : ''}`}>{['MULTIPLE_CHOICE', 'SHORT_ANSWER', 'ESSAY'].map((t) => (<div key={t}><label className="text-[10px] text-gray-500 block mb-1">{t === 'MULTIPLE_CHOICE' ? 'PG' : t === 'SHORT_ANSWER' ? 'Isian' : 'Uraian'}</label><input type="number" min="0" value={enrichmentCounts[t as QuestionType]} onChange={e => setEnrichmentCounts(p => ({...p, [t]: parseInt(e.target.value)||0}))} className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-center text-white text-sm" /></div>))}<div><label className="text-[10px] text-blue-500 block mb-1">Total</label><div className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-center text-white text-sm font-bold">{enrichmentCounts.MULTIPLE_CHOICE + enrichmentCounts.SHORT_ANSWER + enrichmentCounts.ESSAY}</div></div></div></div></div>
                <button onClick={handleGenerate} disabled={loading} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-semibold shadow-lg transition-all flex items-center justify-center gap-2">{loading ? <Loader2 className="animate-spin" /> : 'Generate Paket Soal Lengkap'}</button>
            </div>
            )}
          </div>
        </>
      )}
      {quizData && (
        <div className="space-y-4">
           <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex flex-col gap-4 print:hidden">
              <div className="flex flex-wrap justify-between items-center gap-4">
                 <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700"><button onClick={() => setViewMode('student')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${viewMode === 'student' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}><User size={16} /> Tampilan Siswa</button><button onClick={() => setViewMode('teacher')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${viewMode === 'teacher' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}><UserCog size={16} /> Tampilan Guru</button></div>
                 <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={handleSaveQuiz}
                      className={`px-3 py-2 rounded text-xs flex items-center gap-1.5 transition-all font-bold ${saveSuccess ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'}`}
                    >
                      {saveSuccess ? <CheckCircle size={16}/> : <Save size={16}/>}
                      {saveSuccess ? 'Tersimpan!' : 'Simpan ke Bank Soal'}
                    </button>
                    <div className="w-px h-6 bg-gray-700 mx-1"></div>
                    <button onClick={() => handleExportPDF('student')} disabled={exportingPdf} className="px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/50 hover:border-blue-500 rounded text-xs flex items-center gap-1 transition-colors">{exportingPdf ? <Loader2 size={16} className="animate-spin"/> : <FileDown size={16}/>}Export PDF (Siswa)</button><button onClick={() => handleExportPDF('teacher')} disabled={exportingPdf} className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/50 hover:border-purple-500 rounded text-xs flex items-center gap-1 transition-colors">{exportingPdf ? <Loader2 size={16} className="animate-spin"/> : <FileDown size={16}/>}Export PDF (Guru)</button><div className="w-px h-6 bg-gray-600 mx-1"></div><button onClick={() => setShowPrintModal(true)} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs flex items-center gap-1"><Printer size={16}/> Print Preview</button><button onClick={() => setQuizData(null)} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs">Kembali</button>
                 </div>
              </div>
              {groundingSources.length > 0 && (<div className="w-full pt-3 mt-2 border-t border-gray-700"><p className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1"><Search size={12} className="text-blue-400"/> Sumber Referensi (Google Search):</p><div className="flex flex-wrap gap-2">{groundingSources.map((s: any, i: number) => (<a key={i} href={s.web.uri} target="_blank" rel="noreferrer" className="text-[10px] bg-gray-900 border border-gray-700 hover:border-blue-500 text-blue-300 px-2 py-1 rounded-lg truncate max-w-[200px] transition-colors">{s.web.title || s.web.uri}</a>))}</div></div>)}
           </div>
           {renderQuizPaper(undefined, { showHeader: true, showName: true, showRubric: true, fontSize: 'text-sm', compactMode: false })}
           {showPrintModal && (
              <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex justify-center items-center print:bg-white print:block print:static">
                 <div className="w-full h-full flex flex-col md:flex-row overflow-hidden print:block print:h-auto">
                    <div className="w-full md:w-80 bg-gray-900 border-r border-gray-800 p-6 flex-shrink-0 flex flex-col gap-6 print:hidden overflow-y-auto max-h-[50vh] md:max-h-full md:h-full border-b md:border-b-0"><div className="flex justify-between items-center border-b border-gray-800 pb-4"><h3 className="text-xl font-bold text-white flex items-center gap-2"><Settings2 className="text-purple-400" /> Print Settings</h3><button onClick={() => setShowPrintModal(false)} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-800"><X size={20}/></button></div><div className="space-y-4"><div className="space-y-3"><label className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Layout Content</label><div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"><span className="text-sm text-gray-300">Header (Kop Surat)</span><input type="checkbox" checked={printSettings.showHeader} onChange={e => setPrintSettings(p => ({...p, showHeader: e.target.checked}))} className="rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500" /></div><div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"><span className="text-sm text-gray-300">Identitas Siswa</span><input type="checkbox" checked={printSettings.showName} onChange={e => setPrintSettings(p => ({...p, showName: e.target.checked}))} className="rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500" /></div></div><div className="mt-auto pt-6 border-t border-gray-800"><button onClick={() => window.print()} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"><Printer size={20} /> Cetak Sekarang (Print)</button></div></div></div>
                    <div className="flex-1 bg-gray-800/50 overflow-y-auto p-4 md:p-12 flex justify-center print:p-0 print:overflow-visible print:block min-h-[50vh]">{renderQuizPaper('quiz-print-area', printSettings)}</div>
                 </div>
              </div>
           )}
        </div>
      )}
    </div>
  );
};

export default QuizGenerator;
