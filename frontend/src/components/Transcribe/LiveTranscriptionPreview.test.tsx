import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveTranscriptionPreview } from './LiveTranscriptionPreview';

describe('LiveTranscriptionPreview', () => {
  it('转录中以只读 chunk 展示并提供明确的展开入口', () => {
    const onOpen = vi.fn();
    render(
      <LiveTranscriptionPreview
        text={'第一段\n第二段'}
        chunks={[{ index: 1, text: '第一段' }, { index: 2, text: '第二段' }]}
        progress={{ phase: 'transcribing', percent: 55, current: 2, total: 4, message: '正在转录' }}
        isTranscribing
        isPodcast
        isCopied={false}
        isOpening={false}
        onOpen={onOpen}
        onCopy={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('片段 1')).toBeTruthy();
    expect(screen.getByText('第二段')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /展开实时逐字稿/ }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('播客完成后入口变为打开对话逐字稿', () => {
    render(
      <LiveTranscriptionPreview
        text="完成文字"
        chunks={[]}
        progress={{ phase: 'completed', percent: 100, current: 0, total: 0, message: '转录完成' }}
        isTranscribing={false}
        isPodcast
        isCopied={false}
        isOpening={false}
        onOpen={vi.fn()}
        onCopy={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /打开对话逐字稿/ })).toBeTruthy();
  });
});
