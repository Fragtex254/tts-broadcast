import React, { useMemo, useState } from 'react';
import { getApiErrorMessage } from '../../services/apiError';

type AudioTagKind = 'style' | 'audio';
type TokenKind = 'word' | 'space' | 'punctuation' | 'style-tag' | 'audio-tag';

interface AudioTagGroup {
  title: string;
  tags: string[];
  kind: AudioTagKind;
}

interface TextToken {
  id: string;
  text: string;
  start: number;
  end: number;
  kind: TokenKind;
}

interface AudioTagTextEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onSuggest?: (text: string) => Promise<string>;
  onClose: () => void;
}

const STYLE_TAG_GROUPS: AudioTagGroup[] = [
  { title: '基础情绪', kind: 'style', tags: ['开心', '悲伤', '愤怒', '恐惧', '惊讶', '兴奋', '委屈', '平静', '冷漠'] },
  { title: '复合情绪', kind: 'style', tags: ['怅然', '欣慰', '无奈', '愧疚', '释然', '嫉妒', '厌倦', '忐忑', '动情'] },
  { title: '整体语调', kind: 'style', tags: ['温柔', '高冷', '活泼', '严肃', '慵懒', '俏皮', '深沉', '干练', '凌厉'] },
  { title: '音色定位', kind: 'style', tags: ['磁性', '醇厚', '清亮', '空灵', '稚嫩', '苍老', '甜美', '沙哑', '醇雅'] },
  { title: '人设腔调', kind: 'style', tags: ['夹子音', '御姐音', '正太音', '大叔音', '台湾腔'] },
  { title: '方言', kind: 'style', tags: ['东北话', '四川话', '河南话', '粤语'] },
  { title: '角色扮演', kind: 'style', tags: ['孙悟空', '林黛玉'] },
];

const AUDIO_TAG_GROUPS: AudioTagGroup[] = [
  { title: '语速与节奏', kind: 'audio', tags: ['吸气', '深呼吸', '叹气', '长叹一口气', '喘息', '屏息', '语速加快', '语速放慢', '停顿片刻', '沉默片刻'] },
  { title: '情绪状态', kind: 'audio', tags: ['紧张', '害怕', '激动', '疲惫', '委屈', '撒娇', '心虚', '震惊', '不耐烦'] },
  { title: '语音特征', kind: 'audio', tags: ['颤抖', '声音颤抖', '变调', '破音', '鼻音', '气声', '沙哑', '小声', '提高音量喊话'] },
  { title: '哭笑表达', kind: 'audio', tags: ['笑', '轻笑', '大笑', '冷笑', '抽泣', '呜咽', '哽咽', '嚎啕大哭'] },
];

const STYLE_TAG_SET = new Set(STYLE_TAG_GROUPS.flatMap((group) => group.tags));

function formatTag(tag: string) {
  return `[${tag}]`;
}

