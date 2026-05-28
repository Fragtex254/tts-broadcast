import React, { useState } from 'react';
import { useStore } from '../../store';

interface QuickGenerateProps {
  onItemsLoaded?: () => void;
}

export const QuickGenerate: React.FC<QuickGenerateProps> = ({ onItemsLoaded }) => {
  const { todayItems, fetchTodayItems, rewriteScript, isRewriting } = useStore();
  const [category, setCategory] = useState<string>('');
  const [count, setCount] = useState<number>(10);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = [
    { value: '', label: '全部' },
    { value: 'ai-models', label: 'AI 模型' },
    { value: 'ai-products', label: 'AI 产品' },
    { value: 'industry', label: '行业动态' },
    { value: 'paper', label: '论文' },
    { value: 'tip', label: '技巧' },
  ];

  const handleFetch = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await fetchTodayItems({
        category: category || undefined,
        take: count,
      });
      onItemsLoaded?.();
    } catch (err) {
      setError('获取资讯失败，请稍后重试');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRewrite = async () => {
    if (todayItems.length === 0) {
      setError('请先获取今日资讯');
      return;
    }
    setError(null);
    try {
      await rewriteScript({ items: todayItems });
    } catch (err) {
      setError('改写口播稿失败，请稍后重试');
      console.error(err);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">快速生成</h3>

      {/* 配置区 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">资讯分类</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
          >
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">条目数量</label>
          <input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={handleFetch}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium rounded-lg px-4 py-2 transition-colors"
          >
            {isLoading ? '加载中...' : '获取今日资讯'}
          </button>
        </div>
      </div>

      {/* 资讯预览 */}
      {todayItems.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">
              已加载 {todayItems.length} 条资讯
            </span>
            <button
              onClick={handleRewrite}
              disabled={isRewriting}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {isRewriting ? '改写中...' : '一键改写口播稿'}
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {todayItems.map((item, index) => (
              <div
                key={item.id}
                className="bg-gray-700 rounded-lg p-3 flex items-start gap-3"
              >
                <span className="text-blue-400 font-mono text-sm mt-0.5">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white text-sm font-medium truncate">
                    {item.title}
                  </h4>
                  <p className="text-gray-400 text-xs mt-1 line-clamp-2">
                    {item.summary}
                  </p>
                </div>
                <span className="text-xs text-gray-500 shrink-0">
                  {item.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mt-4 bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
};

export default QuickGenerate;
