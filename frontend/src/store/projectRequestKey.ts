import type { ContentCreationOperation, ContentCreatorInputKey } from './types';

// 与后端 contentCreationContext.PROMPT_VERSION 锁定；升级时必须同时变更。
export const CONTENT_CREATION_PROMPT_VERSION = 'evidence-creation-v2';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const item = (value as Record<string, unknown>)[key];
        if (item !== undefined) result[key] = canonicalize(item);
        return result;
      }, {});
  }
  return value;
}

function hashText(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 同一次逻辑写入在超时、刷新或多标签页重试时产生相同键。
 * 输入变化会产生新键，避免把不同写入错误合并。
 */
export function createStableProjectRequestKey(scope: string, input: unknown): string {
  const serialized = JSON.stringify(canonicalize(input));
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 96);
  return `${safeScope}-${hashText(serialized, 2166136261)}${hashText(serialized, 3339675911)}`;
}

export function normalizeCreationJobInput(input: {
  operation: ContentCreationOperation;
  sourceIds?: number[];
  evidenceIds?: number[];
  outlineRevisionId?: number;
  creatorInputKeys?: ContentCreatorInputKey[];
}) {
  return {
    operation: input.operation,
    sourceIds: input.sourceIds ? [...new Set(input.sourceIds)].sort((a, b) => a - b) : undefined,
    evidenceIds: input.evidenceIds ? [...new Set(input.evidenceIds)].sort((a, b) => a - b) : undefined,
    outlineRevisionId: input.outlineRevisionId,
    creatorInputKeys: input.creatorInputKeys ? [...new Set(input.creatorInputKeys)].sort() : undefined,
  };
}