function splitTagContent(content: string) {
  return content
    .split(/[，,、\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeTagContent(existing: string, next: string) {
  const parts = splitTagContent(existing);
  for (const item of splitTagContent(next)) {
    if (!parts.includes(item)) parts.push(item);
  }
  return parts.join('，');
}

function getBracketContent(tagText: string) {
  const match = tagText.match(/^\[([^\]]+)\]$/u);
  return match ? match[1].trim() : '';
}

function isTagToken(token: TextToken) {
  return token.kind === 'style-tag' || token.kind === 'audio-tag';
}

function stripAllTags(text: string) {
  return text.replace(/\[[^\]]+\]/gu, '');
}

function insertTagIntoText(source: string, tagText: string, position: number) {
  const content = getBracketContent(tagText);
  if (!content) {
    return {
      text: `${source.slice(0, position)}${tagText}${source.slice(position)}`,
      cursor: position + tagText.length,
    };
  }

  if (position > 0 && source[position - 1] === ']') {
    const openIndex = source.lastIndexOf('[', position - 1);
    if (openIndex >= 0) {
      const existingContent = source.slice(openIndex + 1, position - 1);
      const mergedTag = `[${mergeTagContent(existingContent, content)}]`;
      return {
        text: `${source.slice(0, openIndex)}${mergedTag}${source.slice(position)}`,
        cursor: openIndex + mergedTag.length,
      };
    }
  }

  if (source[position] === '[') {
    const closeIndex = source.indexOf(']', position + 1);
    if (closeIndex > position) {
      const existingContent = source.slice(position + 1, closeIndex);
      const mergedTag = `[${mergeTagContent(existingContent, content)}]`;
      return {
        text: `${source.slice(0, position)}${mergedTag}${source.slice(closeIndex + 1)}`,
        cursor: position + mergedTag.length,
      };
    }
  }

  return {
    text: `${source.slice(0, position)}${tagText}${source.slice(position)}`,
    cursor: position + tagText.length,
  };
}

function isWordSegment(segment: string) {
  return /[\p{Script=Han}\p{Letter}\p{Number}]/u.test(segment);
}

function makeToken(text: string, start: number, kind: TokenKind): TextToken {
  return {
    id: `${start}-${text}`,
    text,
    start,
    end: start + text.length,
    kind,
  };
}

function getBracketTokenKind(text: string): TokenKind {
  const content = getBracketContent(text);
  const parts = splitTagContent(content);
  if (parts.length > 0 && parts.every((part) => STYLE_TAG_SET.has(part))) return 'style-tag';
  return 'audio-tag';
}

function tokenizePlainText(text: string, offset: number): TextToken[] {
  if (!text) return [];

  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
    return Array.from(segmenter.segment(text))
      .filter((segment) => segment.segment.length > 0)
      .map((segment) => {
        const start = offset + segment.index;
        if (/^\s+$/u.test(segment.segment)) return makeToken(segment.segment, start, 'space');
        return makeToken(segment.segment, start, isWordSegment(segment.segment) ? 'word' : 'punctuation');
      });
  }

  const tokens: TextToken[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const start = index;
    if (/\s/u.test(char)) {
      while (index < text.length && /\s/u.test(text[index])) index += 1;
      tokens.push(makeToken(text.slice(start, index), offset + start, 'space'));
    } else if (/[\p{Letter}\p{Number}_-]/u.test(char)) {
      while (index < text.length && /[\p{Letter}\p{Number}_-]/u.test(text[index])) index += 1;
      tokens.push(makeToken(text.slice(start, index), offset + start, 'word'));
    } else {
      index += 1;
      tokens.push(makeToken(char, offset + start, isWordSegment(char) ? 'word' : 'punctuation'));
    }
  }
  return tokens;
}

function tokenizeTaggedText(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (char === '[') {
      const closeIndex = text.indexOf(']', index + 1);
      if (closeIndex > index) {
        const tagText = text.slice(index, closeIndex + 1);
        tokens.push(makeToken(tagText, index, getBracketTokenKind(tagText)));
        index = closeIndex + 1;
        continue;
      }
    }

    const nextAudio = text.indexOf('[', index + 1);
    const nextTagIndex = nextAudio > index ? nextAudio : text.length;
    tokens.push(...tokenizePlainText(text.slice(index, nextTagIndex), index));
    index = nextTagIndex;
  }

  return tokens;
}

function tokenClassName(kind: TokenKind) {
  if (kind === 'style-tag') return 'border-sage/45 bg-sage/35 text-ink';
  if (kind === 'audio-tag') return 'border-lilac/45 bg-lilac/45 text-ink';
  if (kind === 'punctuation') return 'border-card-border bg-white/50 text-ink-soft';
  return 'border-card-border bg-white/75 text-ink';
}

function replaceTextRange(source: string, start: number, end: number, replacement: string) {
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

interface DropSlotProps {
  position: number;
  isSelected: boolean;
  onDropSnippet: (snippet: string, position: number) => void;
  onSelect: (position: number) => void;
}

const DropSlot: React.FC<DropSlotProps> = ({ position, isSelected, onDropSnippet, onSelect }) => {
  const [isOver, setIsOver] = useState(false);

  return (
    <button
      type="button"
      title="插入到这里"
      aria-label={`插入位置 ${position}`}
      onClick={() => onSelect(position)}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        const snippet = event.dataTransfer.getData('text/plain');
        setIsOver(false);
        if (snippet) onDropSnippet(snippet, position);
      }}
      className={`h-8 w-2 shrink-0 rounded-full border transition-all duration-150 ${
        isOver || isSelected
          ? 'w-7 border-lilac/50 bg-lilac/60'
          : 'border-transparent bg-ink/5 hover:w-5 hover:border-card-border hover:bg-white/70'
      }`}
    />
  );
};

