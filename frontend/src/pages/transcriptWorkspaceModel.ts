import type { TranscriptSpeaker } from '../store';

export function formatTranscriptTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

export function createSpeakerNameMap(speakers: TranscriptSpeaker[]): Map<string, string> {
  return new Map(speakers.map((speaker) => [speaker.speaker_key, speaker.display_name]));
}
