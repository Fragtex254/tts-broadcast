import JSZip from 'jszip';
import type { PublishPackage } from '../store/types';

export function sanitizePublishFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'publish-package';
}

export async function createPublishZip(data: PublishPackage, audioBlob: Blob): Promise<Blob> {
  const title = sanitizePublishFileName(data.metadata.primaryTitle);
  const zip = new JSZip();
  const root = zip.folder(title);
  if (!root) throw new Error('创建发布包目录失败');

  root.file(`audio/${title}.mp3`, audioBlob);
  root.file(`scripts/${title}.md`, data.scriptMarkdown);
  root.file(`scripts/${title}.txt`, data.scriptText);
  root.file('publish/发布文案.md', data.publishMarkdown);
  root.file('publish/标题备选.txt', [data.metadata.primaryTitle, ...data.metadata.alternativeTitles].join('\n'));
  root.file('publish/标签.txt', data.metadata.tags.map((tag) => `#${tag}`).join(' '));
  root.file('manifest.json', JSON.stringify({ metadata: data.metadata, template: data.template }, null, 2));
  if (data.srt) root.file(`subtitles/${title}.srt`, data.srt);
  if (data.vtt) root.file(`subtitles/${title}.vtt`, data.vtt);

  return zip.generateAsync({ type: 'blob' });
}
