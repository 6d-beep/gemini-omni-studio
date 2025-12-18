import React from 'react';
import { AppMode } from '../types';
import { 
  MessageSquare, 
  Image as ImageIcon, 
  BrainCircuit, 
  Menu,
  X
} from 'lucide-react';

interface LayoutProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ currentMode, onModeChange, children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const navItems = [
    { mode: AppMode.QUIZ, label: 'Pembuat Soal (Kuis)', icon: BrainCircuit },
    { mode: AppMode.CHAT, label: 'Chat AI', icon: MessageSquare },
    { mode: AppMode.IMAGE_EDIT, label: 'Editor Gambar Ajaib', icon: ImageIcon },
  ];

  const NavContent = () => (
    <div className="flex flex-col h-full bg-gray-800/50 backdrop-blur-xl border-r border-gray-700">
      <div className="p-6 flex items-center space-x-3">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-red-500 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-lg">G</span>
        </div>
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-red-400">
          Omni-Studio
        </h1>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {navItems.map((item) => (
          <button
            key={item.mode}
            onClick={() => {
              onModeChange(item.mode);
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
              currentMode === item.mode
                ? 'bg-gray-700 text-white shadow-lg shadow-blue-500/10 border border-gray-600'
                : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
            }`}
          >
            <item.icon size={20} className={currentMode === item.mode ? 'text-blue-400' : ''} />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <p className="text-xs text-gray-500 text-center">Ditenagai oleh Gemini 2.5 & 3.0</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-900 text-white font-sans selection:bg-blue-500/30 print:h-auto print:block print:bg-white print:text-black print:overflow-visible">
      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 h-full print:hidden">
        <NavContent />
      </div>

      {/* Mobile Menu */}
      <div className={`fixed inset-0 z-50 bg-gray-900/95 md:hidden transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} print:hidden`}>
        <div className="relative h-full">
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white"
          >
            <X size={24} />
          </button>
          <NavContent />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative print:h-auto print:overflow-visible print:block">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur print:hidden">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-gray-400 hover:text-white"
          >
            <Menu size={24} />
          </button>
          <span className="ml-4 font-bold text-lg">Omni-Studio</span>
        </div>

        <main className="flex-1 overflow-y-auto relative print:overflow-visible print:h-auto print:block">
           {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;