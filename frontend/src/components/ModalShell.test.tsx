import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ModalShell } from './ModalShell';

afterEach(() => {
  document.body.querySelectorAll('[data-test-trigger="true"]').forEach((element) => element.remove());
});

describe('ModalShell', () => {
  test('打开后把焦点移入弹窗、限制 Tab 范围并在关闭后恢复', async () => {
    const trigger = document.createElement('button');
    trigger.dataset.testTrigger = 'true';
    document.body.appendChild(trigger);
    trigger.focus();
    const content = <><button type="button">第一个操作</button><button type="button">最后一个操作</button></>;
    const { rerender } = render(<ModalShell isOpen title="测试弹窗" showCloseButton={false} onClose={vi.fn()}>{content}</ModalShell>);

    const first = screen.getByRole('button', { name: '第一个操作' });
    const last = screen.getByRole('button', { name: '最后一个操作' });
    await waitFor(() => expect(document.activeElement).toBe(first));

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    rerender(<ModalShell isOpen={false} title="测试弹窗" showCloseButton={false} onClose={vi.fn()}>{content}</ModalShell>);
    expect(document.activeElement).toBe(trigger);
  });
});
