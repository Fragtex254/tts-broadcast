import type { ContentRevisionCitation } from '../../store';

export interface ProjectPresentationExport {
  content: string;
  isReady: boolean;
  error: string | null;
}

const INTERNAL_MARKER_PATTERN = /\[证据#\d+\]/g;

function referenceMarkdown(index: number, citation: ContentRevisionCitation): string {
  const sourceTitle = citation.source_title
    .replace(INTERNAL_MARKER_PATTERN, '[原文标记已隐藏]')
    .replace(/\s+/g, ' ')
    .trim() || '未命名来源';
  const excerpt = citation.excerpt
    .replace(INTERNAL_MARKER_PATTERN, '[原文标记已隐藏]')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return `${index}. **${sourceTitle}**\n\n${excerpt}`;
}

/**
 * 将持久化 Revision 中的内部证据标记转换为面向读者的引用编号。
 * 这里只生成展示副本，绝不修改不可变 Revision 正文或 Citation 快照。
 */
export function createProjectPresentationExport(
  content: string,
  citations: ContentRevisionCitation[]
): ProjectPresentationExport {
  const markers = content.match(INTERNAL_MARKER_PATTERN) || [];
  if (markers.length === 0) return { content, isReady: true, error: null };

  const citationByMarker = new Map<string, ContentRevisionCitation>();
  citations.forEach((citation) => {
    if (!citationByMarker.has(citation.marker)) citationByMarker.set(citation.marker, citation);
  });

  const orderedMarkers = [...new Set(markers)];
  const missingMarkers = orderedMarkers.filter((marker) => !citationByMarker.has(marker));
  if (missingMarkers.length > 0) {
    return {
      content,
      isReady: false,
      error: `引用快照不完整（${missingMarkers.join('、')}），请先核验并保存新版本。`,
    };
  }

  const referenceNumberByMarker = new Map(
    orderedMarkers.map((marker, index) => [marker, index + 1])
  );
  const presentationBody = content.replace(INTERNAL_MARKER_PATTERN, (marker) => (
    `[引用 ${referenceNumberByMarker.get(marker)}]`
  ));
  const references = orderedMarkers.map((marker, index) => {
    const citation = citationByMarker.get(marker);
    return citation ? referenceMarkdown(index + 1, citation) : '';
  });

  return {
    content: `${presentationBody}\n\n## 参考依据（材料快照，未核验）\n\n${references.join('\n\n')}`,
    isReady: true,
    error: null,
  };
}
