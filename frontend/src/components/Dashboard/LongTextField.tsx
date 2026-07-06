import React, { useState } from 'react';
import AudioTagTextEditor from './AudioTagTextEditor';

interface LongTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minHeightClass?: string;
  enableAudioTagEditor?: boolean;
  onSuggestAudioTags?: (text: string) => Promise<string>;
}

export const LongTextField: React.FC<LongTextFieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  minHeightClass = 'min-h-32',
  enableAudioTagEditor = false,
  onSuggestAudioTags,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const count = value.trim().length;

  const textareaClassName = `w-full ${minHeightClass} max-h-72 resize-y rounded-2xl border border-card-border bg-white/80 px-4 py-3 font-body text-[15px] leading-7 text-ink transition-colors focus:border-ink/20 focus:outline-none`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block font-body text-[14px] font-medium text-ink-soft">
          {label}
        </label>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-body text-[11px] text-ink-soft/55">{count} 字</span>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="font-body text-[12px] text-ink-soft transition-colors hover:text-ink"
          >
            展开编辑
          </button>
          {enableAudioTagEditor && (
            <button
              type="button"
              onClick={() => setIsTagEditorOpen(true)}
              className="font-body text-[12px] text-ink-soft transition-colors hover:text-ink"
            >
              标签编辑
            </button>
          )}
        </div>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={textareaClassName}
      />

      {isExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="flex max-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col rounded-2xl border border-card-border bg-paper p-5 shadow-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-body text-[18px] font-semibold text-ink">{label}</h2>
                <span className="mt-1 block font-body text-[12px] text-ink-soft/60">{count} 字</span>
              </div>
              <div className="flex shrink-0 gap-2">
                {value && (
                  <button
                    type="button"
                    onClick={() => onChange('')}
                    className="rounded-xl border border-card-border bg-white/60 px-3 py-2 font-body text-[13px] text-ink-soft transition-colors hover:text-ink"
                  >
                    清空
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="rounded-xl bg-sage px-4 py-2 font-body text-[13px] font-medium text-ink shadow-btn transition-all duration-150 hover:brightness-105"
                >
                  完成
                </button>
              </div>
            </div>
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              autoFocus
              className="min-h-[55vh] w-full flex-1 resize-none rounded-2xl border border-card-border bg-white/80 px-4 py-3 font-body text-[15px] leading-7 text-ink transition-colors focus:border-ink/20 focus:outline-none"
            />
          </div>
        </div>
      )}

      {isTagEditorOpen && (
        <AudioTagTextEditor
          label={label}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          onSuggest={onSuggestAudioTags}
          onClose={() => setIsTagEditorOpen(false)}
        />
      )}
    </div>
  );
};

export default LongTextField;
