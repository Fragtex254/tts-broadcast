import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { SourceCollection } from './SourceCollection';

describe('SourceCollection', () => {
  test('只挂载一份资讯采集任务，并在点击入口后把焦点交给筛选器', () => {
    render(
      <MemoryRouter>
        <SourceCollection />
      </MemoryRouter>
    );

    const filters = screen.getAllByRole('combobox');
    expect(filters).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /采集资讯并写成稿/ }));

    expect(document.activeElement).toBe(filters[0]);
  });
});
