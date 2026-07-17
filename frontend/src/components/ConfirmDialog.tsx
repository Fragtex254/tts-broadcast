import React from 'react';
import type { ConfirmDialogProps } from '../store';
import { ModalShell } from './ModalShell';
import { ActionButton } from './UI';

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
          <ActionButton
            onClick={onCancel}
            disabled={isLoading}
            variant="text"
          >
            {cancelText}
          </ActionButton>
          <ActionButton
            onClick={onConfirm}
            variant="danger"
            shape="pill"
            isLoading={isLoading}
            loadingLabel={`${confirmText.replace(/确认/, '正在')}...`}
          >
            {confirmText}
          </ActionButton>
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
