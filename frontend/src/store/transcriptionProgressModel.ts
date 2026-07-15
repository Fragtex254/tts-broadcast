import type { TranscriptionChunkPreview } from './types';

interface ProgressTextUpdate {
  current?: number;
  text?: string;
  chunkText?: string;
  chunks?: TranscriptionChunkPreview[];
}

export function mergeTranscriptionText(currentText: string, nextText?: string): string {
  const normalized = nextText?.trim();
  return normalized ? normalized : currentText;
}

export function mergeTranscriptionChunk(
  chunks: TranscriptionChunkPreview[],
  update: ProgressTextUpdate,
): TranscriptionChunkPreview[] {
  if (update.chunks && update.chunks.length > 0) {
    return update.chunks
      .filter((chunk) => Number.isInteger(chunk.index) && chunk.index > 0 && chunk.text.trim())
      .map((chunk) => ({ index: chunk.index, text: chunk.text.trim() }))
      .sort((left, right) => left.index - right.index);
  }

  const text = update.chunkText?.trim();
  if (!text) return chunks;

  const index = update.current && update.current > 0 ? update.current : chunks.length + 1;
  const existingIndex = chunks.findIndex((chunk) => chunk.index === index);
  if (existingIndex < 0) {
    return [...chunks, { index, text }].sort((left, right) => left.index - right.index);
  }
  if (chunks[existingIndex].text === text) return chunks;

  return chunks.map((chunk) => chunk.index === index ? { ...chunk, text } : chunk);
}
