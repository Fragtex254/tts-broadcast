import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { QuickGenerate } from '../components/Dashboard/QuickGenerate';

export const SourceCollection: React.FC = () => {
  const navigate = useNavigate();

  const handleRewriteComplete = useCallback(() => {
    navigate('/editor');
  }, [navigate]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="信源收集" subtitle="获取今日 AI 资讯并改写为口播稿" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <QuickGenerate onRewriteComplete={handleRewriteComplete} />
        </div>
      </main>
    </div>
  );
};

export default SourceCollection;
