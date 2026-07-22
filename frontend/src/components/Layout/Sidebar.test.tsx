import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  test('品牌表达以内容创作为中心，同时保留稳定的任务导航', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByText('HCDS Studio')).not.toBeNull();
    expect(screen.getByText('证据驱动创作')).not.toBeNull();
    expect(screen.getByRole('link', { name: '工作台' })).not.toBeNull();
    expect(screen.getByRole('link', { name: '内容库' })).not.toBeNull();
    expect(screen.getByRole('link', { name: '音色库' })).not.toBeNull();
    expect(screen.queryByRole('link', { name: '自动化' })).toBeNull();
    expect(screen.getByRole('link', { name: '设置' })).not.toBeNull();
  });
});
