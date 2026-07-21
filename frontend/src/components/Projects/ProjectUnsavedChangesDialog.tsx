import React from 'react';
import { ModalShell } from '../ModalShell';
import { ActionButton } from '../ui/ActionButton';

interface ProjectUnsavedChangesDialogProps {
  isOpen: boolean;
  onStay: () => void;
  onLeave: () => void;
}

export const ProjectUnsavedChangesDialog: React.FC<ProjectUnsavedChangesDialogProps> = ({ isOpen, onStay, onLeave }) => (
  <ModalShell
    isOpen={isOpen}
    title="还有修改没有保存"
    subtitle="离开后，本次在 Brief、来源、证据判断、提纲或主稿编辑区里的修改不会进入版本记录。"
    accent="lemon"
    size="sm"
    showCloseButton={false}
    closeOnBackdrop={false}
    onClose={onStay}
    footer={(
      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton tone="secondary" onClick={onStay}>继续编辑</ActionButton>
        <ActionButton tone="danger" onClick={onLeave}>放弃修改并离开</ActionButton>
      </div>
    )}
  >
    <p className="ui-body text-ink-soft/80">建议先关闭此提示，回到对应区域保存；如果确认不需要这些修改，可以选择放弃并离开。</p>
  </ModalShell>
);

export default ProjectUnsavedChangesDialog;
