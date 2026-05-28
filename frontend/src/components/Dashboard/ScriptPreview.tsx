import React, { useState, useEffect } from 'react';
import { useStore } from '../../store';

interface ScriptPreviewProps {
  onScriptReady?: (script: string) => void;
}

export const ScriptPreview: React.FC<ScriptPreviewProps> = ({ onScriptReady }) => {
  const { script, updateScript, settings } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [localScript, setLocalScript] = useState(script);

  useEffect(() => {
    setLocalScript(script);
  }, [script]);

  const handleSave = () => {
    updateScript(localScript);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalScript(script);
    setIsEditing(false);
  };

  const handleUseScript = () => {
    onScriptReady?.(script);
  };

  const handleAddOpening = () => {
    const newScript = settings.opening_script + '\n\n' + script;
    updateScript(newScript);
    setLocalScript(newScript);
  };

  const handleAddClosing = () => {
    const newScript = script + '\n\n' + settings.closing_script;
    updateScript(newScript);
    setLocalScript(newScript);
  };

  const wordCount = script.length;
  const estimatedDuration = Math.ceil(wordCount / 4); // 约 4 字/秒

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">口播稿预览</h3>
        <div className="flex items-center gap-2">
          {!isEditing && script && (
            <>
              <span className="text-xs text-gray-500">
                {wordCount} 字 | 约 {estimatedDuration} 秒
              </span>
              <button
                onClick={() => setIsEditing(true)}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                编辑
              </button>
            </>
          )}
        </div>
      </div>

      {/* 内容区 */}
      {isEditing ? (
        <div>
          <textarea
            value={localScript}
            onChange={(e) => setLocalScript(e.target.value)}
            className="w-full h-64 bg-gray-700 text-white rounded-lg p-4 border border-gray-600 focus:border-blue-500 focus:outline-none resize-none font-mono text-sm leading-relaxed"
            placeholder="在此编辑口播稿..."
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <div>
          {script ? (
            <div className="bg-gray-700 rounded-lg p-4 min-h-[16rem] max-h-80 overflow-y-auto">
              <pre className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                {script}
              </pre>
            </div>
          ) : (
            <div className="bg-gray-700 rounded-lg p-8 min-h-[16rem] flex items-center justify-center">
              <p className="text-gray-500 text-sm">
                请先获取今日资讯并点击「一键改写口播稿」
              </p>
            </div>
          )}
        </div>
      )}

      {/* 操作栏 */}
      {script && !isEditing && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
          <div className="flex gap-2">
            <button
              onClick={handleAddOpening}
              className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              + 添加开场白
            </button>
            <button
              onClick={handleAddClosing}
              className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              + 添加结束语
            </button>
          </div>
          <button
            onClick={handleUseScript}
            className="text-sm bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg px-4 py-2 transition-colors"
          >
            使用此稿件生成语音
          </button>
        </div>
      )}
    </div>
  );
};

export default ScriptPreview;
