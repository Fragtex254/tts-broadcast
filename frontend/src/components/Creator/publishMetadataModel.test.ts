import { describe, expect, test } from 'vitest';
import type { Broadcast } from '../../store';
import { getBroadcastPublishMetadata } from './publishMetadataModel';

const broadcast: Broadcast = {
  id: 1, title: '原始标题', content: '正文', audio_path: null, duration: null,
  voice_type: null, voice_config: null, source_items: null, status: 'pending', saved: 0,
  mode: 'whole', template_id: null, template_snapshot: '{}', publish_metadata: '{}',
  created_at: '', updated_at: '',
};

describe('发布信息模型', () => {
  test('空发布信息回退到播报标题', () => {
    expect(getBroadcastPublishMetadata(broadcast).primaryTitle).toBe('原始标题');
  });
});
