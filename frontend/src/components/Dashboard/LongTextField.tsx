import React, { useState } from 'react';
import { ModalShell } from '../ModalShell';
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

      <ModalShell
        isOpen={isExpanded}
        title={label}
        subtitle={`${count} 字`}
        onClose={() => setIsExpanded(false)}
        size="lg"
        accent="sage"
        closeLabel="完成"
        headerActions={value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="rounded-xl border border-card-border bg-white/60 px-3 py-2 font-body text-[13px] text-ink-soft transition-colors hover:text-ink"
          >
            清空
          </button>
        ) : null}
        contentClassName="p-5"
      >
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoFocus
          className="min-h-[55vh] w-full resize-none rounded-2xl border border-card-border bg-white/80 px-4 py-3 font-body text-[15px] leading-7 text-ink transition-colors focus:border-ink/20 focus:outline-none"
        />
      </ModalShell>

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
