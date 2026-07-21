import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useStore, { type Broadcast } from '../../store';
import { BroadcastLibrary } from './BroadcastLibrary';

vi.mock('../Dashboard/AudioPlayer', () => ({ AudioPlayer: () => null }));

const historicalRender: Broadcast = {
  id: 41,
  title: '已生成历史音频',
  content: '原 Render 正文',
  artifact_revision_id: null,
  source_artifact_revision_id: null,
  audio_path: '/audio/original.wav',
  duration: 12,
  voice_type: 'preset',
  voice_config: '{"voice":"冰糖"}',
  source_items: null,
  status: 'generated',
  saved: 1,
  mode: 'segmented',
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
};

const editorDraft: Broadcast = {
  ...historicalRender,
  id: 99,
  audio_path: null,
  duration: null,
  status: 'draft',
  saved: 0,
};

const LocationProbe = () => {
  const location = useLocation();
  return <div>{location.pathname}</div>;
};

describe('BroadcastLibrary 继续编辑路由', () => {
  beforeEach(() => {
    useStore.setState({
      broadcasts: [historicalRender],
      currentBroadcast: null,
      fetchBroadcasts: vi.fn().mockResolvedValue({
        broadcasts: [historicalRender],
        pagination: { page: 1, limit: 20, total: 1 },
      }),
      forkEditorDraft: vi.fn().mockResolvedValue(editorDraft),
      cancelEditorDraftCreation: vi.fn(),
    });
  });

  test('历史 Render 先派生新 draft，再导航到新 ID', async () => {
    render(
      <MemoryRouter initialEntries={['/history']}>
        <Routes>
          <Route path="/history" element={<><BroadcastLibrary /><LocationProbe /></>} />
          <Route path="/editor/:broadcastId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: '继续编辑' })).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));

    await waitFor(() => expect(screen.getByText('/editor/99')).not.toBeNull());
    expect(useStore.getState().forkEditorDraft).toHaveBeenCalledWith(41);
  });
});
