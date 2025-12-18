import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../services/geminiService';
import { MessageSquare, Send, Loader2, Bot, User, Trash2, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { GenerateContentResponse } from '@google/genai';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const ChatBot: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('gemini_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse chat history", e);
      return [];
    }
  });
  const [isTyping, setIsTyping] = useState(false); // Initial loading state (Thinking)
  const [isStreaming, setIsStreaming] = useState(false); // Active streaming state (Generating)
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change or typing status changes
  useEffect(() => {
    const scrollToBottom = () => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    };

    // Immediate scroll attempt
    scrollToBottom();

    // Delayed scroll to ensure DOM paint/layout updates (especially for Markdown expansion)
    const timeoutId = setTimeout(scrollToBottom, 100);

    return () => clearTimeout(timeoutId);
  }, [messages, isTyping, isStreaming]);

  useEffect(() => {
    localStorage.setItem('gemini_chat_history', JSON.stringify(messages));
  }, [messages]);

  const handleClear = () => {
    if (confirm("Apakah Anda yakin ingin menghapus riwayat obrolan?")) {
      setMessages([]);
      localStorage.removeItem('gemini_chat_history');
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping || isStreaming) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      // Convert internal state to API history format
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const streamResult = await sendChatMessage(history, userMsg);
      
      // Response started, switch from "Typing" to "Streaming"
      setIsTyping(false);
      setIsStreaming(true);
      
      setMessages(prev => [...prev, { role: 'model', text: '' }]);

      let fullText = '';
      
      for await (const chunk of streamResult) {
        const c = chunk as GenerateContentResponse;
        const chunkText = c.text || '';
        fullText += chunkText;
        
        setMessages(prev => {
          const newArr = [...prev];
          newArr[newArr.length - 1] = { role: 'model', text: fullText };
          return newArr;
        });
      }
    } catch (error) {
      console.error("Chat error:", error);
      setIsTyping(false); // Ensure typing is off if error occurs before streaming
      setMessages(prev => [...prev, { role: 'model', text: "Maaf, terjadi kesalahan saat memproses permintaan Anda." }]);
    } finally {
      setIsTyping(false);
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 p-3 md:p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/95 backdrop-blur z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-600/20 rounded-lg">
            <MessageSquare className="text-purple-400" size={20} />
          </div>
          <div>
            <h2 className="font-bold text-white text-sm md:text-base">Obrolan Gemini Pro</h2>
            <p className="text-[10px] md:text-xs text-gray-400">Ditenagai oleh gemini-3-pro-preview</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button 
            onClick={handleClear}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
            title="Hapus Riwayat"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 md:space-y-6 scroll-smooth custom-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50 px-4 text-center">
            <Bot size={48} className="mb-4" />
            <p className="text-sm">Mulai percakapan dengan Gemini Pro.</p>
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 md:gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`relative flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              msg.role === 'user' ? 'bg-gray-700' : 'bg-gradient-to-br from-blue-500 to-purple-600'
            }`}>
              {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              
              {/* Streaming Indicator */}
              {isStreaming && msg.role === 'model' && idx === messages.length - 1 && (
                <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5">
                   <Zap size={8} className="text-yellow-400 animate-pulse fill-yellow-400" />
                </div>
              )}
            </div>
            
            <div className={`max-w-[85%] md:max-w-[80%] rounded-2xl px-4 py-2.5 md:px-5 md:py-3 ${
              msg.role === 'user' 
                ? 'bg-gray-800 text-white rounded-tr-none shadow-sm' 
                : 'bg-blue-900/20 text-gray-100 border border-blue-800/30 rounded-tl-none'
            }`}>
              <div className="prose prose-invert prose-sm max-w-none break-words leading-relaxed">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        
        {/* Only show this typing indicator when waiting for the INITIAL response (thinking) */}
        {isTyping && (
          <div className="flex gap-3 md:gap-4 animate-pulse">
             <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
               <Bot size={14} />
             </div>
             <div className="bg-blue-900/20 px-4 py-3 rounded-2xl rounded-tl-none border border-blue-800/30 flex items-center gap-2">
               <span className="text-xs text-blue-300 font-medium">Berpikir</span>
               <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
               </div>
             </div>
          </div>
        )}
        <div ref={bottomRef} className="h-px" />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 p-3 md:p-4 bg-gray-900 border-t border-gray-800">
        <div className="relative max-w-4xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Tanyakan sesuatu..."
            className="w-full bg-gray-800 border border-gray-700 rounded-2xl pl-4 pr-12 py-3 md:py-4 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none text-white text-base md:text-sm shadow-inner placeholder-gray-500"
            rows={1}
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping || isStreaming}
            className="absolute right-1.5 top-1.5 bottom-1.5 md:right-2 md:top-2 md:bottom-2 aspect-square p-0 w-10 md:w-auto md:px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-all disabled:opacity-50 disabled:hover:bg-purple-600 flex items-center justify-center shadow-lg active:scale-95"
          >
            {isTyping || isStreaming ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} className="ml-0.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatBot;