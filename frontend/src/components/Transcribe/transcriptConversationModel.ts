import type { TranscriptSpeaker, TranscriptTurn } from '../../store';

export interface TranscriptSpeakerTone {
  badge: string;
  border: string;
  mutedBorder: string;
  surface: string;
  strongSurface: string;
}

const SPEAKER_TONES: TranscriptSpeakerTone[] = [
  {
    badge: 'bg-blush/45',
    border: 'border-l-blush',
    mutedBorder: 'border-blush/45',
    surface: 'bg-blush/10',
    strongSurface: 'bg-blush/20',
  },
  {
    badge: 'bg-lilac/45',
    border: 'border-l-lilac',
    mutedBorder: 'border-lilac/55',
    surface: 'bg-lilac/10',
    strongSurface: 'bg-lilac/20',
  },
  {
    badge: 'bg-sage/45',
    border: 'border-l-sage',
    mutedBorder: 'border-sage/55',
    surface: 'bg-sage/10',
    strongSurface: 'bg-sage/20',
  },
  {
    badge: 'bg-lemon/35',
    border: 'border-l-lemon',
    mutedBorder: 'border-lemon/55',
    surface: 'bg-lemon/10',
    strongSurface: 'bg-lemon/20',
  },
];

export function getTranscriptSpeakerTone(index: number): TranscriptSpeakerTone {
  return SPEAKER_TONES[Math.abs(index) % SPEAKER_TONES.length];
}

export function getTranscriptSpeakerInitial(displayName: string, speakerKey: string): string {
  const value = displayName.trim() || speakerKey.trim();
  const latinInitial = value.match(/[A-Za-z0-9]/)?.[0];
  return latinInitial ? latinInitial.toUpperCase() : value.slice(0, 1) || '?';
}

export function createTranscriptSpeakerIndexes(speakers: TranscriptSpeaker[]): Map<string, number> {
  return new Map(speakers.map((speaker, index) => [speaker.speaker_key, index]));
}

export function filterTranscriptConversationTurns(
  turns: TranscriptTurn[],
  speakerNames: Map<string, string>,
  query: string,
  speakerKey: string | null,
): TranscriptTurn[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  return turns.filter((turn) => {
    if (speakerKey && turn.speaker_key !== speakerKey) return false;
    if (!normalizedQuery) return true;
    const displayText = turn.corrected_text || turn.text;
    const speakerName = speakerNames.get(turn.speaker_key) || turn.speaker_key;
    return `${speakerName} ${displayText}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery);
  });
}
