import type { Broadcast, PublishMetadata } from '../../store';

export const EMPTY_PUBLISH_METADATA: PublishMetadata = {
  primaryTitle: '',
  alternativeTitles: [],
  summary: '',
  publishCopy: '',
  tags: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getBroadcastPublishMetadata(broadcast: Broadcast): PublishMetadata {
  try {
    const value: unknown = JSON.parse(broadcast.publish_metadata || '{}');
    if (!isRecord(value)) return { ...EMPTY_PUBLISH_METADATA, primaryTitle: broadcast.title };
    const record = value;
    return {
      primaryTitle: typeof record.primaryTitle === 'string' ? record.primaryTitle : broadcast.title,
      alternativeTitles: Array.isArray(record.alternativeTitles) ? record.alternativeTitles.filter((item): item is string => typeof item === 'string') : [],
      summary: typeof record.summary === 'string' ? record.summary : '',
      publishCopy: typeof record.publishCopy === 'string' ? record.publishCopy : '',
      tags: Array.isArray(record.tags) ? record.tags.filter((item): item is string => typeof item === 'string') : [],
    };
  } catch {
    return { ...EMPTY_PUBLISH_METADATA, primaryTitle: broadcast.title };
  }
}
