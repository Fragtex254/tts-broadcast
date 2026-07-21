import { createTranscribeBatchSlice } from './transcribeBatchSlice';
import { createTranscribeResultsSlice } from './transcribeResultsSlice';
import { createTranscribeTaskSlice } from './transcribeTaskSlice';
import type { StoreSet } from './storeTypes';

/**
 * Backwards-compatible aggregate for callers that still import the former
 * monolithic transcribe slice. The application store composes the three domain
 * slices directly in index.ts.
 */
export function createTranscribeSlice(set: StoreSet) {
  return {
    ...createTranscribeTaskSlice(set),
    ...createTranscribeBatchSlice(set),
    ...createTranscribeResultsSlice(set),
  };
}
