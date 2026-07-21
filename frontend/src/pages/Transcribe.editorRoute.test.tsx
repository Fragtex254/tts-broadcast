import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../components/Transcribe/useTranscribeFileSelection', () => ({
  useTranscribeFileSelection: () => ({
    mode: 'batch',
    file: null,
    batchFiles: [],
    selectedIndexes: new Set<number>(),
    handleSelectedFiles: vi.fn(),
    handleFileSelect: vi.fn(),
    handleFolderSelect: vi.fn(),
    removeBatchFile: vi.fn(),
    toggleSelect: vi.fn(),
    toggleSelectAll: vi.fn(),
    clearBatchFiles: vi.fn(),
  }),
}));

vi.mock('../components/Transcribe/useTranscribeProviderState', () => ({
  useTranscribeProviderState: () => ({
    contentMode: 'standard',
    asrProvider: 'wsl_asr',
    transcribeOptions: { contentMode: 'standard' },
    isMossModelMissing: false,
    isPodcastUnavailable: false,
    controls: { language: 'auto' },
  }),
}));

vi.mock('../components/Transcribe/TranscribeBatchPanel', () => ({
  TranscribeBatchPanel: ({ error }: { error: string | null }) => error
    ? <div role="alert">{error}</div>
    : <div>批量面板</div>,
}));
vi.mock('../components/Transcribe/TranscribeResultsPanel', () => ({
  TranscribeResultsPanel: ({ onImportItem }: { onImportItem: (text: string) => void }) => (
    <button type="button" onClick={() => onImportItem('  转录导入正文  ')}>导入临时稿</button>
  ),
}));
vi.mock('../components/Transcribe/TranscribeResultOverlays', () => ({ TranscribeResultOverlays: () => null }));
vi.mock('../components/Transcribe/TranscribeBatchFileList', () => ({ TranscribeBatchFileList: () => null }));

import useStore, { type Broadcast } from '../store';
import { broadcastApi } from '../services/api';
import { Transcribe } from './Transcribe';

const realCreateEditorDraft = useStore.getState().createEditorDraft;
const realCancelEditorDraftCreation = useStore.getState().cancelEditorDraftCreation;

const draft: Broadcast = {
  id: 73,
  title: '转录导入正文',
  content: '转录导入正文',
  artifact_revision_id: null,
  source_artifact_revision_id: null,
  audio_path: null,
  duration: null,
  voice_type: null,
  voice_config: '{}',
  source_items: null,
  status: 'draft',
  saved: 0,
  mode: 'segmented',
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
};

const LocationProbe = () => {
  const location = useLocation();
  return <div>{location.pathname}</div>;
};

const LeaveButton = () => {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/other')}>离开转录页</button>;
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/transcribe']}>
      <Routes>
        <Route path="/transcribe" element={<><Transcribe /><LeaveButton /><LocationProbe /></>} />
        <Route path="/editor/:broadcastId" element={<LocationProbe />} />
        <Route path="/other" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Transcribe 导入编辑器 URL 链路', () => {
  beforeEach(() => {
    useStore.setState({
      batchTranscriptionItems: [{
        fileName: 'interview.mp3',
        relativePath: 'interview.mp3',
        text: '转录导入正文',
        status: 'completed',
      }],
      isBatchTranscribing: false,
      isCreatingEditorDraft: false,
      createEditorDraft: vi.fn().mockResolvedValue(draft),
      cancelEditorDraftCreation: vi.fn(),
    });
  });

  test('先创建持久化 draft，再使用服务端 ID 导航', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '导入临时稿' }));

    await waitFor(() => expect(screen.getByText('/editor/73')).not.toBeNull());
    expect(useStore.getState().createEditorDraft).toHaveBeenCalledWith({ text: '转录导入正文' });
  });

  test('draft 创建失败时留在转录页并显示可重试错误', async () => {
    useStore.setState({ createEditorDraft: vi.fn().mockRejectedValue(new Error('草稿保存失败')) });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '导入临时稿' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('草稿保存失败'));
    expect(screen.getByText('/transcribe')).not.toBeNull();
  });

  test('draft 请求未完成时离开转录页，迟到 ID 不会把用户拉回编辑器', async () => {
    type DraftResponse = Awaited<ReturnType<typeof broadcastApi.createDraft>>;
    let resolveDraft!: (value: DraftResponse) => void;
    const pendingDraft = new Promise<DraftResponse>((resolve) => { resolveDraft = resolve; });
    const requestSpy = vi.spyOn(broadcastApi, 'createDraft')
      .mockReturnValue(pendingDraft);
    useStore.setState({
      createEditorDraft: realCreateEditorDraft,
      cancelEditorDraftCreation: realCancelEditorDraftCreation,
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '导入临时稿' }));
    await waitFor(() => expect(requestSpy).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '离开转录页' }));
    expect(screen.getByText('/other')).not.toBeNull();

    resolveDraft({
      data: {
        broadcast: draft,
        voiceConfig: {
          voiceType: '',
          voice: '',
          voiceDesign: '',
          voiceClone: '',
          stylePrompt: '',
          optimizeTextPreview: false,
          speed: null,
          emotion: null,
          pitch: null,
        },
        sourceRevisionContext: null,
        segments: [],
        splitInProgress: false,
      },
    } as DraftResponse);
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByText('/other')).not.toBeNull();
    expect(screen.queryByText('/editor/73')).toBeNull();
    requestSpy.mockRestore();
  });
});
