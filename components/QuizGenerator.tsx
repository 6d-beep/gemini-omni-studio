import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { generateQuiz, getTrendingQuizTopics, generateMaterialSummary } from '../services/geminiService';
import { QuizData, QuestionType, ReferenceMaterial, QuizQuestion, QuizDistribution, QuizSection } from '../types';
import { 
  BrainCircuit, Loader2, Search, TrendingUp, Download, Save, 
  BookOpen, FileText, Hash, GraduationCap, Upload, Trash2, 
  Folder, Check, Printer, User, UserCog, Layers, MessageSquarePlus, 
  FileSpreadsheet, FileImage, File, Archive, XCircle,
  Sparkles, ChevronDown, ChevronUp, RefreshCw, Eye, X, Settings2, Layout, Copy, CheckSquare, Square,
  Bot, Tag, FileDown, CheckCircle2, AlertCircle, ClipboardList
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
  
  // Custom Subject Logic for Main Form
  const [isCustomSubject, setIsCustomSubject] = useState(() => {
    return !!(draftConfig.subject && !SUBJECT_OPTIONS.includes(draftConfig.subject));
  });

  // Remedial & Enrichment Configuration (Counts per type)
  const [includeRemedial, setIncludeRemedial] = useState(draftConfig.includeRemedial !== false);
  const [includeEnrichment, setIncludeEnrichment] = useState(draftConfig.includeEnrichment !== false);
  
  const [remedialCounts, setRemedialCounts] = useState<Record<QuestionType, number>>(
    draftConfig.remedialCounts || { 'MULTIPLE_CHOICE': 5, 'SHORT_ANSWER': 0, 'ESSAY': 0 }
  );
  const [enrichmentCounts, setEnrichmentCounts] = useState<Record<QuestionType, number>>(
    draftConfig.enrichmentCounts || { 'MULTIPLE_CHOICE': 0, 'SHORT_ANSWER': 0, 'ESSAY': 2 }
  );

  // Material Management State
  const [materials, setMaterials] = useState<ReferenceMaterial[]>(() => {
    try {
      const saved = localStorage.getItem('quiz_materials');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  // AI Generate Pro / Material Table State
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [matchedMaterials, setMatchedMaterials] = useState<ReferenceMaterial[]>([]);
  const [materialSummary, setMaterialSummary] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  
  // Staging area for newly uploaded files
  const [stagingFiles, setStagingFiles] = useState<Omit<ReferenceMaterial, 'id' | 'uploadDate'>[]>([]);
  
  // View State
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'library' | 'form'>('form');
  const [viewMode, setViewMode] = useState<'student' | 'teacher'>('student');
  
  // Print Preview State
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printSettings, setPrintSettings] = useState({
    showHeader: true,
    showName: true,
    showRubric: true,
    fontSize: 'text-sm', 
    compactMode: false
  });
  
  // Suggestions State
  const [trendingTopics, setTrendingTopics] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist materials
  useEffect(() => {
    localStorage.setItem('quiz_materials', JSON.stringify(materials));
  }, [materials]);

  // Persist Draft Config
  useEffect(() => {
    const config = {
      subject,
      grade,
      topic,
      customInstruction,
      selectedTypes,
      configPerType,
      includeRemedial,
      includeEnrichment,
      remedialCounts,
      enrichmentCounts,
      kkm
    };
    localStorage.setItem('quiz_draft_config_v2', JSON.stringify(config));
  }, [subject, grade, topic, customInstruction, selectedTypes, configPerType, includeRemedial, includeEnrichment, remedialCounts, enrichmentCounts, kkm]);

  // Fetch trending topics on mount
  useEffect(() => {
    getTrendingQuizTopics().then(setTrendingTopics);
  }, []);

  // Effect: Update Matched Materials when Subject/Grade changes
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

  // Group Materials by Subject -> Category
  const groupedMaterials = useMemo(() => {
    const groups: Record<string, Record<string, ReferenceMaterial[]>> = {};
    
    materials.forEach(m => {
      const subj = m.subject ? m.subject.toUpperCase() : 'TANPA MAPEL';
      const cat = m.category ? m.category.toUpperCase() : 'LAINNYA';

      if (!groups[subj]) {
        groups[subj] = {};
      }
      if (!groups[subj][cat]) {
        groups[subj][cat] = [];
      }
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

      if (isBinary) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  // Fix: Spread types may only be created from object types.
  // Using a type assertion to inform TypeScript that copy[index] is a spreadable object.
  const updateStagingFile = (index: number, field: string, value: string) => {
    setStagingFiles(prev => {
      const copy = [...prev];
      const currentItem = copy[index];
      if (currentItem) {
        copy[index] = { ...currentItem, [field]: value } as Omit<ReferenceMaterial, 'id' | 'uploadDate'>;
      }
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
      const sectionConfigs = selectedTypes.map(type => ({
        type,
        distribution: configPerType[type]
      }));

      const cleanRemedial = Object.fromEntries(
         Object.entries(remedialCounts).filter(([_, count]) => (count as number) > 0)
      );
      const cleanEnrichment = Object.fromEntries(
         Object.entries(enrichmentCounts).filter(([_, count]) => (count as number) > 0)
      );

      const { quiz, groundingMetadata } = await generateQuiz(
        topic, 
        subject, 
        grade,
        sectionConfigs,
        finalMaterials, 
        customInstruction, 
        includeRemedial ? cleanRemedial : {},
        includeEnrichment ? cleanEnrichment : {}
      );
      
      quiz.kkm = kkm; 
      setQuizData(quiz);
      setGroundingSources(groundingMetadata?.groundingChunks || []);

       const newSavedQuiz: ReferenceMaterial = {
        id: Date.now().toString(),
        type: 'QUIZ',
        category: 'BANK SOAL',
        fileName: `SOAL: ${quiz.topic || 'Tanpa Topik'} (${new Date().toLocaleDateString()})`,
        content: quiz,
        subject: quiz.subject,
        grade: quiz.grade,
        uploadDate: Date.now()
      };
      
      setMaterials(prev => [...prev, newSavedQuiz]);

    } catch (error) {
      console.error("Quiz Gen Error:", error);
      alert("Gagal membuat soal. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
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
            
            if (!element) {
                alert("Element tidak ditemukan.");
                setExportingPdf(false);
                return;
            }

            const pdfWidth = 210;
            const pdfHeight = 297;

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                windowWidth: pdfWidth * 3.7795275591,
                x: 0,
                y: 0
            });

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
      case 'MULTIPLE_CHOICE': return "Berilah tanda silang (X) pada huruf A, B, C, atau D pada jawaban yang benar!";
      case 'SHORT_ANSWER': return "Isilah titik-titik di bawah ini dengan jawaban yang benar dan tepat!";
      case 'ESSAY': return "Jawablah pertanyaan-pertanyaan berikut dengan uraian yang jelas dan benar!";
      default: return "Kerjakan soal berikut dengan teliti.";
    }
  };

  const renderSectionContent = (questions: QuizQuestion[], showAnswers: boolean, settings: typeof printSettings) => {
    const spacingClass = settings.compactMode ? 'space-y-4' : 'space-y-7';
    
    return (
      <div className={spacingClass}>
        {questions.map((q, idx) => (
          <div key={idx} className="break-inside-avoid">
            <div className="flex gap-3">
              <span className="font-bold min-w-[24px] text-right">{idx + 1}.</span>
              <div className="flex-1">
                <div className="mb-3 text-justify leading-relaxed">
                    <ReactMarkdown>{q.question}</ReactMarkdown>
                </div>
                {q.type === 'MULTIPLE_CHOICE' && q.options && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-2 ml-1 mt-2">
                    {q.options.map((opt, i) => (
                       <div key={i} className="flex gap-3 items-start">
                          <span className="font-bold">{String.fromCharCode(65 + i)}.</span>
                          <span className="flex-1">{opt}</span>
                       </div>
                    ))}
                  </div>
                )}
                {q.type !== 'MULTIPLE_CHOICE' && !showAnswers && (
                  <div className={`mt-3 border-b-2 border-black border-dotted w-full opacity-40 ${settings.compactMode ? 'h-6' : 'h-24'}`}></div>
                )}
                {showAnswers && (
                   <div className="mt-4 text-[13px] bg-gray-50 border border-gray-300 p-4 rounded print:bg-transparent print:border-black print:border-dotted">
                      <p><strong>Kunci:</strong> <span className="font-bold uppercase">{q.correctAnswer}</span></p>
                      <p className="mt-2 text-xs text-gray-600 print:text-black italic"><strong>Penjelasan:</strong> {q.explanation}</p>
                   </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderScoreTable = (section: QuizSection) => {
    const scorePerItem = calculateRoundedScore(100, section.questions.length);
    const totalScore = scorePerItem * section.questions.length;

    return (
      <div className="mt-8 break-inside-avoid">
        <h5 className="font-bold text-[13px] mb-3 uppercase border-b-2 border-black inline-block pb-1">
            Rubrik & Kunci: {getLabelForType(section.type)}
        </h5>
        <table className="w-full border-collapse border-2 border-black text-[11px]">
          <thead>
            <tr className="bg-gray-200">
               <th className="border-2 border-black p-2 w-12 text-center">No</th>
               <th className="border-2 border-black p-2 text-left">Kunci Jawaban / Kriteria Penilaian</th>
               <th className="border-2 border-black p-2 w-24 text-center">Skor Maks</th>
            </tr>
          </thead>
          <tbody>
            {section.questions.map((q, i) => (
              <tr key={i}>
                <td className="border-2 border-black p-2 text-center font-bold">{i+1}</td>
                <td className="border-2 border-black p-2">
                   <div className="font-medium">{q.correctAnswer}</div>
                </td>
                <td className="border-2 border-black p-2 text-center font-bold">{scorePerItem}</td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-100">
              <td colSpan={2} className="border-2 border-black p-2 text-right uppercase">Total Nilai Maksimal</td>
              <td className="border-2 border-black p-2 text-center text-[14px]">{totalScore}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderFollowUpSection = (quiz: QuizData) => {
    return (
      <div className="mt-16 pt-16 border-t-4 border-double border-black print:break-before-page break-inside-avoid">
         <div className="text-center mb-10">
            <h2 className="font-black text-[20px] uppercase">VII. ANALISIS DAN TINDAK LANJUT HASIL BELAJAR</h2>
            <p className="text-[14px] font-bold mt-1">KRITERIA KETUNTASAN MINIMAL (KKM): {quiz.kkm || 75}</p>
         </div>

         <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed">
                 Berdasarkan hasil analisis penilaian harian/semester, rencana tindak lanjut yang akan dilaksanakan adalah:
              </p>
              
              <table className="w-full border-collapse border-2 border-black text-[12px]">
                 <thead>
                    <tr className="bg-gray-100">
                       <th className="border-2 border-black p-3 w-[45%] text-left">Program Tindak Lanjut</th>
                       <th className="border-2 border-black p-3 w-[15%] text-center">Jumlah Siswa</th>
                       <th className="border-2 border-black p-3 text-left">Keterangan</th>
                    </tr>
                 </thead>
                 <tbody>
                    <tr className="h-12">
                       <td className="border-2 border-black p-3 font-bold">1. Program Perbaikan (Remedial)</td>
                       <td className="border-2 border-black p-3"></td>
                       <td className="border-2 border-black p-3 italic text-gray-500 font-medium">Bagi siswa dengan Nilai < {quiz.kkm || 75}</td>
                    </tr>
                    <tr className="h-12">
                       <td className="border-2 border-black p-3 font-bold">2. Program Pengayaan (Enrichment)</td>
                       <td className="border-2 border-black p-3"></td>
                       <td className="border-2 border-black p-3 italic text-gray-500 font-medium">Bagi siswa dengan Nilai ≥ {quiz.kkm || 75}</td>
                    </tr>
                 </tbody>
              </table>
            </div>

            <div className="mt-20 grid grid-cols-2 gap-24">
               <div className="text-center space-y-20">
                  <div>
                    <p className="text-[13px]">Mengetahui,</p>
                    <p className="text-[13px] font-bold">Kepala Sekolah</p>
                  </div>
                  <div>
                    <p className="font-bold underline text-[13px]">(..........................................................)</p>
                    <p className="text-[11px]">NIP. ......................................................</p>
                  </div>
               </div>
               <div className="text-center space-y-20">
                  <div>
                    <p className="text-[13px]">[Kabupaten/Kota], ................................ 202...</p>
                    <p className="text-[13px] font-bold">Guru Mata Pelajaran,</p>
                  </div>
                  <div>
                    <p className="font-bold underline text-[13px]">(..........................................................)</p>
                    <p className="text-[11px]">NIP. ......................................................</p>
                  </div>
               </div>
            </div>
         </div>
      </div>
    );
  };

  const renderQuizPaper = (id: string | undefined, currentSettings: typeof printSettings, modeOverride?: 'student' | 'teacher') => {
    if (!quizData) return null;
    const effectiveMode = modeOverride || viewMode;

    return (
      <div 
        id={id} 
        className={`bg-white text-black mx-auto shadow-2xl print:shadow-none p-[1.5cm] max-w-[210mm] min-h-[297mm] print:w-[210mm] print:max-w-[210mm] print:m-0 print:p-[1.5cm] overflow-hidden ${currentSettings.fontSize} font-serif leading-normal`}
      >
          {/* --- SCHOOL HEADER (KOP) --- */}
          {currentSettings.showHeader && (
            <div className="text-center border-b-[4px] border-double border-black pb-4 mb-8">
              <h2 className="text-[18px] font-bold tracking-[0.1em] uppercase leading-tight">PEMERINTAH DAERAH PROVINSI [....................]</h2>
              <h2 className="text-[18px] font-bold tracking-[0.1em] uppercase leading-tight">DINAS PENDIDIKAN DAN KEBUDAYAAN</h2>
              <h1 className="text-[22px] font-black tracking-[0.1em] uppercase mt-2 leading-tight">SATUAN PENDIDIKAN [NAMA SEKOLAH ANDA]</h1>
              <p className="text-[12px] font-sans italic mt-1 font-medium">Alamat: [Isi Alamat Sekolah Lengkap] - Kode Pos: [.....] - Telp: (021) 123456</p>
            </div>
          )}

          {/* --- QUIZ DETAILS HEADER --- */}
          <div className="mb-8">
              <div className="text-center mb-8">
                <h1 className="text-[20px] font-black uppercase underline underline-offset-4 decoration-2">
                  NASKAH SOAL PENILAIAN AKHIR SEMESTER
                </h1>
                <p className="font-bold text-[14px] mt-1 uppercase tracking-wider">TAHUN PELAJARAN 2024 / 2025</p>
              </div>
              
              <div className="border-2 border-black p-5">
                <table className="w-full text-[13px] font-bold">
                    <tbody>
                        <tr>
                            <td className="w-[30%] py-1">Mata Pelajaran</td>
                            <td className="w-[35%] py-1">: {quizData.subject.toUpperCase()}</td>
                            <td className="w-[15%] py-1 pl-4">Hari/Tgl</td>
                            <td className="w-[20%] py-1">: ........................</td>
                        </tr>
                        <tr>
                            <td className="py-1">Kelas / Semester</td>
                            <td className="py-1">: {quizData.grade} / GANJIL</td>
                            <td className="py-1 pl-4">Waktu</td>
                            <td className="py-1">: 90 Menit</td>
                        </tr>
                        <tr>
                            <td className="py-1 align-top">Pokok Bahasan</td>
                            <td className="py-1 align-top" colSpan={3}>: {quizData.topic.toUpperCase() || "-"}</td>
                        </tr>
                    </tbody>
                </table>
              </div>

              {currentSettings.showName && (
                 <div className="mt-5 grid grid-cols-12 gap-4">
                    <div className="col-span-8 border-2 border-black p-3 flex items-center gap-3">
                       <span className="font-bold text-[13px] whitespace-nowrap">NAMA :</span>
                       <div className="flex-1 border-b-2 border-black border-dotted h-5"></div>
                    </div>
                    <div className="col-span-4 border-2 border-black p-3 flex items-center gap-3">
                       <span className="font-bold text-[13px] whitespace-nowrap">NO. PESERTA :</span>
                       <div className="flex-1 border-b-2 border-black border-dotted h-5"></div>
                    </div>
                 </div>
              )}
          </div>

          {/* --- MAIN QUIZ CONTENT --- */}
          <div className="space-y-12">
              {quizData.sections.map((section, idx) => (
                  <div key={idx} className="quiz-section-block">
                      <div className="flex items-center gap-4 mb-4 border-b-2 border-black/20 pb-2">
                        <span className="bg-black text-white px-3 py-1 font-bold text-[14px] leading-none">{String.fromCharCode(65 + idx)}</span>
                        <h3 className="font-black text-[16px] uppercase tracking-wider">
                           {getLabelForType(section.type)}
                        </h3>
                      </div>
                      <p className="italic mb-8 font-bold text-[13px] text-gray-800 leading-relaxed bg-gray-100 p-3 border-l-4 border-black/30 print:bg-transparent">
                          {renderInstruction(section.type)}
                      </p>
                      <div className="questions-container">
                        {renderSectionContent(section.questions, effectiveMode === 'teacher', currentSettings)}
                      </div>
                  </div>
              ))}
          </div>

          {/* --- TEACHER ONLY APPENDICES --- */}
          {effectiveMode === 'teacher' && (
            <div className="teacher-appendices">
              {/* Answer Key Section */}
              <div className="mt-16 pt-16 border-t-4 border-double border-black print:break-before-page">
                  <div className="text-center mb-10">
                    <h2 className="font-black text-[22px] uppercase">LAMPIRAN PEGANGAN GURU</h2>
                    <p className="text-[12px] font-bold bg-black text-white inline-block px-6 py-1 mt-2 print:bg-transparent print:text-black print:border-2 print:border-black">KUNCI JAWABAN & PEDOMAN PENSKORAN</p>
                  </div>
                  
                  <div className="space-y-12">
                    {quizData.sections.map((section, idx) => (
                        <div key={idx}>
                            {renderScoreTable(section)}
                        </div>
                    ))}
                  </div>
              </div>

              {/* REMEDIAL SECTION */}
              {includeRemedial && quizData.remedial.length > 0 && (
                <div className="mt-16 pt-16 border-t-4 border-double border-black print:break-before-page">
                  <div className="text-center border-b-2 border-black pb-5 mb-10">
                    <h1 className="text-[20px] font-black uppercase">PROGRAM PERBAIKAN (REMEDIAL)</h1>
                    <p className="text-[12px] font-bold italic mt-2 text-red-700 print:text-black">Diberikan kepada peserta didik yang belum tuntas KKM ({quizData.kkm || 75})</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6 mb-10 text-[13px] font-bold uppercase">
                     <div className="border-2 border-black p-4">MAPEL: {quizData.subject}</div>
                     <div className="border-2 border-black p-4">KELAS: {quizData.grade}</div>
                  </div>

                  <div className="space-y-12">
                    {quizData.remedial.map((section, idx) => (
                        <div key={idx}>
                            <h4 className="font-black text-[15px] underline mb-6 uppercase decoration-2 underline-offset-4">{getLabelForType(section.type)} (REMEDIAL)</h4>
                            {renderSectionContent(section.questions, true, currentSettings)}
                            {renderScoreTable(section)}
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ENRICHMENT SECTION */}
              {includeEnrichment && quizData.enrichment.length > 0 && (
                <div className="mt-16 pt-16 border-t-4 border-double border-black print:break-before-page">
                  <div className="text-center border-b-2 border-black pb-5 mb-10">
                    <h1 className="text-[20px] font-black uppercase">PROGRAM PENGAYAAN (ENRICHMENT)</h1>
                    <p className="text-[12px] font-bold italic mt-2 text-green-700 print:text-black">Diberikan kepada peserta didik yang telah melampaui KKM ({quizData.kkm || 75})</p>
                  </div>

                  <div className="grid grid-cols-2 gap-6 mb-10 text-[13px] font-bold uppercase">
                     <div className="border-2 border-black p-4">MAPEL: {quizData.subject}</div>
                     <div className="border-2 border-black p-4">KELAS: {quizData.grade}</div>
                  </div>

                  <div className="space-y-12">
                    {quizData.enrichment.map((section, idx) => (
                        <div key={idx}>
                            <h4 className="font-black text-[15px] underline mb-6 uppercase decoration-2 underline-offset-4">{getLabelForType(section.type)} (PENGAYAAN)</h4>
                            {renderSectionContent(section.questions, true, currentSettings)}
                            {renderScoreTable(section)}
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* NEW: FOLLOW-UP (Tindak Lanjut) SECTION */}
              {renderFollowUpSection(quizData)}
            </div>
          )}
          
          {/* Print Footer */}
          <div className="mt-16 pt-6 border-t border-gray-200 text-center text-[10px] text-gray-400 print:hidden italic">
             Omni-Studio | Sistem Penilaian Otomatis Berbasis Kecerdasan Buatan (AI)
          </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 pb-32 print:p-0 print:pb-0 print:m-0">
      {/* Hidden PDF Targets */}
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
        <p className="text-gray-400">
          Buat soal berkualitas standar nasional dengan telaah materi AI yang mendalam.
        </p>
      </div>

      {!quizData && (
        <>
          {/* Main Configuration Card */}
          <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 space-y-6 print:hidden">
            
            {/* --- TOP TABS --- */}
            <div className="flex border-b border-gray-700 space-x-4 mb-6">
                <button
                    onClick={() => setActiveTab('form')}
                    className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'form' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-300'}`}
                >
                    Konfigurasi Soal
                </button>
                <button
                    onClick={() => setActiveTab('upload')}
                    className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'upload' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-300'}`}
                >
                    Kelola Materi
                </button>
                <button
                    onClick={() => setActiveTab('library')}
                    className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'library' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-300'}`}
                >
                    Bank Materi ({materials.length})
                </button>
            </div>

            {/* TAB: MATERIAL MANAGEMENT (UPLOAD) */}
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
                                {typeof file.content === 'string' && file.content.startsWith('data:image') ? (
                                    <img 
                                        src={file.content} 
                                        alt={file.fileName} 
                                        className="w-16 h-16 object-cover rounded-lg border border-gray-500 bg-black/20" 
                                    />
                                ) : (
                                    <div className="w-16 h-16 bg-gray-800 rounded-lg border border-gray-600 flex items-center justify-center">
                                        <FileText size={24} className="text-gray-400" />
                                    </div>
                                )}
                                {isReady && (
                                    <div className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full p-0.5 border-2 border-gray-800">
                                        <CheckCircle2 size={10} />
                                    </div>
                                )}
                              </div>

                              <div className="flex-1 space-y-3 w-full">
                                 <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <span className="font-bold text-white truncate block max-w-[200px] md:max-w-sm text-sm" title={file.fileName}>{file.fileName}</span>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                                                isReady 
                                                ? 'bg-green-900/40 text-green-400 border-green-700/50' 
                                                : 'bg-yellow-900/40 text-yellow-400 border-yellow-700/50'
                                            }`}>
                                                {isReady ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                                                {isReady ? 'Siap Disimpan' : 'Lengkapi Info'}
                                            </span>
                                        </div>
                                    </div>
                                    <button onClick={() => removeStagingFile(idx)} className="text-gray-500 hover:text-red-400 p-1 transition-colors"><Trash2 size={16}/></button>
                                 </div>
                                 
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                     <select value={file.subject} onChange={(e) => updateStagingFile(idx, 'subject', e.target.value)} className="bg-gray-800 border border-gray-600 rounded text-xs px-2 py-2 text-white focus:ring-1 focus:ring-blue-500 outline-none">
                                        <option value="">Pilih Mapel...</option>
                                        {SUBJECT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        <option value="LAINNYA">Lainnya...</option>
                                     </select>
                                     <select value={file.category || 'MATERI'} onChange={(e) => updateStagingFile(idx, 'category', e.target.value)} className="bg-gray-800 border border-gray-600 rounded text-xs px-2 py-2 text-white focus:ring-1 focus:ring-blue-500 outline-none">
                                        <option value="" disabled>Kategori...</option>
                                        {CATEGORY_OPTIONS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                     </select>
                                     <input type="text" value={file.grade} onChange={(e) => updateStagingFile(idx, 'grade', e.target.value)} placeholder="Kelas..." className="bg-gray-800 border border-gray-600 rounded text-xs px-2 py-2 text-white focus:ring-1 focus:ring-blue-500 outline-none" />
                                 </div>
                                 <div className="flex justify-end">
                                    <button 
                                        onClick={() => saveStagingFile(idx)} 
                                        disabled={!isReady}
                                        className={`text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 font-bold transition-all ${
                                            isReady 
                                            ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg hover:shadow-green-500/20' 
                                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                        }`}
                                    >
                                       {isReady ? <Save size={14} /> : <AlertCircle size={14} />}
                                       {isReady ? 'Simpan' : 'Isi Data Dulu'}
                                    </button>
                                 </div>
                              </div>
                           </div>
                        )})}
                     </div>
                  )}
               </div>
            )}

            {/* TAB: LIBRARY */}
            {activeTab === 'library' && (
               <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                  {materials.length === 0 ? (
                     <div className="text-center p-8 text-gray-500">Belum ada materi tersimpan.</div>
                  ) : (
                     <div className="space-y-6">
                        {Object.entries(groupedMaterials).sort().map(([subjectName, categories]) => (
                           <div key={subjectName} className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
                              <div className="p-4 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
                                 <BookOpen className="text-blue-400" size={18} />
                                 <h3 className="font-bold text-lg text-white">{subjectName}</h3>
                                 <span className="text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded-full ml-auto">
                                    {Object.values(categories).reduce((acc, arr) => acc + arr.length, 0)} Files
                                 </span>
                              </div>

                              <div className="p-4 space-y-6">
                                 {Object.entries(categories).sort().map(([categoryName, items]) => (
                                    <div key={categoryName}>
                                       <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                                          <Folder size={14} className="text-yellow-500" /> 
                                          {categoryName}
                                          <span className="text-gray-600 font-normal">({items.length})</span>
                                       </h4>
                                       
                                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pl-4 border-l-2 border-gray-700/50 ml-1.5">
                                          {items.map((m) => (
                                             <div key={m.id} className="bg-gray-700/30 p-3 rounded-lg border border-gray-600 flex justify-between items-center group hover:bg-gray-700/50 transition-colors">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                   <div className={`p-2 rounded-lg flex-shrink-0 ${m.type === 'QUIZ' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                                      {m.type === 'QUIZ' ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
                                                   </div>
                                                   <div className="truncate min-w-0">
                                                      <h4 className="font-bold text-sm text-gray-200 truncate" title={m.fileName}>{m.fileName}</h4>
                                                      <p className="text-[10px] text-gray-500 flex gap-2 mt-0.5">
                                                         <span className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">{m.grade}</span>
                                                         <span>{new Date(m.uploadDate).toLocaleDateString()}</span>
                                                      </p>
                                                   </div>
                                                </div>
                                                <button onClick={() => deleteMaterial(m.id)} className="p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                   <Trash2 size={14} />
                                                </button>
                                             </div>
                                          ))}
                                       </div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
            )}

            {/* TAB: FORM */}
            {activeTab === 'form' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="space-y-4">
                   <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                        <BookOpen size={16} className="text-blue-400"/> Mata Pelajaran
                      </label>
                      {isCustomSubject ? (
                        <div className="relative">
                           <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Tulis Nama Mapel..." className="w-full bg-gray-900 border border-gray-600 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none pr-10" />
                           <button onClick={() => { setIsCustomSubject(false); setSubject(''); }} className="absolute right-3 top-3 text-gray-400 hover:text-white"><XCircle size={20} /></button>
                        </div>
                      ) : (
                        <select value={subject} onChange={handleMainSubjectChange} className="w-full bg-gray-900 border border-gray-600 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none appearance-none">
                          <option value="" disabled>Pilih Mata Pelajaran</option>
                          {SUBJECT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          <option value="LAINNYA">LAINNYA (Tulis Sendiri)...</option>
                        </select>
                      )}
                   </div>
                   <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                        <GraduationCap size={16} className="text-blue-400"/> Kelas
                      </label>
                      <input type="text" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Contoh: X, 10, XII" className="w-full bg-gray-900 border border-gray-600 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none" />
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="space-y-2 relative">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                        <Search size={16} className="text-blue-400"/> Topik (Opsional)
                      </label>
                      <div className="relative">
                        <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} placeholder="Contoh: Aljabar, Ekosistem" className="w-full bg-gray-900 border border-gray-600 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none" />
                        {showSuggestions && trendingTopics.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-gray-700 border border-gray-600 rounded-xl shadow-2xl overflow-hidden z-50">
                             <div className="px-4 py-2 bg-gray-800 border-b border-gray-600 text-xs font-semibold text-gray-400 flex items-center gap-2"><TrendingUp size={12} /> TRENDING</div>
                             {trendingTopics.map((t, i) => <button key={i} onClick={() => setTopic(t)} className="w-full text-left px-4 py-2 hover:bg-gray-600 text-sm text-gray-200">{t}</button>)}
                          </div>
                        )}
                      </div>
                   </div>
                   
                   <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                         <MessageSquarePlus size={16} className="text-yellow-400"/> Perintah Pembuat Soal (Instruksi Khusus)
                      </label>
                      <textarea 
                        value={customInstruction}
                        onChange={(e) => setCustomInstruction(e.target.value)}
                        placeholder="Instruksi spesifik (opsional). Jika kosong, AI akan generate berdasarkan Topik/Mapel."
                        className="w-full bg-gray-900 border border-gray-600 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none resize-none h-24 text-sm"
                      />
                   </div>
                </div>
              </div>
            )}

            {activeTab === 'form' && matchedMaterials.length > 0 && (
               <div className="border border-gray-700 bg-gray-800/50 rounded-xl p-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between items-center mb-4">
                     <h3 className="font-bold text-white flex items-center gap-2">
                        <Bot className="text-purple-400" /> AI Generate Pro: Telaah Materi
                     </h3>
                     <div className="flex gap-2 text-xs">
                        <button 
                           onClick={() => setSelectedMaterialIds(matchedMaterials.map(m => m.id))}
                           className="bg-blue-600/30 text-blue-200 px-3 py-1.5 rounded hover:bg-blue-600/50 transition-colors"
                        >
                           Pilih Semua
                        </button>
                        <button 
                           onClick={() => setSelectedMaterialIds([])}
                           className="bg-gray-700 text-gray-300 px-3 py-1.5 rounded hover:bg-gray-600 transition-colors"
                        >
                           Reset
                        </button>
                     </div>
                  </div>
                  
                  <div className="overflow-x-auto border border-gray-700 rounded-lg max-h-60 overflow-y-auto custom-scrollbar">
                     <table className="w-full text-left text-sm text-gray-300">
                        <thead className="bg-gray-900 text-gray-400 sticky top-0">
                           <tr>
                              <th className="p-3 w-10 text-center">#</th>
                              <th className="p-3">Materi Referensi</th>
                              <th className="p-3">Uraian</th>
                              <th className="p-3 w-20 text-center">Aksi</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                           {matchedMaterials.map((m, i) => (
                              <tr key={m.id} className="hover:bg-gray-700/30">
                                 <td className="p-3 text-center">{i+1}</td>
                                 <td className="p-3 font-medium text-white">{m.fileName}</td>
                                 <td className="p-3 text-xs text-gray-400 truncate max-w-xs">{m.content.substring(0, 100)}...</td>
                                 <td className="p-3 text-center">
                                    <input 
                                       type="checkbox" 
                                       checked={selectedMaterialIds.includes(m.id)}
                                       onChange={(e) => {
                                          if (e.target.checked) setSelectedMaterialIds(p => [...p, m.id]);
                                          else setSelectedMaterialIds(p => p.filter(id => id !== m.id));
                                       }}
                                       className="rounded border-gray-500 bg-gray-800 text-purple-600 w-4 h-4 cursor-pointer"
                                    />
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
                  
                  <div className="mt-3 flex gap-4 text-xs text-gray-400 items-center">
                     <span>{selectedMaterialIds.length} materi dipilih untuk ditelaah.</span>
                     {customInstruction && (
                        <span className="text-yellow-400 flex items-center gap-1"><Sparkles size={10}/> Fokus pada instruksi khusus aktif.</span>
                     )}
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-gray-700">
                      <div className="flex items-center justify-between">
                          <button
                              onClick={handleGenerateSummary}
                              disabled={generatingSummary}
                              className="flex items-center gap-2 text-sm font-bold text-yellow-400 hover:text-yellow-300 transition-colors bg-yellow-400/10 px-4 py-2 rounded-lg border border-yellow-400/20 hover:bg-yellow-400/20"
                          >
                              {generatingSummary ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                              {materialSummary ? "Perbarui Ringkasan" : "Buat Ringkasan AI"}
                          </button>
                          
                          {materialSummary && !generatingSummary && (
                               <button 
                                  onClick={() => setShowSummary(!showSummary)}
                                  className="text-gray-400 hover:text-white flex items-center gap-1 text-xs"
                               >
                                  {showSummary ? "Sembunyikan" : "Tampilkan"}
                                  {showSummary ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                               </button>
                          )}
                      </div>

                      {showSummary && (
                          <div className="mt-4 bg-gray-900 rounded-xl border border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-2">
                               <div className="flex items-center justify-between p-3 bg-gray-800 border-b border-gray-700">
                                  <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                                      <Bot size={14} className="text-blue-400"/> Ringkasan Materi
                                  </h4>
                               </div>
                               <div className="p-4 text-sm text-gray-300 leading-relaxed max-h-60 overflow-y-auto custom-scrollbar prose prose-invert prose-sm max-w-none">
                                  {generatingSummary ? (
                                      <div className="flex flex-col items-center justify-center py-8 text-gray-500 gap-2">
                                          <Loader2 className="animate-spin text-blue-500" size={24} /> 
                                          <span className="animate-pulse">Sedang menganalisis konten materi...</span>
                                      </div>
                                  ) : (
                                      <ReactMarkdown>{materialSummary}</ReactMarkdown>
                                  )}
                               </div>
                          </div>
                      )}
                  </div>

               </div>
            )}

            {activeTab === 'form' && (
            <div className="border-t border-gray-700 pt-6 space-y-6">
                <div className="space-y-4">
                   <h4 className="font-bold text-lg text-white">Bentuk Soal & Tingkat Kesulitan</h4>
                   <p className="text-sm text-gray-400">Centang jenis soal yang ingin dibuat. Masing-masing bagian memiliki skor maksimal 100.</p>
                   
                   <div className="flex flex-wrap gap-6 p-4 bg-gray-900 rounded-xl border border-gray-700">
                      {(['MULTIPLE_CHOICE', 'SHORT_ANSWER', 'ESSAY'] as QuestionType[]).map(type => (
                         <label key={type} className="flex items-center gap-2 cursor-pointer group">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedTypes.includes(type) ? 'bg-blue-600 border-blue-600' : 'border-gray-500 group-hover:border-blue-400'}`}>
                               {selectedTypes.includes(type) && <Check size={14} className="text-white" />}
                            </div>
                            <input 
                               type="checkbox" 
                               className="hidden" 
                               checked={selectedTypes.includes(type)}
                               onChange={(e) => {
                                  if (e.target.checked) setSelectedTypes(p => [...p, type]);
                                  else setSelectedTypes(p => p.filter(t => t !== type));
                               }}
                            />
                            <span className={`text-sm font-medium ${selectedTypes.includes(type) ? 'text-white' : 'text-gray-400'}`}>
                               {getLabelForType(type)}
                            </span>
                         </label>
                      ))}
                   </div>

                   {selectedTypes.map(type => (
                      <div key={type} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-gray-700/20 p-4 rounded-xl border border-gray-700/50">
                         <div className="md:col-span-3 font-bold text-blue-300 text-sm flex items-center gap-2">
                            <Hash size={16}/> {getLabelForType(type)}
                         </div>
                         <div className="md:col-span-9 grid grid-cols-4 gap-4">
                            {['easy', 'medium', 'hard'].map((diff) => (
                               <div key={diff}>
                                  <label className="text-[10px] uppercase text-gray-500 block mb-1 font-bold">{diff}</label>
                                  <input 
                                    type="number" 
                                    min="0"
                                    // @ts-ignore
                                    value={configPerType[type][diff]}
                                    onChange={(e) => {
                                       const val = parseInt(e.target.value) || 0;
                                       setConfigPerType(prev => ({
                                          ...prev,
                                          [type]: { ...prev[type], [diff]: val }
                                       }));
                                    }}
                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-center text-white text-sm"
                                  />
                               </div>
                            ))}
                            <div>
                               <label className="text-[10px] uppercase text-blue-500 block mb-1 font-bold">Total</label>
                               <div className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-center text-white text-sm font-bold">
                                  {configPerType[type].easy + configPerType[type].medium + configPerType[type].hard}
                               </div>
                            </div>
                         </div>
                      </div>
                   ))}
                </div>

                <div className="bg-gray-700/30 p-4 rounded-xl border border-gray-600 space-y-6">
                   <div className="flex items-center justify-between border-b border-gray-600 pb-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-gray-300">
                        <Layers size={16} className="text-purple-400" />
                        Konfigurasi Remedial & Pengayaan (Skor Max 100)
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-400 font-bold">KKM:</label>
                        <input type="number" min="0" max="100" value={kkm} onChange={(e) => setKkm(parseInt(e.target.value) || 0)} className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white w-14 text-center text-xs" />
                      </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      <div className="md:col-span-3 flex items-center justify-between">
                         <span className="text-sm font-bold text-gray-400">REMEDIAL</span>
                         <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-xs text-gray-500">Aktif</span>
                            <input type="checkbox" checked={includeRemedial} onChange={e => setIncludeRemedial(e.target.checked)} className="rounded bg-gray-800 border-gray-500 text-purple-600" />
                         </label>
                      </div>
                      <div className={`md:col-span-9 grid grid-cols-4 gap-4 ${!includeRemedial ? 'opacity-50 pointer-events-none' : ''}`}>
                         {['MULTIPLE_CHOICE', 'SHORT_ANSWER', 'ESSAY'].map((t) => (
                            <div key={t}>
                               <label className="text-[10px] text-gray-500 block mb-1">{t === 'MULTIPLE_CHOICE' ? 'PG' : t === 'SHORT_ANSWER' ? 'Isian' : 'Uraian'}</label>
                               <input 
                                 type="number" min="0" 
                                 value={remedialCounts[t as QuestionType]}
                                 onChange={e => setRemedialCounts(p => ({...p, [t]: parseInt(e.target.value)||0}))}
                                 className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-center text-white text-sm"
                               />
                            </div>
                         ))}
                         <div>
                            <label className="text-[10px] text-blue-500 block mb-1">Total</label>
                            <div className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-center text-white text-sm font-bold">
                               {remedialCounts.MULTIPLE_CHOICE + remedialCounts.SHORT_ANSWER + remedialCounts.ESSAY}
                            </div>
                         </div>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      <div className="md:col-span-3 flex items-center justify-between">
                         <span className="text-sm font-bold text-gray-400">PENGAYAAN</span>
                         <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-xs text-gray-500">Aktif</span>
                            <input type="checkbox" checked={includeEnrichment} onChange={e => setIncludeEnrichment(e.target.checked)} className="rounded bg-gray-800 border-gray-500 text-purple-600" />
                         </label>
                      </div>
                      <div className={`md:col-span-9 grid grid-cols-4 gap-4 ${!includeEnrichment ? 'opacity-50 pointer-events-none' : ''}`}>
                         {['MULTIPLE_CHOICE', 'SHORT_ANSWER', 'ESSAY'].map((t) => (
                            <div key={t}>
                               <label className="text-[10px] text-gray-500 block mb-1">{t === 'MULTIPLE_CHOICE' ? 'PG' : t === 'SHORT_ANSWER' ? 'Isian' : 'Uraian'}</label>
                               <input 
                                 type="number" min="0" 
                                 value={enrichmentCounts[t as QuestionType]}
                                 onChange={e => setEnrichmentCounts(p => ({...p, [t]: parseInt(e.target.value)||0}))}
                                 className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-center text-white text-sm"
                               />
                            </div>
                         ))}
                         <div>
                            <label className="text-[10px] text-blue-500 block mb-1">Total</label>
                            <div className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-center text-white text-sm font-bold">
                               {enrichmentCounts.MULTIPLE_CHOICE + enrichmentCounts.SHORT_ANSWER + enrichmentCounts.ESSAY}
                            </div>
                         </div>
                      </div>
                   </div>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-semibold shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" /> : 'Generate Paket Soal Lengkap'}
                </button>
            </div>
            )}
          </div>
        </>
      )}

      {/* --- A4 PRINTABLE QUIZ VIEW --- */}
      {quizData && (
        <div className="space-y-4">
           <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex flex-col gap-4 print:hidden">
              <div className="flex flex-wrap justify-between items-center gap-4">
                 <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                    <button onClick={() => setViewMode('student')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${viewMode === 'student' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                       <User size={16} /> Tampilan Siswa
                    </button>
                    <button onClick={() => setViewMode('teacher')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${viewMode === 'teacher' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                       <UserCog size={16} /> Tampilan Guru
                    </button>
                 </div>
                 <div className="flex flex-wrap gap-2">
                    {viewMode === 'teacher' && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                            <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5"><ClipboardList size={14}/> Set KKM:</span>
                            <input 
                            type="number" 
                            value={quizData.kkm || 75} 
                            onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setQuizData(prev => prev ? { ...prev, kkm: val } : null);
                            }}
                            className="w-16 bg-gray-900 border border-purple-500/50 rounded text-xs px-2 py-1 text-white text-center font-bold focus:outline-none focus:ring-1 focus:ring-purple-400"
                            />
                        </div>
                    )}

                    <button 
                        onClick={() => handleExportPDF('student')} 
                        disabled={exportingPdf}
                        className="px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/50 hover:border-blue-500 rounded text-xs flex items-center gap-1 transition-colors" 
                        title="Ekspor PDF (Siswa)"
                    >
                        {exportingPdf ? <Loader2 size={16} className="animate-spin"/> : <FileDown size={16}/>}
                        Export PDF (Siswa)
                    </button>
                    <button 
                        onClick={() => handleExportPDF('teacher')} 
                        disabled={exportingPdf}
                        className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/50 hover:border-purple-500 rounded text-xs flex items-center gap-1 transition-colors" 
                        title="Ekspor PDF (Guru)"
                    >
                        {exportingPdf ? <Loader2 size={16} className="animate-spin"/> : <FileDown size={16}/>}
                        Export PDF (Guru)
                    </button>
                    
                    <div className="w-px h-6 bg-gray-600 mx-1"></div>

                    <button onClick={() => setShowPrintModal(true)} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs flex items-center gap-1" title="Cetak (PDF)">
                       <Printer size={16}/> Print Preview
                    </button>
                    <button onClick={() => setQuizData(null)} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs">Kembali</button>
                 </div>
              </div>
              
              {groundingSources.length > 0 && (
                 <div className="w-full pt-3 mt-2 border-t border-gray-700">
                    <p className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1">
                       <Search size={12} className="text-blue-400"/> Sumber Referensi (Google Search):
                    </p>
                    <div className="flex flex-wrap gap-2">
                       {groundingSources.map((s: any, i: number) => (
                          <a key={i} href={s.web.uri} target="_blank" rel="noreferrer" className="text-[10px] bg-gray-900 border border-gray-700 hover:border-blue-500 text-blue-300 px-2 py-1 rounded-lg truncate max-w-[200px] transition-colors">
                             {s.web.title || s.web.uri}
                          </a>
                       ))}
                    </div>
                 </div>
              )}
           </div>

           {/* MAIN PREVIEW VIEW */}
           <div className="overflow-x-auto flex justify-center bg-gray-900 py-8 print:p-0 print:bg-white">
             {renderQuizPaper(undefined, { showHeader: true, showName: true, showRubric: true, fontSize: 'text-sm', compactMode: false })}
           </div>

           {/* DEDICATED PRINT PREVIEW MODAL */}
           {showPrintModal && (
              <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex justify-center items-center print:bg-white print:block print:static">
                 <div className="w-full h-full flex flex-col md:flex-row overflow-hidden print:block print:h-auto">
                    
                    <div className="w-full md:w-80 bg-gray-900 border-r border-gray-800 p-6 flex-shrink-0 flex flex-col gap-6 print:hidden overflow-y-auto max-h-[50vh] md:max-h-full md:h-full border-b md:border-b-0">
                       <div className="flex justify-between items-center border-b border-gray-800 pb-4">
                          <h3 className="text-xl font-bold text-white flex items-center gap-2"><Settings2 className="text-purple-400" /> Print Settings</h3>
                          <button onClick={() => setShowPrintModal(false)} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-800"><X size={20}/></button>
                       </div>
                       
                       <div className="space-y-4">
                          <div className="space-y-3">
                             <label className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Layout Content</label>
                             <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                <span className="text-sm text-gray-300">Header (Kop Surat)</span>
                                <input type="checkbox" checked={printSettings.showHeader} onChange={e => setPrintSettings(p => ({...p, showHeader: e.target.checked}))} className="rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500" />
                             </div>
                             <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                <span className="text-sm text-gray-300">Identitas Siswa</span>
                                <input type="checkbox" checked={printSettings.showName} onChange={e => setPrintSettings(p => ({...p, showName: e.target.checked}))} className="rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500" />
                             </div>
                          </div>
                          
                          <div className="mt-auto pt-6 border-t border-gray-800">
                             <button onClick={() => window.print()} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                <Printer size={20} /> Cetak Sekarang (Print)
                             </button>
                          </div>
                       </div>
                    </div>

                    <div className="flex-1 bg-gray-800/50 overflow-y-auto p-4 md:p-12 flex justify-center print:p-0 print:overflow-visible print:block min-h-[50vh]">
                        {renderQuizPaper('quiz-print-area', printSettings)}
                    </div>
                 </div>
              </div>
           )}
        </div>
      )}
    </div>
  );
};

export default QuizGenerator;
