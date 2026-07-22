import React from 'react';
import type { MaskedSecret } from '../../store';

export const SecretStatus: React.FC<{ secret: MaskedSecret }> = ({ secret }) => (
  <span className="font-body text-[11px] text-ink-soft/70">
    {secret.is_set ? `已配置 · ${secret.masked}` : '未配置'}
  </span>
);

interface SectionCardProps {
  dotColor: string;
  title: string;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ dotColor, title, children }) => (
  <section
    className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"

  >
    <div className="flex items-center gap-2 mb-4">
      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      <h3 className="font-display italic text-[14px] font-medium text-ink-soft">{title}</h3>
    </div>
    {children}
  </section>
);
