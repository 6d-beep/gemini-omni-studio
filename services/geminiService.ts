
import { GoogleGenAI, Type } from "@google/genai";
import { QuizData, QuizDistribution, QuestionType, ReferenceMaterial, QuizSection } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// FEATURE: Generate Material Summary
export const generateMaterialSummary = async (
  materials: ReferenceMaterial[],
  subject: string,
  grade: string
): Promise<string> => {
  const ai = getAI();
  
  const parts: any[] = [];
  
  const promptText = `
    Role: Expert Teacher.
    Task: Create a concise summary of the provided reference materials.
    Context: Subject: "${subject}", Grade: "${grade}".
    Instruction: Analyze the attached materials and provide a structured summary of the key concepts, definitions, and main points covered. 
    The summary should be helpful for reviewing the material before generating a quiz. 
    Format the output with Markdown (bullet points, bold text).
  `;
  parts.push({ text: promptText });

  if (materials.length > 0) {
    let textContext = "REFERENCE MATERIALS:\n";
    for (const m of materials) {
      if (typeof m.content === 'string' && m.content.startsWith('data:')) {
         const [meta, data] = m.content.split(',');
         const mimeType = meta.split(':')[1].split(';')[0];
         parts.push({ inlineData: { mimeType, data } });
      } else {
         const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
         textContext += `FILE: ${m.fileName}\nCONTENT:\n${contentStr}\n---\n`;
      }
    }
    parts.push({ text: textContext });
  } else {
    return "No relevant materials found to summarize.";
  }

  // Use gemini-3-flash-preview for basic text tasks like summarization
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: 'user', parts: parts }]
  });

  return response.text || "No summary generated.";
};

interface SectionConfig {
  type: QuestionType;
  distribution: QuizDistribution;
}

// FEATURE: Quiz Generator using Search Grounding and JSON Schema
export const generateQuiz = async (
  topic: string, 
  subject: string,
  grade: string,
  sectionConfigs: SectionConfig[], // Array of requested sections
  materials: ReferenceMaterial[] = [],
  customInstruction: string = "",
  remedialConfig: { [key in QuestionType]?: number } = {},
  enrichmentConfig: { [key in QuestionType]?: number } = {}
): Promise<{ quiz: QuizData, groundingMetadata: any }> => {
  const ai = getAI();
  
  // Construct Section Descriptions
  const sectionsPrompt = sectionConfigs.map(s => {
    const total = s.distribution.easy + s.distribution.medium + s.distribution.hard;
    return `- Type: ${s.type}, Total: ${total} (Easy: ${s.distribution.easy}, Medium: ${s.distribution.medium}, Hard: ${s.distribution.hard})`;
  }).join('\n');

  const remedialPrompt = Object.entries(remedialConfig).map(([type, count]) => `${type}: ${count} questions`).join(', ');
  const enrichmentPrompt = Object.entries(enrichmentConfig).map(([type, count]) => `${type}: ${count} questions`).join(', ');

  // Trusted sources list
  const trustedSources = [
    "https://rumah.pendidikan.go.id/",
    "https://kemendikdasmen.go.id/",
    "https://pendidikan.id/",
    "https://kemdiktisaintek.go.id/",
    "https://gtk.dikdasmen.go.id/",
    "https://klasmart.com/",
    "https://referensi.data.kemendikdasmen.go.id/",
    "https://rumah.pendidikan.go.id/ruang/murid",
    "https://belajar.kemdikbud.go.id/",
    "https://buku.kemendikdasmen.go.id/"
  ].join(', ');

  // System & Task Instruction
  const mainPromptText = `
    Role: You are an expert teacher in Indonesia for Subject "${subject}", Grade "${grade}".
    Task: Create a comprehensive Exam Package about "${topic}".
    
    CUSTOM INSTRUCTION FROM TEACHER (PRIORITY):
    "${customInstruction}"
    
    DEEP RESEARCH INSTRUCTION:
    If specific materials are not provided or are insufficient, you MUST perform deep online research.
    Prioritize these trusted Indonesian educational sources: ${trustedSources}.
    Ensure the content aligns with the latest Indonesian curriculum (Kurikulum Merdeka).
    
    Configuration:
    GENERATE THE FOLLOWING SECTIONS:
    ${sectionsPrompt}
    
    REMEDIAL SET:
    ${remedialPrompt || "None"}
    
    ENRICHMENT SET:
    ${enrichmentPrompt || "None"}
    
    Output Requirement:
    Return ONLY valid JSON matching the schema below. 
    
    JSON Schema:
    {
      "subject": "${subject}",
      "grade": "${grade}",
      "topic": "${topic}",
      "sections": [
        {
          "type": "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "ESSAY",
          "questions": [
            {
              "id": number,
              "type": "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "ESSAY",
              "difficulty": "Easy" | "Medium" | "Hard",
              "question": "string",
              "options": ["string", "string", "string", "string"], // Empty array for non-MC
              "correctAnswer": "string",
              "explanation": "string"
            }
          ]
        }
      ],
      "remedial": [
         { "type": "...", "questions": [...] } // Same structure as sections
      ],
      "enrichment": [
         { "type": "...", "questions": [...] } // Same structure as sections
      ]
    }
  `;
  
  const parts: any[] = [];
  parts.push({ text: mainPromptText });

  // Append Materials
  if (materials.length > 0) {
    let textContext = "SELECTED REFERENCE MATERIALS:\n";
    let hasInline = false;

    for (const m of materials) {
      if (typeof m.content === 'string' && m.content.startsWith('data:')) {
         const [meta, data] = m.content.split(',');
         const mimeType = meta.split(':')[1].split(';')[0];
         parts.push({ inlineData: { mimeType, data } });
         hasInline = true;
      } else {
         const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
         textContext += `FILE (${m.category || 'MATERI'}): ${m.fileName}\nCONTENT:\n${contentStr}\n---\n`;
      }
    }
    parts.push({ text: textContext });
    
    if (hasInline) {
       parts.push({ text: "Use the above images/PDFs as primary source material if relevant to the instructions." });
    }
  }

  const config: any = {
    maxOutputTokens: 8192,
    tools: [{ googleSearch: {} }] 
  };

  // Use gemini-3-pro-preview for complex tasks like reasoning and curriculum-aligned quiz generation
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{ role: 'user', parts: parts }],
    config: config
  });

  let text = response.text || "{}";
  text = text.replace(/```json/g, '').replace(/```/g, '').trim();
  
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
      text = text.substring(firstBrace, lastBrace + 1);
  }

  let parsedJson;
  try {
     parsedJson = JSON.parse(text);
  } catch(e) {
     console.error("JSON Parse Error", e);
     throw new Error("Failed to parse quiz data from Gemini.");
  }

  // Hydrate quiz object
  const quiz: QuizData = {
    subject: parsedJson.subject || subject,
    grade: parsedJson.grade || grade,
    topic: parsedJson.topic || topic,
    sections: parsedJson.sections || [],
    remedial: parsedJson.remedial || [],
    enrichment: parsedJson.enrichment || [],
    kkm: 75
  };

  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

  return { quiz, groundingMetadata };
};

