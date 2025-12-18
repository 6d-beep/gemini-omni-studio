
export enum AppMode {
  QUIZ = 'QUIZ',
  CHAT = 'CHAT',
  IMAGE_EDIT = 'IMAGE_EDIT'
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string;
  timestamp: number;
}

export type QuestionType = 'MULTIPLE_CHOICE' | 'SHORT_ANSWER' | 'ESSAY';

export interface QuizQuestion {
  id: number;
  type: QuestionType;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  question: string;
  options?: string[]; // Only for Multiple Choice
  correctAnswer: string;
  explanation: string;
  image?: string; // Base64 encoded image
}

export interface QuizDistribution {
  easy: number;
  medium: number;
  hard: number;
}

export interface QuizSection {
  type: QuestionType;
  questions: QuizQuestion[];
}

export interface QuizData {
  id?: string;
  subject: string;
  grade: string;
  topic: string;
  sections: QuizSection[]; 
  remedial: QuizSection[];
  enrichment: QuizSection[];
  kkm?: number;
}

export interface ReferenceMaterial {
  id: string;
  fileName: string;
  content: string | any;
  subject: string; 
  grade: string;   
  uploadDate: number;
  category?: string;
  type?: string;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}
