import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { ContentProjectWorkspace } from '../../store';
import { ProjectAssetSummary } from './ProjectAssetSummary';

const workspace = {
  sources: [{ id: 1 }, { id: 2 }],
  evidence: [
    { id: 3, reuse_eligible: true },
    { id: 4, reuse_eligible: false },
  ],
  artifacts: [
    { kind: 'outline', current_revision: { revision_number: 2 } },
    { kind: 'master', current_revision: { revision_number: 1 } },
  ],
} as ContentProjectWorkspace;

describe('ProjectAssetSummary', () => {
  test('紧凑展示创作资产状态而不是制造步骤完成压力', () => {
    render(<ProjectAssetSummary workspace={workspace} />);
    expect(screen.getByText('2 份原始来源')).not.toBeNull();
    expect(screen.getByText('1 条可用证据')).not.toBeNull();
    expect(screen.getByText('提纲 v2')).not.toBeNull();
    expect(screen.getByText('主稿 v1')).not.toBeNull();
    expect(screen.queryByText(/完成率/)).toBeNull();
  });
});
