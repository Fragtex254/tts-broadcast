import React, { useState } from 'react';
import { createScopedLogger, toLogError } from '../../services/logger';
import useStore from '../../store';
import { ActionButton, WorkbenchCard } from '../UI';

const logger = createScopedLogger('quick-generate');

interface QuickGenerateProps {
  onItemsLoaded?: () => void;
  onRewriteComplete?: () => void;
}

const CATEGORIES = [
  { value: '', label: '全部' },
  { value: 'ai-models', label: 'AI 模型' },
  { value: 'ai-products', label: 'AI 产品' },
  { value: 'industry', label: '行业动态' },
  { value: 'paper', label: '论文' },
  { value: 'tip', label: '技巧' },
];

const CATEGORY_COLORS: Record<string, string> = {
  'ai-models': 'bg-lemon/25',
  'ai-products': 'bg-lilac/35',
  'industry': 'bg-blush/45',
  'paper': 'bg-sage/35',
  'tip': 'bg-pink/15',
};

export const QuickGenerate: React.FC<QuickGenerateProps> = ({ onItemsLoaded, onRewriteComplete }) => {
  const todayItems = useStore((s) => s.todayItems);
  const fetchTodayItems = useStore((s) => s.fetchTodayItems);
  const rewriteScript = useStore((s) => s.rewriteScript);
  const isRewriting = useStore((s) => s.isRewriting);

  const [category, setCategory] = useState<string>('');
  const [count, setCount] = useState<number>(10);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      logger.error({ err: toLogError(err), hasCategory: Boolean(category), take: count }, '获取资讯失败');
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
      onRewriteComplete?.();
    } catch (err) {
      setError('改写口播稿失败，请稍后重试');
      logger.error({ err: toLogError(err), itemCount: todayItems.length }, '改写口播稿失败');
    }
  };

  return (
    <WorkbenchCard heading="AI 资讯采集" accent="lemon">
      {/* 配置区 */}
      <div className="flex flex-col gap-2 mb-4 sm:flex-row">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="flex-1 bg-white/80 text-ink rounded-full px-3.5 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] appearance-none cursor-pointer transition-colors"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-full bg-white/80 text-ink rounded-full px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] appearance-none cursor-pointer transition-colors sm:w-24"
        >
          {[5, 10, 15, 20].map((n) => (
            <option key={n} value={n}>{n} 条</option>
          ))}
        </select>
        <ActionButton
          onClick={handleFetch}
          variant="primary"
          shape="pill"
          isUppercase
          isLoading={isLoading}
          loadingLabel="加载中..."
          className="whitespace-nowrap"
        >
          获取
        </ActionButton>
      </div>

      {/* 资讯列表 */}
      {todayItems.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-3">
            <span className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">
              已加载 {todayItems.length} 条资讯
            </span>
            <ActionButton
              onClick={handleRewrite}
              variant="edit"
              shape="pill"
              isUppercase
              isLoading={isRewriting}
              loadingLabel="改写中..."
            >
              ✦ 一键改写口播稿
            </ActionButton>
          </div>

          <div className="space-y-0">
            {todayItems.map((item, index) => (
              <div
                key={item.id}
                className="flex items-start gap-3 py-2.5 border-b border-card-border last:border-0"
              >
                <span className="font-display italic text-[16px] font-medium text-pink min-w-[26px] leading-snug">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <h4 className="font-body text-[13px] font-medium text-ink leading-snug">
                    {item.title}
                  </h4>
                  {item.category && (
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-md font-body text-[9px] font-medium uppercase tracking-wider text-ink ${CATEGORY_COLORS[item.category] || 'bg-paper-2'}`}>
                      {CATEGORIES.find(c => c.value === item.category)?.label || item.category}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 骨架屏加载态 */}
      {isLoading && todayItems.length === 0 && (
        <div className="mt-3 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3 py-2.5 animate-pulse" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="w-6 h-4 bg-ink/5 rounded" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-ink/5 rounded w-3/4" />
                <div className="h-2 bg-ink/5 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mt-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
          {error}
        </div>
      )}
    </WorkbenchCard>
  );
};

export default QuickGenerate;
