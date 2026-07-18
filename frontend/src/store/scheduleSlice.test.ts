import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  toggle: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    scheduleApi: apiMocks,
  };
});

import useStore, { type Schedule } from './index';

const schedule: Schedule = {
  id: 1,
  name: '每日证据简报',
  cron_expression: '0 8 * * *',
  content_types: null,
  is_active: 0,
  last_run_at: null,
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
  runtime_state: 'unavailable',
};

describe('scheduleSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      schedules: [],
      automationExecution: {
        available: false,
        state: 'unavailable',
        reason: '自动化执行器尚未配置',
      },
    });
  });

  test('读取后端返回的执行能力与每条任务运行态', async () => {
    apiMocks.getAll.mockResolvedValue({
      data: {
        schedules: [schedule],
        execution: { available: false, state: 'unavailable', reason: '自动化执行器尚未配置' },
      },
    });

    await useStore.getState().fetchSchedules();

    expect(useStore.getState().schedules).toEqual([schedule]);
    expect(useStore.getState().automationExecution.available).toBe(false);
  });

  test('创建响应也同步执行能力，避免前端沿用过期判断', async () => {
    apiMocks.create.mockResolvedValue({
      data: {
        schedule,
        execution: { available: true, state: 'available', reason: '' },
      },
    });

    await useStore.getState().createSchedule({ name: schedule.name, cron_expression: schedule.cron_expression });

    expect(useStore.getState().automationExecution.available).toBe(true);
    expect(useStore.getState().schedules).toEqual([schedule]);
  });
});
