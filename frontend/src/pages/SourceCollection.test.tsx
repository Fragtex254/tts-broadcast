import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { SourceCollection } from './SourceCollection';

describe('SourceCollection', () => {
  test('点击 AI 今日资讯入口会打开明确的采集任务界面', () => {
    render(
      <MemoryRouter>
        <SourceCollection />
      </MemoryRouter>
    );

    expect(screen.queryByRole('dialog', { name: 'AI 今日资讯' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /AI 今日资讯/ }));

    expect(screen.getByRole('dialog', { name: 'AI 今日资讯' })).toBeTruthy();
  });
});
