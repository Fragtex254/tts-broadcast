import React from 'react';
import { useNavigate } from 'react-router-dom';
import { sseRegistry } from '../../services/sseRegistry';
import useStore, { type BackgroundTaskSnapshot } from '../../store';

interface TaskRowProps {
  task: BackgroundTaskSnapshot;
  onOpen: (href: string) => void;
  onRetry: (taskId: string) => void;
}

const clampPercent = (percent: number): number => Math.min(100, Math.max(0, percent));

const getTaskDescription = (task: BackgroundTaskSnapshot): string => {
  if (task.status === 'connection_lost') {
    const detail = task.message && task.message !== '连接中断，可返回任务页重试'
      ? ` · ${task.message}`
      : '';
    return `连接中断，可返回任务页重试${detail}`;
  }
  if (task.status === 'reconnecting') {
    return task.retryAttempt > 0 ? `正在重新连接（第 ${task.retryAttempt} 次）` : '正在重新连接';
  }
  if (task.status === 'connecting') return task.message || '正在连接任务';
  return task.message || task.phase || '正在处理';
};

const TaskRow: React.FC<TaskRowProps> = ({ task, onOpen, onRetry }) => {
  const percent = clampPercent(task.percent);
  const description = getTaskDescription(task);
  const isConnectionLost = task.status === 'connection_lost';

  return (
    <div
      className={`group min-w-0 rounded-xl border px-3 py-2 transition-[background-color,border-color] duration-fast ${
        isConnectionLost
          ? 'border-pink/35 bg-pink/10 hover:bg-pink/15'
          : 'border-card-border bg-white/65 hover:border-lilac/50 hover:bg-white/85'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(task.href)}
        aria-label={`打开任务：${task.title}`}
        className="ui-pressable block w-full min-w-0 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${
              isConnectionLost ? 'bg-pink' : task.status === 'running' ? 'bg-lilac animate-breathe' : 'bg-lemon animate-breathe'
            }`}
          />
          <span className="min-w-0 flex-1 truncate font-body text-[12px] font-medium text-ink" title={task.title}>
            {task.title}
          </span>
          <span className="shrink-0 font-display text-[12px] font-medium text-ink-soft">
            {Math.round(percent)}%
          </span>
        </span>
        <span className={`mt-1 block truncate font-body text-[11px] ${isConnectionLost ? 'text-ink' : 'text-ink-soft/75'}`}>
          {description}
        </span>
      </button>
      <span
        role="progressbar"
        aria-label={`${task.title}进度`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={`${Math.round(percent)}%，${description}`}
        className="mt-1.5 block h-1.5 overflow-hidden rounded-full border border-card-border bg-white/80"
      >
        <span
          className={`block h-full rounded-full transition-[width] duration-normal ${isConnectionLost ? 'bg-pink' : 'bg-lilac'}`}
          style={{ width: `${percent}%` }}
        />
      </span>
      {isConnectionLost && (
        <button
          type="button"
          onClick={() => onRetry(task.taskId)}
          className="ui-pressable mt-2 min-h-8 rounded-full bg-white/75 px-3 font-body text-[11px] font-medium text-ink hover:bg-white"
        >
          重新连接
        </button>
      )}
    </div>
  );
};

export const GlobalTaskProgressBar: React.FC = () => {
  const tasks = useStore((state) => state.backgroundTasks);
  const updateBackgroundTask = useStore((state) => state.updateBackgroundTask);
  const markConnectionLost = useStore((state) => state.markBackgroundTaskConnectionLost);
  const navigate = useNavigate();

  const retryTask = (taskId: string) => {
    if (!sseRegistry.reconnect(taskId)) {
      markConnectionLost(taskId, '连接已失效，请返回任务页重新发起');
      return;
    }
    updateBackgroundTask(taskId, {
      status: 'connecting',
      phase: 'connecting',
      retryAttempt: 0,
      message: '正在恢复后台任务连接',
    });
  };

  if (tasks.length === 0) return null;

  return (
    <section
      aria-label="后台任务进行中"
      aria-live="polite"
      className="shrink-0 border-b border-card-border bg-paper-2/95 px-4 py-2.5 sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex shrink-0 items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-lemon animate-breathe" aria-hidden="true" />
          <span className="font-body text-[12px] font-semibold text-ink">后台任务进行中</span>
          {tasks.length > 1 && (
            <span className="rounded-full bg-white/75 px-2 py-0.5 font-body text-[11px] text-ink-soft">
              {tasks.length} 项
            </span>
          )}
        </div>
        <div className="grid min-w-0 flex-1 gap-2 lg:grid-cols-2">
          {tasks.map((task) => (
            <TaskRow key={task.taskId} task={task} onOpen={navigate} onRetry={retryTask} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default GlobalTaskProgressBar;
