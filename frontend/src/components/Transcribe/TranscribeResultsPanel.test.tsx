import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TranscribeResultsPanel } from './TranscribeResultsPanel';
import type { BatchTranscriptionItem } from '../../store';

function makeItem(status: BatchTranscriptionItem['status'], name: string): BatchTranscriptionItem {
  return {
    fileName: name,
    relativePath: name,
    text: status === 'completed' ? '转录文本' : '',
    status,
  } as BatchTranscriptionItem;
}

describe('TranscribeResultsPanel 状态双编码', () => {
  test('每种批量状态同时提供图标与文字，不依赖颜色辨认', () => {
    render(
      <TranscribeResultsPanel
        items={[
          makeItem('pending', 'a.mp3'),
          makeItem('transcribing', 'b.mp3'),
          makeItem('completed', 'c.mp3'),
          makeItem('failed', 'd.mp3'),
        ]}
        isTranscribing={false}
        onMergeAll={vi.fn()}
        onOpenItem={vi.fn()}
        onImportItem={vi.fn()}
      />
    );

    const pending = screen.getByRole('status', { name: '转录状态：待转录' });
    const transcribing = screen.getByRole('status', { name: '转录状态：转录中' });
    const completed = screen.getByRole('status', { name: '转录状态：已完成' });
    const failed = screen.getByRole('status', { name: '转录状态：失败' });

    expect(pending.textContent).toContain('○');
    expect(pending.textContent).toContain('待转录');
    expect(transcribing.textContent).toContain('▶');
    expect(transcribing.textContent).toContain('转录中');
    expect(completed.textContent).toContain('✓');
    expect(completed.textContent).toContain('已完成');
    expect(failed.textContent).toContain('✕');
    expect(failed.textContent).toContain('失败');
  });
});
