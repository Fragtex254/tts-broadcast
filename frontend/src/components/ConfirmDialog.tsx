import React from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  warningMessage?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

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
      <div className="relative bg-white rounded-2xl shadow-xl border border-card-border p-6 max-w-md w-full mx-4 animate-fade-in">
        {/* 标题 */}
        <h3 className="font-display text-[18px] font-semibold text-ink mb-2">
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
            className="px-4 py-2 bg-white border border-card-border text-ink-soft font-body text-[13px] font-medium rounded-lg hover:bg-paper-2 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-pink text-white font-body text-[13px] font-medium rounded-lg shadow-btn hover:brightness-105 transition-all disabled:opacity-50"
          >
            {isLoading ? '删除中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
