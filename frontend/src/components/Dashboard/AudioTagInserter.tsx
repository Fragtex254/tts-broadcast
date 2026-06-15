import React, { useState } from 'react';
import { AUDIO_TAGS, sanitizeAudioTag } from '../../constants/toneTags';

interface AudioTagInserterProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}

export const AudioTagInserter: React.FC<AudioTagInserterProps> = ({ textareaRef, value, onChange }) => {
  const [custom, setCustom] = useState('');

  const insert = (rawTag: string) => {
    const tag = sanitizeAudioTag(rawTag);
    if (!tag) return;
    const token = `[${tag}]`;
    const el = textareaRef.current;
    const pos = el ? el.selectionStart : value.length;
    const next = value.slice(0, pos) + token + value.slice(pos);
    onChange(next);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = pos + token.length;
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
      <span className="text-[10px] text-ink-soft/60">插入</span>
      {AUDIO_TAGS.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => insert(tag)}
          className="text-[10px] px-2 py-0.5 rounded-full bg-pink/10 border border-pink/30 hover:bg-pink/20 transition-colors"
        >
          {tag}
        </button>
      ))}
      <input
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insert(custom); setCustom(''); } }}
        placeholder="自定义"
        className="text-[10px] w-20 border border-card-border rounded-lg px-1.5 py-0.5 focus:outline-none"
      />
    </div>
  );
};

export default AudioTagInserter;
