import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ContentProject } from '../../store';
import { ProjectBriefForm } from './ProjectBriefForm';

const project: ContentProject = {
  id: 3,
  title: '创作者判断测试',
  topic: 'AI 内容工具应该替人做什么？',
  audience: '独立内容创作者',
  goal: '帮助读者建立选择标准',
  angle: '从一次失败实践切入',
  tone: '克制、具体',
  content_format: '深度文章',
  target_platform: 'general',
  thesis: 'AI 应该压缩机械劳动，而不是替代人的判断',
  personal_practice: '我曾经直接采用模型初稿，结果内容没有自己的经验。',
  personal_judgment: '真正稀缺的是取舍与责任。',
  discussion_question: '你愿意把哪一部分判断交给 AI？',
  status: 'draft',
  claims: [],
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
};

describe('ProjectBriefForm', () => {
  test('把个人实践、个人判断和讨论问题作为一等 Brief 输入保存', async () => {
    const onSave = vi.fn().mockResolvedValue(project);
    render(<ProjectBriefForm project={project} onSave={onSave} />);

    expect((screen.getByRole('textbox', { name: '个人实践' }) as HTMLTextAreaElement).value).toBe(project.personal_practice);
    expect((screen.getByRole('textbox', { name: '个人判断' }) as HTMLTextAreaElement).value).toBe(project.personal_judgment);
    expect((screen.getByRole('textbox', { name: '留给读者的问题' }) as HTMLTextAreaElement).value).toBe(project.discussion_question);

    fireEvent.change(screen.getByRole('textbox', { name: '个人判断' }), {
      target: { value: '  创作者必须保留最终取舍  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存 Brief' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      personalPractice: project.personal_practice,
      personalJudgment: '创作者必须保留最终取舍',
      discussionQuestion: project.discussion_question,
    })));
  });

  test('修改时报告未保存状态，并在保存期间锁定输入', async () => {
    const onDirtyChange = vi.fn();
    const onSave = vi.fn(() => new Promise<ContentProject>(() => undefined));
    render(<ProjectBriefForm project={project} onSave={onSave} onDirtyChange={onDirtyChange} />);

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    fireEvent.change(screen.getByRole('textbox', { name: '核心问题' }), {
      target: { value: '尚未保存的新问题' },
    });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    fireEvent.click(screen.getByRole('button', { name: '保存 Brief' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: '核心问题' }).matches(':disabled')).toBe(true));
  });
});
