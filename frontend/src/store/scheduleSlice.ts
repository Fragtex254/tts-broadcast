import { scheduleApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import {
  AutomationExecutionStateSchema,
  safeParseArray,
  safeParseStrict,
  ScheduleSchema,
} from '../services/schemas';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

const logger = createScopedLogger('schedule-slice');

export function createScheduleSlice(set: StoreSet): Pick<
  AppState,
  'schedules' | 'automationExecution' | 'fetchSchedules' | 'createSchedule' | 'updateSchedule' | 'deleteSchedule' | 'toggleSchedule'
> {
  return {
    schedules: [],
    automationExecution: {
      available: false,
      state: 'unavailable',
      reason: '自动化执行器尚未配置',
    },

    fetchSchedules: async () => {
      try {
        const response = await scheduleApi.getAll();
        const schedules = safeParseArray(ScheduleSchema, response.data.schedules);
        const execution = safeParseStrict(AutomationExecutionStateSchema, response.data.execution);
        set({ schedules, automationExecution: execution });
      } catch (error) {
        logger.error({ err: toLogError(error) }, '获取定时任务失败');
        throw error;
      }
    },

    createSchedule: async (data) => {
      try {
        const response = await scheduleApi.create(data);
        const schedule = safeParseStrict(ScheduleSchema, response.data.schedule);
        const execution = safeParseStrict(AutomationExecutionStateSchema, response.data.execution);
        set((state) => ({
          schedules: [schedule, ...state.schedules],
          automationExecution: execution,
        }));
        return schedule;
      } catch (error) {
        logger.error({ err: toLogError(error), hasContentTypes: Boolean(data.content_types) }, '创建定时任务失败');
        throw error;
      }
    },

    updateSchedule: async (id, data) => {
      try {
        const response = await scheduleApi.update(id, data);
        const updated = safeParseStrict(ScheduleSchema, response.data.schedule);
        const execution = safeParseStrict(AutomationExecutionStateSchema, response.data.execution);
        set((state) => ({
          schedules: state.schedules.map((s) => (s.id === id ? updated : s)),
          automationExecution: execution,
        }));
        return updated;
      } catch (error) {
        logger.error({ err: toLogError(error), scheduleId: id, fieldCount: Object.keys(data).length }, '更新定时任务失败');
        throw error;
      }
    },

    deleteSchedule: async (id) => {
      try {
        await scheduleApi.delete(id);
        set((state) => ({
          schedules: state.schedules.filter((s) => s.id !== id),
        }));
      } catch (error) {
        logger.error({ err: toLogError(error), scheduleId: id }, '删除定时任务失败');
        throw error;
      }
    },

    toggleSchedule: async (id) => {
      try {
        const response = await scheduleApi.toggle(id);
        const updated = safeParseStrict(ScheduleSchema, response.data.schedule);
        const execution = safeParseStrict(AutomationExecutionStateSchema, response.data.execution);
        set((state) => ({
          schedules: state.schedules.map((s) => (s.id === id ? updated : s)),
          automationExecution: execution,
        }));
        return updated;
      } catch (error) {
        logger.error({ err: toLogError(error), scheduleId: id }, '切换任务状态失败');
        throw error;
      }
    },
  };
}
