import React, { useState } from 'react';
import Layout from './components/Layout';
import QuizGenerator from './components/QuizGenerator';
import ChatBot from './components/ChatBot';
import ImageEditor from './components/ImageEditor';
import { AppMode } from './types';

const App: React.FC = () => {
  const [currentMode, setCurrentMode] = useState<AppMode>(AppMode.QUIZ);

  const renderContent = () => {
    switch (currentMode) {
      case AppMode.QUIZ:
        return <QuizGenerator />;
      case AppMode.CHAT:
        return <ChatBot />;
      case AppMode.IMAGE_EDIT:
        return <ImageEditor />;
      default:
        return <QuizGenerator />;
    }
  };

  return (
    <Layout currentMode={currentMode} onModeChange={setCurrentMode}>
      {renderContent()}
    </Layout>
  );
};

export default App;