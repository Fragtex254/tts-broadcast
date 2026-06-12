import React from 'react';
import { Link } from 'react-router-dom';

export const NotFound: React.FC = () => {
  return (
    <div className="flex-1 flex items-center justify-center bg-paper">
      <div className="text-center">
        <div className="font-display italic text-[96px] font-medium text-ink/10 leading-none mb-4">
          404
        </div>
        <h1 className="font-display italic text-[24px] font-medium text-ink mb-2">
          页面未找到
        </h1>
        <p className="font-body text-[13px] text-ink-soft/60 mb-8">
          你访问的页面不存在或已被移除
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-pink/25 hover:bg-pink/35 text-ink font-body text-[13px] rounded-full transition-colors border border-card-border"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          返回首页
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
