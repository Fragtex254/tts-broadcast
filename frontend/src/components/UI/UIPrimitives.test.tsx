import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ActionButton } from './ActionButton';
import { ActionCard } from './ActionCard';
import { WorkbenchCard } from './WorkbenchCard';

describe('共享 UI 组件', () => {
  test('ActionButton 统一加载语义、文案和禁用状态', () => {
    render(<ActionButton variant="primary" isLoading loadingLabel="处理中">提交</ActionButton>);

    const button = screen.getByRole('button', { name: '处理中' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.className).toContain('bg-lemon');
  });

  test('ActionCard 保持原生按钮语义并应用功能色', () => {
    render(<ActionCard accent="lilac">开始整理</ActionCard>);

    const card = screen.getByRole('button', { name: '开始整理' });
    expect(card.getAttribute('type')).toBe('button');
    expect(card.className).toContain('pressable');
    expect(card.className).toContain('bg-lilac/15');
  });

  test('WorkbenchCard 输出统一卡片、标题和色点', () => {
    const { container } = render(<WorkbenchCard heading="当前任务" accent="sage">内容</WorkbenchCard>);

    expect(screen.getByRole('heading', { name: '当前任务' })).not.toBeNull();
    expect(container.querySelector('.bg-sage')).not.toBeNull();
    expect(container.querySelector('section')?.className).toContain('rounded-card');
    expect(container.querySelector('section')?.className).toContain('bg-white/80');
    expect(container.querySelector('section')?.className).toContain('shadow-card');
  });
});