export const AudioTagTextEditor: React.FC<AudioTagTextEditorProps> = ({
  label,
  value,
  onChange,
  placeholder,
  onSuggest,
  onClose,
}) => {
  const tokens = useMemo(() => tokenizeTaggedText(value), [value]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInsertIndex, setSelectedInsertIndex] = useState(value.length);

  const insertSnippet = (snippet: string, position: number) => {
    const next = insertTagIntoText(value, snippet, position);
    onChange(next.text);
    setSelectedInsertIndex(next.cursor);
  };

  const insertTag = (tag: string) => {
    insertSnippet(formatTag(tag), Math.min(selectedInsertIndex, value.length));
  };

  const removeTagToken = (token: TextToken) => {
    onChange(replaceTextRange(value, token.start, token.end, ''));
    setSelectedInsertIndex(token.start);
  };

  const removeTagPart = (token: TextToken, partIndex: number) => {
    const parts = splitTagContent(getBracketContent(token.text));
    const remaining = parts.filter((_, index) => index !== partIndex);
    const replacement = remaining.length > 0 ? `[${remaining.join('，')}]` : '';
    onChange(replaceTextRange(value, token.start, token.end, replacement));
    setSelectedInsertIndex(token.start + replacement.length);
  };

  const clearAllTags = () => {
    const nextValue = stripAllTags(value);
    onChange(nextValue);
    setSelectedInsertIndex(nextValue.length);
  };

  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, tag: string) => {
    event.dataTransfer.setData('text/plain', formatTag(tag));
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleSuggest = async () => {
    if (!onSuggest) return;
    if (!value.trim()) {
      setError('请输入试听文本');
      return;
    }
    setError(null);
    setIsSuggesting(true);
    try {
      const taggedText = await onSuggest(value);
      onChange(taggedText);
      setSelectedInsertIndex(taggedText.length);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'AI 标签处理失败，请确认后端服务已启动'));
    } finally {
      setIsSuggesting(false);
    }
  };

  const renderGroup = (group: AudioTagGroup) => (
    <div key={`${group.kind}-${group.title}`} className="rounded-xl border border-card-border bg-white/55 p-3">
      <div className="mb-2 font-body text-[11px] uppercase tracking-wider text-ink-soft/70">
        {group.title}
      </div>
      <div className="flex flex-wrap gap-2">
        {group.tags.map((tag) => (
          <button
            key={`${group.kind}-${tag}`}
            type="button"
            draggable
            onDragStart={(event) => handleDragStart(event, tag)}
            onClick={() => insertTag(tag)}
            className={`rounded-full px-3 py-1.5 font-body text-[12px] text-ink transition-all duration-150 hover:-translate-y-px hover:brightness-105 ${
              group.kind === 'style' ? 'bg-sage/45' : 'bg-lilac/55'
            }`}
          >
            {formatTag(tag)}
          </button>
        ))}
      </div>
    </div>
  );

  const renderTextToken = (token: TextToken) => {
    if (!isTagToken(token)) {
      return (
        <span
          className={`inline-flex min-h-8 max-w-full items-center rounded-full border px-3 py-1.5 font-body text-[14px] leading-5 shadow-sm ${tokenClassName(token.kind)}`}
        >
          {token.text}
        </span>
      );
    }

    const parts = splitTagContent(getBracketContent(token.text));
    return (
      <span
        className={`inline-flex min-h-8 max-w-full flex-wrap items-center gap-1 rounded-full border px-2.5 py-1.5 font-body text-[13px] leading-5 shadow-sm ${tokenClassName(token.kind)}`}
      >
        <span className="text-ink-soft/70">[</span>
        {parts.map((part, index) => (
          <React.Fragment key={`${token.id}-${part}-${index}`}>
            {index > 0 && <span className="text-ink-soft/65">，</span>}
            <span className="inline-flex items-center gap-1 rounded-full bg-white/55 px-2 py-0.5">
              <span>{part}</span>
              <button
                type="button"
                title={`删除 ${part}`}
                aria-label={`删除标签 ${part}`}
                onClick={() => removeTagPart(token, index)}
                className="rounded-full px-1 font-body text-[12px] text-ink-soft transition-colors hover:bg-pink/15 hover:text-ink"
              >
                x
              </button>
            </span>
          </React.Fragment>
        ))}
        <span className="text-ink-soft/70">]</span>
        <button
          type="button"
          title="删除整个标签"
          aria-label={`删除整个标签 ${token.text}`}
          onClick={() => removeTagToken(token)}
          className="ml-1 rounded-full border border-card-border bg-white/50 px-1.5 font-body text-[11px] text-ink-soft transition-colors hover:bg-pink/15 hover:text-ink"
        >
          移除
        </button>
      </span>
    );
  };

  const hasTags = tokens.some(isTagToken);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${label}标签编辑`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col rounded-2xl border border-card-border bg-paper p-5 shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-body text-[18px] font-semibold text-ink">{label}标签编辑</h2>
            <span className="mt-1 block font-body text-[12px] text-ink-soft/60">{value.trim().length} 字</span>
          </div>
          <div className="flex shrink-0 gap-2">
            {hasTags && (
              <button
                type="button"
                onClick={clearAllTags}
                className="rounded-xl border border-card-border bg-white/60 px-3 py-2 font-body text-[13px] text-ink-soft transition-colors hover:text-ink"
              >
                清空标签
              </button>
            )}
            {onSuggest && (
              <button
                type="button"
                onClick={handleSuggest}
                disabled={isSuggesting}
                className="rounded-xl bg-lilac px-4 py-2 font-body text-[13px] font-medium text-ink shadow-btn transition-all duration-150 hover:brightness-105 disabled:opacity-40"
              >
                {isSuggesting ? '处理中...' : 'AI 自动优化'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-sage px-4 py-2 font-body text-[13px] font-medium text-ink shadow-btn transition-all duration-150 hover:brightness-105"
            >
              完成
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-h-0 flex-col gap-3">
            <div className="min-h-[42vh] overflow-y-auto rounded-2xl border border-card-border bg-white/70 p-4">
              {tokens.length > 0 ? (
                <div className="flex flex-wrap items-center gap-y-2">
                  <DropSlot
                    position={0}
                    isSelected={selectedInsertIndex === 0}
                    onDropSnippet={insertSnippet}
                    onSelect={setSelectedInsertIndex}
                  />
                  {tokens.map((token) => (
                    token.kind === 'space' ? (
                      <span key={token.id} className="h-8 w-3 shrink-0" />
                    ) : (
                      <React.Fragment key={token.id}>
                        {renderTextToken(token)}
                        <DropSlot
                          position={token.end}
                          isSelected={selectedInsertIndex === token.end}
                          onDropSnippet={insertSnippet}
                          onSelect={setSelectedInsertIndex}
                        />
                      </React.Fragment>
                    )
                  ))}
                </div>
              ) : (
                <div className="flex h-full min-h-56 items-center justify-center rounded-xl border border-dashed border-card-border bg-white/45 px-4 text-center font-body text-[13px] text-ink-soft/60">
                  {placeholder}
                </div>
              )}
            </div>

            <textarea
              value={value}
              onChange={(event) => {
                onChange(event.target.value);
                setSelectedInsertIndex(event.target.value.length);
              }}
              placeholder={placeholder}
              className="min-h-28 resize-y rounded-2xl border border-card-border bg-white/80 px-4 py-3 font-body text-[14px] leading-6 text-ink transition-colors focus:border-ink/20 focus:outline-none"
            />
          </div>

          <div className="min-h-0 overflow-y-auto rounded-2xl border border-card-border bg-white/40 p-3">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sage" />
              <span className="font-body text-[12px] font-medium text-ink-soft">开头风格标签</span>
            </div>
            <div className="space-y-3">
              {STYLE_TAG_GROUPS.map(renderGroup)}
            </div>
            <div className="mb-3 mt-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-lilac" />
              <span className="font-body text-[12px] font-medium text-ink-soft">正文音频标签</span>
            </div>
            <div className="space-y-3">
              {AUDIO_TAG_GROUPS.map(renderGroup)}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[13px] text-ink animate-shake">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioTagTextEditor;