// FEATURE: Trending Quiz Topics
export const getTrendingQuizTopics = async (): Promise<string[]> => {
  const ai = getAI();
  try {
    // Use gemini-3-flash-preview for general search-based tasks
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Identify 5 currently trending topics, news events, or popular culture themes from the last 7 days that would make good quiz subjects.
      Return ONLY a valid JSON array of strings. Example: ["Paris Olympics", "New iPhone Release", "Election 2024"].
      Do not include markdown code blocks.`,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    let text = response.text || "[]";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1) {
      text = text.substring(start, end + 1);
    }

    const topics = JSON.parse(text);
    if (Array.isArray(topics)) return topics;
    return [];
  } catch (error) {
    console.error("Error fetching trending topics:", error);
    return ["Technology Trends", "World Geography", "Science Discoveries", "Pop Culture", "History"];
  }
};

// FEATURE: Chatbot
export const sendChatMessage = async (history: { role: string, parts: { text: string }[] }[], message: string) => {
  const ai = getAI();
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    history: history,
  });

  const result = await chat.sendMessageStream({ message });
  return result;
};

// FEATURE: Image Editing
export const editImageWithPrompt = async (base64Image: string, prompt: string, mimeType: string = 'image/png'): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image
          }
        },
        { text: prompt }
      ]
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return part.inlineData.data;
    }
  }
  throw new Error("No image returned from model");
};

// FEATURE: OCR - Extract Text from Image
export const extractTextFromImage = async (base64Image: string, mimeType: string = 'image/png'): Promise<string> => {
  const ai = getAI();
  // Use gemini-3-flash-preview for multimodal tasks like OCR
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image
          }
        },
        { text: "Extract all visible text from this image. Return only the text content." }
      ]
    }
  });

  return response.text || "";
};

// FEATURE: Veo Video Generation
export const generateVeoVideo = async (
  prompt: string, 
  imageBytes: string | null, 
  aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const config: any = {
    numberOfVideos: 1,
    resolution: '1080p',
    aspectRatio: aspectRatio
  };

  let operation;

  if (imageBytes) {
    operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt || "Animate this image",
      image: {
        imageBytes: imageBytes,
        mimeType: 'image/png', 
      },
      config
    });
  } else {
    operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config
    });
  }

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!uri) throw new Error("Video generation failed");

  return uri;
};

export const fetchVideoBlob = async (uri: string): Promise<string> => {
  const response = await fetch(`${uri}&key=${process.env.API_KEY}`);
  if (!response.ok) throw new Error("Failed to download video");
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
};
