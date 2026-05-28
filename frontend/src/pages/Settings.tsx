import React, { useEffect, useState } from 'react';
import { Header } from '../components/Layout/Header';
import useStore from '../store';

/** 音色选项列表 */
const voiceOptions = [
  { value: '冰糖', label: '冰糖' },
  { value: '蜜糖', label: '蜜糖' },
  { value: '清风', label: '清风' },
  { value: '墨鱼', label: '墨鱼' },
  { value: '楠楠', label: '楠楠' },
];

/** cron 表达式示例 */
const cronExamples = [
  { label: '每天早上 8:00', value: '0 8 * * *' },
  { label: '每天中午 12:00', value: '0 12 * * *' },
  { label: '每天下午 18:00', value: '0 18 * * *' },
  { label: '工作日早上 9:00', value: '0 9 * * 1-5' },
  { label: '每周一早上 10:00', value: '0 10 * * 1' },
];

export const Settings: React.FC = () => {
  const {
    settings,
    isLoadingSettings,
    fetchSettings,
    updateSettings,
    testApiKey,
    schedules,
    fetchSchedules,
    createSchedule,
    deleteSchedule,
    toggleSchedule,
  } = useStore();

  // 本地表单状态
  const [formData, setFormData] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; error?: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 定时任务表单状态
  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    cron_expression: '',
    content_types: '',
  });
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // 加载设置和定时任务
  useEffect(() => {
    fetchSettings();
    fetchSchedules();
  }, []);

  // 同步设置到表单
  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  /** 处理表单字段变化 */
  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaveSuccess(false);
  };

  /** 保存设置 */
  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateSettings(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('保存设置失败:', error);
    } finally {
      setIsSaving(false);
    }
  };

  /** 测试 API Key */
  const handleTestKey = async () => {
    setIsTestingKey(true);
    setTestResult(null);
    try {
      const result = await testApiKey();
      setTestResult(result);
    } catch (error) {
      setTestResult({ valid: false, error: (error as Error).message });
    } finally {
      setIsTestingKey(false);
    }
  };

  /** 创建定时任务 */
  const handleCreateSchedule = async () => {
    if (!scheduleForm.name || !scheduleForm.cron_expression) {
      setScheduleError('请填写任务名称和执行时间');
      return;
    }

    setIsCreatingSchedule(true);
    setScheduleError(null);
    try {
      await createSchedule(scheduleForm);
      setScheduleForm({ name: '', cron_expression: '', content_types: '' });
    } catch (error) {
      setScheduleError('创建定时任务失败');
      console.error(error);
    } finally {
      setIsCreatingSchedule(false);
    }
  };

  /** 删除定时任务 */
  const handleDeleteSchedule = async (id: number) => {
    if (!window.confirm('确定要删除此定时任务吗？')) return;
    try {
      await deleteSchedule(id);
    } catch (error) {
      console.error('删除定时任务失败:', error);
    }
  };

  /** 切换任务状态 */
  const handleToggleSchedule = async (id: number) => {
    try {
      await toggleSchedule(id);
    } catch (error) {
      console.error('切换任务状态失败:', error);
    }
  };

  /** 格式化 cron 表达式为可读描述 */
  const formatCronExpression = (cron: string): string => {
    const example = cronExamples.find((e) => e.value === cron);
    return example ? example.label : cron;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="系统设置" subtitle="配置 TTS 播报系统参数" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 加载状态 */}
          {isLoadingSettings && (
            <div className="bg-gray-800 rounded-lg p-8 text-center">
              <div className="flex items-center justify-center gap-3">
                <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-gray-400">加载设置中...</span>
              </div>
            </div>
          )}

          {/* API Key 设置 */}
          {!isLoadingSettings && (
            <section className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                API Key 设置
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    MiMo API Key
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="password"
                      value={formData.mimo_api_key}
                      onChange={(e) => handleChange('mimo_api_key', e.target.value)}
                      placeholder="请输入 MiMo API Key"
                      className="flex-1 px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    />
                    <button
                      onClick={handleTestKey}
                      disabled={isTestingKey || !formData.mimo_api_key}
                      className="px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {isTestingKey ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          测试中...
                        </>
                      ) : (
                        '测试连接'
                      )}
                    </button>
                  </div>
                  {testResult && (
                    <div className={`mt-3 p-3 rounded-lg text-sm ${
                      testResult.valid
                        ? 'bg-green-900/30 text-green-400 border border-green-800'
                        : 'bg-red-900/30 text-red-400 border border-red-800'
                    }`}>
                      {testResult.valid ? 'API Key 验证成功！' : `验证失败: ${testResult.error}`}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* 音色设置 */}
          {!isLoadingSettings && (
            <section className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                音色设置
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  默认音色
                </label>
                <select
                  value={formData.default_voice}
                  onChange={(e) => handleChange('default_voice', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors appearance-none cursor-pointer"
                >
                  {voiceOptions.map((voice) => (
                    <option key={voice.value} value={voice.value}>
                      {voice.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-sm text-gray-500">
                  选择播报时使用的默认语音音色
                </p>
              </div>
            </section>
          )}

          {/* 播报设置 */}
          {!isLoadingSettings && (
            <section className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
                播报设置
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    开场白
                  </label>
                  <textarea
                    value={formData.opening_script}
                    onChange={(e) => handleChange('opening_script', e.target.value)}
                    rows={3}
                    placeholder="请输入播报开场白"
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    结束语
                  </label>
                  <textarea
                    value={formData.closing_script}
                    onChange={(e) => handleChange('closing_script', e.target.value)}
                    rows={3}
                    placeholder="请输入播报结束语"
                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                  />
                </div>
              </div>
            </section>
          )}

          {/* 保存设置按钮 */}
          {!isLoadingSettings && (
            <div className="flex items-center justify-between">
              {saveSuccess && (
                <span className="text-green-400 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  设置已保存
                </span>
              )}
              <div className="flex-1" />
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    保存中...
                  </>
                ) : (
                  '保存设置'
                )}
              </button>
            </div>
          )}

          {/* 定时任务设置 */}
          <section className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              定时任务
            </h3>

            {/* 添加任务表单 */}
            <div className="bg-gray-750 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-medium text-gray-300 mb-3">添加新任务</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">任务名称</label>
                  <input
                    type="text"
                    value={scheduleForm.name}
                    onChange={(e) => setScheduleForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="例如：每日早报"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">执行时间</label>
                  <select
                    value={scheduleForm.cron_expression}
                    onChange={(e) => setScheduleForm((prev) => ({ ...prev, cron_expression: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer"
                  >
                    <option value="">选择执行时间</option>
                    {cronExamples.map((example) => (
                      <option key={example.value} value={example.value}>
                        {example.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">内容类型（可选）</label>
                  <input
                    type="text"
                    value={scheduleForm.content_types}
                    onChange={(e) => setScheduleForm((prev) => ({ ...prev, content_types: e.target.value }))}
                    placeholder="留空则使用默认设置"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              {scheduleError && (
                <p className="mt-2 text-sm text-red-400">{scheduleError}</p>
              )}
              <div className="mt-3 flex justify-end">
                <button
                  onClick={handleCreateSchedule}
                  disabled={isCreatingSchedule}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCreatingSchedule ? '创建中...' : '添加任务'}
                </button>
              </div>
            </div>

            {/* 任务列表 */}
            {schedules.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>暂无定时任务</p>
                <p className="text-sm mt-1">添加定时任务可自动生成播报</p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                      schedule.is_active
                        ? 'bg-gray-750 border-gray-600'
                        : 'bg-gray-800 border-gray-700 opacity-60'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleSchedule(schedule.id)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            schedule.is_active ? 'bg-blue-600' : 'bg-gray-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              schedule.is_active ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <div>
                          <p className="text-sm font-medium text-white">{schedule.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatCronExpression(schedule.cron_expression)}
                          </p>
                        </div>
                      </div>
                      {schedule.last_run_at && (
                        <p className="text-xs text-gray-500 mt-1 ml-14">
                          上次运行: {new Date(schedule.last_run_at).toLocaleString('zh-CN')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteSchedule(schedule.id)}
                      className="ml-4 p-2 text-gray-400 hover:text-red-400 transition-colors"
                      title="删除任务"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default Settings;
