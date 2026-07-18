import type { ProjectEditorContext } from '../store';

export type ParsedProjectEditorContext =
  | { kind: 'legacy' }
  | { kind: 'invalid' }
  | { kind: 'project'; projectId: number; artifactId: number; revisionId: number };

const parsePositiveInteger = (value: string | null): number | null => {
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

export function parseProjectEditorContext(searchParams: URLSearchParams): ParsedProjectEditorContext {
  const projectParam = searchParams.get('projectId');
  const artifactParam = searchParams.get('artifactId');
  const revisionParam = searchParams.get('revisionId');
  if (projectParam === null && artifactParam === null && revisionParam === null) {
    return { kind: 'legacy' };
  }

  const projectId = parsePositiveInteger(projectParam);
  const artifactId = parsePositiveInteger(artifactParam);
  const revisionId = parsePositiveInteger(revisionParam);
  if (!projectId || !artifactId || !revisionId) return { kind: 'invalid' };
  return { kind: 'project', projectId, artifactId, revisionId };
}

export function getProjectEditorUrl(context: ProjectEditorContext): string {
  return `/editor?projectId=${context.projectId}&artifactId=${context.artifactId}&revisionId=${context.revision.id}`;
}
