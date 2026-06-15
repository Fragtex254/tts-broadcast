import React, { useState } from 'react';
import { STYLE_TAGS, sanitizeStyleTag } from '../../constants/toneTags';

interface TagPickerProps {
  value: string;
  onSelect: (tag: string) => void;
  onClose: () => void;
}

export const TagPicker: React.FC<TagPickerProps> = ({ value, onSelect, onClose }) => {
  const [custom, setCustom] = useState('');

  const applyCustom = () => {
    const clean = sanitizeStyleTag(custom);
    if (clean) onSelect(clean);
  };

  return (
    <div className="absolute z-20 mt-1 left-0 w-64 bg-white rounded-xl shadow-card border border-card-border p-3">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {STYLE_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onSelect(tag)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              value === tag ? 'bg-lilac/30 border-lilac' : 'bg-paper-2/40 border-card-border hover:bg-lilac/10'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 items-center border-t border-card-border pt-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCustom(); } }}
          placeholder="自定义风格"
          className="flex-1 text-[11px] border border-card-border rounded-lg px-2 py-1 focus:outline-none focus:border-ink/25"
        />
        <button type="button" onClick={applyCustom} className="text-[11px] px-2.5 py-1 bg-sage text-ink rounded-lg shadow-btn">应用</button>
      </div>
      <div className="flex justify-between mt-2">
        <button type="button" onClick={() => onSelect('')} className="text-[11px] text-pink">清除</button>
        <button type="button" onClick={onClose} className="text-[11px] text-ink-soft">关闭</button>
      </div>
    </div>
  );
};

export default TagPicker;
