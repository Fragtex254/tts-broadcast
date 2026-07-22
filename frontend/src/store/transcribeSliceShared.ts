import { transcribeApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import { safeParseStrict, TranscriptionStatsResponseSchema } from '../services/schemas';
import type { TranscribeOptions, TranscriptionRecord } from './types';
import type { StoreSet } from './storeTypes';

const logger = createScopedLogger('transcribe-slice');

export function createTranscriptionTaskId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `transcribe-${crypto.randomUUID()}`;
  }
  return `transcribe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function appendTranscribeOptions(formData: FormData, options?: TranscribeOptions): void {
  if (options?.asrEngine) {
    formData.append('asrEngine', options.asrEngine);
  }
  if (options?.asrModel?.trim()) {
    formData.append('asrModel', options.asrModel.trim());
  }
  if (options?.context?.trim()) {
    formData.append('context', options.context.trim());
  }
  if (options?.contentMode) {
    formData.append('contentMode', options.contentMode);
  }
}

export function upsertTranscriptionHistory(
  history: TranscriptionRecord[],
  record: TranscriptionRecord
): TranscriptionRecord[] {
  return [record, ...history.filter((item) => item.id !== record.id)];
}

export async function refreshTranscriptionStats(set: StoreSet): Promise<void> {
  try {
    const response = await transcribeApi.getStats();
    const data = safeParseStrict(TranscriptionStatsResponseSchema, response.data);
    set({ transcriptionStats: data.stats });
  } catch (error) {
    logger.error({ err: toLogError(error) }, '刷新转录统计失败');
  }
}
