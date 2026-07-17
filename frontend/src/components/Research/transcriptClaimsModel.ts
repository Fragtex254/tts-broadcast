import type { TranscriptClaim } from '../../store';

export function sortTranscriptClaims(claims: TranscriptClaim[], sort: 'value' | 'time'): TranscriptClaim[] {
  return [...claims].sort((left, right) => {
    if (left.is_starred !== right.is_starred) return left.is_starred ? -1 : 1;
    return sort === 'value'
      ? right.content_value - left.content_value
      : left.start_seconds - right.start_seconds;
  });
}
