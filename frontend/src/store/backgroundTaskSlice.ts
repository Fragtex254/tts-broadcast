import type {
  AppState,
  BackgroundTaskSnapshot,
  BackgroundTaskUpdate,
  StartBackgroundTaskInput,
} from './types';
import type { StoreSet } from './storeTypes';

export type BackgroundTaskSlice = Pick<
  AppState,
  | 'backgroundTasks'
  | 'startBackgroundTask'
  | 'updateBackgroundTask'
  | 'markBackgroundTaskConnectionLost'
  | 'endBackgroundTask'
>;

const normalizePercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
};

const normalizeRetryAttempt = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const normalizeTimestamp = (value: number | undefined, fallback: number): number => (
  value !== undefined && Number.isFinite(value) ? value : fallback
);

const createTaskSnapshot = (
  input: StartBackgroundTaskInput,
  existing: BackgroundTaskSnapshot | undefined,
  now: number,
): BackgroundTaskSnapshot => ({
  taskId: input.taskId,
  kind: input.kind,
  ...(input.entityId !== undefined
    ? { entityId: input.entityId }
    : existing?.entityId !== undefined
      ? { entityId: existing.entityId }
      : {}),
  title: input.title,
  href: input.href,
  status: input.status ?? 'connecting',
  phase: input.phase ?? 'connecting',
  percent: normalizePercent(input.percent ?? 0),
  message: input.message ?? '正在连接任务',
  retryAttempt: normalizeRetryAttempt(input.retryAttempt ?? 0),
  startedAt: normalizeTimestamp(input.startedAt, existing?.startedAt ?? now),
  updatedAt: normalizeTimestamp(input.updatedAt, now),
});

const applyTaskUpdate = (
  task: BackgroundTaskSnapshot,
  update: BackgroundTaskUpdate,
  now: number,
): BackgroundTaskSnapshot => ({
  taskId: task.taskId,
  kind: update.kind ?? task.kind,
  ...(update.entityId !== undefined
    ? { entityId: update.entityId }
    : task.entityId !== undefined
      ? { entityId: task.entityId }
      : {}),
  title: update.title ?? task.title,
  href: update.href ?? task.href,
  status: update.status ?? task.status,
  phase: update.phase ?? task.phase,
  percent: normalizePercent(update.percent ?? task.percent),
  message: update.message ?? task.message,
  retryAttempt: normalizeRetryAttempt(update.retryAttempt ?? task.retryAttempt),
  startedAt: task.startedAt,
  updatedAt: now,
});

export function createBackgroundTaskSlice(set: StoreSet): BackgroundTaskSlice {
  return {
    backgroundTasks: [],

    startBackgroundTask: (input) => {
      const now = Date.now();
      set((state) => {
        const backgroundTasks = state.backgroundTasks.filter((task) => !(
          task.taskId !== input.taskId
          && task.status === 'connection_lost'
          && task.kind === input.kind
          && task.entityId === input.entityId
        ));
        const existingIndex = backgroundTasks.findIndex((task) => task.taskId === input.taskId);
        const existing = existingIndex >= 0 ? backgroundTasks[existingIndex] : undefined;
        const nextTask = createTaskSnapshot(input, existing, now);
        if (existingIndex < 0) {
          return { backgroundTasks: [...backgroundTasks, nextTask] };
        }
        return {
          backgroundTasks: backgroundTasks.map((task, index) => (
            index === existingIndex ? nextTask : task
          )),
        };
      });
    },

    updateBackgroundTask: (taskId, update) => {
      const now = Date.now();
      set((state) => ({
        backgroundTasks: state.backgroundTasks.map((task) => (
          task.taskId === taskId ? applyTaskUpdate(task, update, now) : task
        )),
      }));
    },

    markBackgroundTaskConnectionLost: (taskId, message) => {
      const now = Date.now();
      set((state) => ({
        backgroundTasks: state.backgroundTasks.map((task) => (
          task.taskId === taskId
            ? applyTaskUpdate(task, {
                status: 'connection_lost',
                phase: 'connection_lost',
                message: message || '连接中断，可返回任务页重试',
              }, now)
            : task
        )),
      }));
    },

    endBackgroundTask: (taskId) => {
      set((state) => ({
        backgroundTasks: state.backgroundTasks.filter((task) => task.taskId !== taskId),
      }));
    },
  };
}

export default createBackgroundTaskSlice;
