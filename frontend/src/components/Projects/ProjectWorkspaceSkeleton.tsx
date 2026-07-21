import React from 'react';

export const ProjectWorkspaceSkeleton: React.FC = () => (
  <div aria-label="正在加载内容项目" className="space-y-4 animate-pulse">
    <div className="h-8 w-64 rounded-xl bg-ink/5" />
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.38fr)]">
      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <div key={item} className="rounded-card border border-card-border bg-white/70 p-5 shadow-card">
            <div className="h-5 w-36 rounded bg-ink/5" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="h-20 rounded-xl bg-ink/5" />
              <div className="h-20 rounded-xl bg-ink/5" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-56 rounded-card border border-card-border bg-white/55" />
    </div>
  </div>
);

export default ProjectWorkspaceSkeleton;
