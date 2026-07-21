export interface BilibiliVideoReference {
  idType: 'bvid' | 'aid';
  id: string;
  page: number;
  initialSeconds: number;
}

const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;
const AV_PATH_PATTERN = /^av([1-9][0-9]*)$/i;

function positiveInteger(value: string | null, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeSeconds(value: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export function parseBilibiliVideoUrl(sourceUrl: string): BilibiliVideoReference | null {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const hostname = url.hostname.toLowerCase();
  if (hostname !== 'bilibili.com' && !hostname.endsWith('.bilibili.com')) return null;

  const page = positiveInteger(url.searchParams.get('p'), 1);
  const initialSeconds = nonNegativeSeconds(url.searchParams.get('t'));
  const isOfficialPlayerUrl = hostname === 'player.bilibili.com' && url.pathname.startsWith('/player');
  if (isOfficialPlayerUrl) {
    const queryBvid = url.searchParams.get('bvid') || '';
    if (BVID_PATTERN.test(queryBvid)) {
      return { idType: 'bvid', id: queryBvid, page, initialSeconds };
    }

    const queryAid = url.searchParams.get('aid') || '';
    if (/^[1-9][0-9]*$/.test(queryAid)) {
      return { idType: 'aid', id: queryAid, page, initialSeconds };
    }
  }

  const pathParts = url.pathname.split('/').filter(Boolean);
  const videoIndex = pathParts.findIndex((part) => part.toLowerCase() === 'video');
  const videoId = videoIndex >= 0 ? pathParts[videoIndex + 1] || '' : '';
  if (BVID_PATTERN.test(videoId)) {
    return { idType: 'bvid', id: videoId, page, initialSeconds };
  }
  const avMatch = videoId.match(AV_PATH_PATTERN);
  if (avMatch) {
    return { idType: 'aid', id: avMatch[1], page, initialSeconds };
  }
  return null;
}

export function buildBilibiliPlayerUrl(
  video: BilibiliVideoReference,
  seekSeconds: number,
  shouldAutoplay: boolean,
): string {
  const url = new URL('https://player.bilibili.com/player.html');
  url.searchParams.set(video.idType, video.id);
  url.searchParams.set('p', String(video.page));
  url.searchParams.set('danmaku', '0');
  url.searchParams.set('autoplay', shouldAutoplay ? '1' : '0');
  const safeSeconds = Number.isFinite(seekSeconds) ? Math.max(0, Math.floor(seekSeconds)) : 0;
  if (safeSeconds > 0) url.searchParams.set('t', String(safeSeconds));
  return url.toString();
}

export function bilibiliVideoKey(video: BilibiliVideoReference): string {
  return `${video.idType}:${video.id}:p${video.page}`;
}
