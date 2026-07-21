import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ContentProjectMilestone } from '../../store';
import { ProjectMilestoneFeedback } from './ProjectMilestoneFeedback';

const milestone: ContentProjectMilestone = {
  id: 'milestone-master',
  kind: 'cited_master_saved',
  title: '第一版证据主稿草案已保存',
  description: '可以继续核对引用、修改并确认。',
};

describe('ProjectMilestoneFeedback', () => {
  test('提供 polite 文本反馈、可关闭控件和不拦截操作的装饰层', () => {
    const onDismiss = vi.fn();
    render(<ProjectMilestoneFeedback milestone={milestone} onDismiss={onDismiss} />);

    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('带引用主稿草案已落盘')).not.toBeNull();
    const decoration = screen.getByTestId('milestone-decoration');
    expect(decoration.getAttribute('aria-hidden')).toBe('true');
    expect(decoration.className).toContain('pointer-events-none');

    fireEvent.click(screen.getByRole('button', { name: '关闭创作里程碑提示' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('减少动态效果时只保留静态状态条', () => {
    render(<ProjectMilestoneFeedback milestone={milestone} onDismiss={vi.fn()} prefersReducedMotion />);

    expect(screen.queryByTestId('milestone-decoration')).toBeNull();
    expect(screen.getByRole('status').className).not.toContain('animate-project-celebration');
  });

  test('AI 提纲里程碑只表达可审阅版本已落盘，不暗示用户已接受', () => {
    render(
      <ProjectMilestoneFeedback
        milestone={{ id: 'outline-1', kind: 'outline_saved', title: '提纲第 1 版已保存', description: '现在可以审阅和修改。' }}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText('可审阅提纲已落盘')).not.toBeNull();
    expect(screen.queryByText(/固定|定稿|已确认/)).toBeNull();
  });

  test('来源里程碑说明保存的是用户粘贴快照，不暗示事实已核验', () => {
    render(
      <ProjectMilestoneFeedback
        milestone={{ id: 'source-1', kind: 'source_saved', title: '第一份材料快照已入库', description: '用户粘贴材料已独立保存（未自动核验）。' }}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText('粘贴材料快照已归档')).not.toBeNull();
    expect(screen.getByText(/未自动核验/)).not.toBeNull();
  });
});
