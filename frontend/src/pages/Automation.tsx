import React, { useEffect, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Header } from '../components/Layout/Header';
import { createScopedLogger, toLogError } from '../services/logger';
import useStore from '../store';

const logger = createScopedLogger('automation-page');

const CRON_OPTIONS = [
  { label: '每天早上 8:00', value: '0 8 * * *' },
  { label: '每天中午 12:00', value: '0 12 * * *' },
  { label: '每天下午 18:00', value: '0 18 * * *' },
  { label: '工作日早上 9:00', value: '0 9 * * 1-5' },
  { label: '每周一早上 10:00', value: '0 10 * * 1' },
];

export const Automation: React.FC = () => {
  const schedules = useStore((state) => state.schedules);
  const fetchSchedules = useStore((state) => state.fetchSchedules);
  const createSchedule = useStore((state) => state.createSchedule);
  const deleteSchedule = useStore((state) => state.deleteSchedule);
  const toggleSchedule = useStore((state) => state.toggleSchedule);

  const [form, setForm] = useState({ name: '', cron_expression: '', content_types: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    void fetchSchedules().catch((loadError) => {
      setError('加载自动任务失败，请稍后重试');
      logger.error({ err: toLogError(loadError) }, '加载自动任务失败');
    });
  }, [fetchSchedules]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.cron_expression) {
      setError('请填写任务名称和执行时间');
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      await createSchedule({ ...form, name: form.name.trim() });
      setForm({ name: '', cron_expression: '', content_types: '' });
    } catch (createError) {
      setError('创建定时任务失败，请稍后重试');
      logger.error({ err: toLogError(createError) }, '创建定时任务失败');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggle = async (id: number) => {
    setError(null);
    try {
      await toggleSchedule(id);
    } catch (toggleError) {
      setError('切换任务状态失败，请稍后重试');
      logger.error({ err: toLogError(toggleError), scheduleId: id }, '切换任务状态失败');
    }
  };

  const handleDelete = async () => {
    if (deleteTargetId === null) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteSchedule(deleteTargetId);
      setDeleteTargetId(null);
    } catch (deleteError) {
      setError('删除定时任务失败，请稍后重试');
      logger.error({ err: toLogError(deleteError), scheduleId: deleteTargetId }, '删除定时任务失败');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatCron = (cron: string) => CRON_OPTIONS.find((option) => option.value === cron)?.label || cron;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="自动化" subtitle="安排固定时间自动采集、改写并生成播报" />

      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border animate-fade-in-up">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-lemon" />
              <h3 className="font-display italic text-[14px] font-medium text-ink-soft">新建自动任务</h3>
            </div>
            <p className="mb-4 max-w-2xl font-body text-[12px] leading-relaxed text-ink-soft/70">
              自动化是独立的生产任务，不再藏在系统设置里。创建后可随时暂停，不会影响手动工作流。
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block font-body text-[10px] uppercase tracking-wider text-ink-soft/70">任务名称</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="例如：每日早报"
                  className="w-full bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors placeholder-ink-soft/30"
                />
              </div>
              <div>
                <label className="mb-1 block font-body text-[10px] uppercase tracking-wider text-ink-soft/70">执行时间</label>
                <select
                  value={form.cron_expression}
                  onChange={(event) => setForm((current) => ({ ...current, cron_expression: event.target.value }))}
                  className="w-full appearance-none bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors"
                >
                  <option value="">选择执行时间</option>
                  {CRON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-body text-[10px] uppercase tracking-wider text-ink-soft/70">内容类型（可选）</label>
                <input
                  type="text"
                  value={form.content_types}
                  onChange={(event) => setForm((current) => ({ ...current, content_types: event.target.value }))}
                  placeholder="留空则使用默认"
                  className="w-full bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors placeholder-ink-soft/30"
                />
              </div>
            </div>
            {error && (
              <div className="mt-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">{error}</div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="relative overflow-hidden bg-lemon hover:brightness-105 disabled:opacity-40 text-ink rounded-full px-5 py-2.5 shadow-btn font-body text-[12px] font-medium uppercase tracking-wider transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none"
              >
                {isCreating ? '创建中...' : '添加任务'}
              </button>
            </div>
          </section>

          <section
            className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
            style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.06s both' }}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sage" />
                <h3 className="font-display italic text-[14px] font-medium text-ink-soft">任务列表</h3>
              </div>
              <span className="rounded-full bg-white/60 px-3 py-1 font-body text-[10px] uppercase tracking-wider text-ink-soft">{schedules.length} 个任务</span>
            </div>
            {schedules.length === 0 ? (
              <div className="p-10 text-center animate-fade-in">
                <p className="font-display italic text-[16px] text-ink-soft/70">暂无自动任务</p>
                <p className="mt-1 font-body text-[12px] text-ink-soft/30">需要固定生产节奏时再添加即可</p>
              </div>
            ) : (
              <div className="space-y-2">
                {schedules.map((schedule, index) => (
                  <article
                    key={schedule.id}
                    className={`flex flex-col gap-3 rounded-2xl border p-4 transition-all sm:flex-row sm:items-center sm:justify-between ${schedule.is_active ? 'border-card-border bg-white/55' : 'border-card-border bg-white/25 opacity-60'}`}
                    style={{ animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.04}s both` }}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(schedule.is_active)}
                        aria-label={`${schedule.is_active ? '暂停' : '启用'} ${schedule.name}`}
                        onClick={() => handleToggle(schedule.id)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${schedule.is_active ? 'bg-sage' : 'bg-ink/10'}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${schedule.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                      <div>
                        <p className="font-body text-[13px] font-medium text-ink">{schedule.name}</p>
                        <p className="mt-0.5 font-body text-[10px] text-ink-soft/70">{formatCron(schedule.cron_expression)}</p>
                        {schedule.last_run_at && (
                          <p className="mt-0.5 font-body text-[10px] text-ink-soft/40">上次运行：{new Date(schedule.last_run_at).toLocaleString('zh-CN')}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(schedule.id)}
                      className="self-end rounded-xl px-3 py-2 font-body text-[11px] text-ink-soft transition-colors hover:bg-pink/10 hover:text-pink sm:self-auto"
                    >
                      删除
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <ConfirmDialog
        isOpen={deleteTargetId !== null}
        title="删除自动任务"
        message="确定删除这个自动任务吗？"
        warningMessage="删除后不会影响已经生成的播报。"
        confirmText="确认删除"
        cancelText="取消"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!isDeleting) setDeleteTargetId(null);
        }}
      />
    </div>
  );
};

export default Automation;
