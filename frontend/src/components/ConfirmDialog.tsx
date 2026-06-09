import React from 'react';
import type { ConfirmDialogProps } from '../store';

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  warningMessage,
  confirmText = '确认删除',
  cancelText = '取消',
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* 对话框 */}
      <div className="relative bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border max-w-md w-full mx-4 animate-fade-in">
        {/* 标题 */}
        <h3 className="font-display italic text-[18px] font-medium text-ink mb-2">
          {title}
        </h3>

        {/* 消息 */}
        <p className="font-body text-[14px] text-ink-soft mb-2">
          {message}
        </p>

        {/* 警告消息 */}
        {warningMessage && (
          <p className="font-body text-[13px] text-pink font-medium mb-4">
            {warningMessage}
          </p>
        )}

        {/* 按钮 */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="text-ink-soft hover:text-ink font-body text-[12px] transition-colors disabled:opacity-40"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-5 py-2 bg-pink text-white font-body text-[12px] font-medium rounded-full shadow-btn hover:-translate-y-px active:translate-y-0 active:shadow-none hover:brightness-105 transition-all disabled:opacity-40"
          >
            {isLoading ? confirmText.replace(/确认/, '正在') + '...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
