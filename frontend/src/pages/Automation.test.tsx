import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useStore from '../store';
import { Automation } from './Automation';

describe('Automation', () => {
  beforeEach(() => {
    useStore.setState({
      schedules: [],
      automationExecution: {
        available: false,
        state: 'unavailable',
        reason: '自动化执行器尚未配置',
      },
      fetchSchedules: vi.fn().mockResolvedValue(undefined),
    });
  });

  test('明确说明尚未执行内容生产，并暂停创建入口', () => {
    render(
      <MemoryRouter>
        <Automation />
      </MemoryRouter>
    );

    expect(screen.getByText('功能暂不可用：自动化')).not.toBeNull();
    expect(screen.getByText('功能暂不可用：当前只保存时间配置，不会执行内容生产')).not.toBeNull();
    expect(screen.getByRole('button', { name: '等待执行器接入' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('任务名称').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('执行时间').hasAttribute('disabled')).toBe(true);
  });

  test('旧配置即使曾标记启用，也按未执行状态只读展示', () => {
    useStore.setState({
      schedules: [{
        id: 7,
        name: '旧每日早报',
        cron_expression: '0 8 * * *',
        content_types: null,
        is_active: 1,
        last_run_at: '2026-07-17T08:00:00.000Z',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-17T08:00:00.000Z',
        runtime_state: 'unavailable',
      }],
    });

    render(
      <MemoryRouter>
        <Automation />
      </MemoryRouter>
    );

    expect(screen.getByText('仅保留配置 · 当前未执行')).not.toBeNull();
    expect(screen.getByRole('switch', { name: '旧每日早报 暂不可启用' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/旧运行记录：/)).not.toBeNull();
  });

  test('执行器真实可用时才开放创建和任务开关', () => {
    useStore.setState({
      automationExecution: { available: true, state: 'available', reason: '' },
      schedules: [{
        id: 8,
        name: '真实工作流',
        cron_expression: '0 8 * * *',
        content_types: null,
        is_active: 1,
        last_run_at: null,
        created_at: '2026-07-18T00:00:00.000Z',
        updated_at: '2026-07-18T00:00:00.000Z',
        runtime_state: 'scheduled',
      }],
    });

    render(
      <MemoryRouter>
        <Automation />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: '创建自动任务' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('switch', { name: '真实工作流 已启用' }).getAttribute('aria-checked')).toBe('true');
  });
});
