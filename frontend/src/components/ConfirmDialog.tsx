import React from 'react';
import type { ConfirmDialogProps } from '../store';
import { ModalShell } from './ModalShell';

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
    <ModalShell
      isOpen={isOpen}
      title={title}
      onClose={onCancel}
      size="sm"
      accent="pink"
      showCloseButton={false}
      contentClassName="p-5"
      footer={(
        <div className="flex items-center justify-end gap-3">
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
            className="px-5 py-2 bg-pink text-ink font-body text-[12px] font-medium rounded-full shadow-btn hover:-translate-y-px active:translate-y-0 active:shadow-none hover:brightness-105 transition-all disabled:opacity-40"
          >
            {isLoading ? `${confirmText.replace(/确认/, '正在')}...` : confirmText}
          </button>
        </div>
      )}
    >
        <p className="font-body text-[14px] text-ink-soft mb-2">
          {message}
        </p>
        {warningMessage && (
          <p className="font-body text-[13px] text-pink font-medium">
            {warningMessage}
          </p>
        )}
    </ModalShell>
  );
};

export default ConfirmDialog;
