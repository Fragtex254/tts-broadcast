import { scheduleApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

const logger = createScopedLogger('schedule-slice');

export function createScheduleSlice(set: StoreSet): Pick<
  AppState,
  'schedules' | 'fetchSchedules' | 'createSchedule' | 'updateSchedule' | 'deleteSchedule' | 'toggleSchedule'
> {
  return {
    schedules: [],

    fetchSchedules: async () => {
      try {
        const response = await scheduleApi.getAll();
        set({ schedules: response.data.schedules });
      } catch (error) {
        logger.error({ err: toLogError(error) }, '获取定时任务失败');
        throw error;
      }
    },

    createSchedule: async (data) => {
      try {
        const response = await scheduleApi.create(data);
        const schedule = response.data.schedule;
        set((state) => ({
          schedules: [schedule, ...state.schedules],
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
        const updated = response.data.schedule;
        set((state) => ({
          schedules: state.schedules.map((s) => (s.id === id ? updated : s)),
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
        const updated = response.data.schedule;
        set((state) => ({
          schedules: state.schedules.map((s) => (s.id === id ? updated : s)),
        }));
        return updated;
      } catch (error) {
        logger.error({ err: toLogError(error), scheduleId: id }, '切换任务状态失败');
        throw error;
      }
    },
  };
}
