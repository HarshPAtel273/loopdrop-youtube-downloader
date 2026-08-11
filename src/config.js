import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const publicDir = path.join(projectRoot, 'public');
export const ytDlpPath = path.join(
  projectRoot,
  'bin',
  process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
);
export const tempRoot = path.join(os.tmpdir(), 'loopdrop-downloads');
export const ffmpegBinaryPath = ffmpegPath;
export const port = Number.parseInt(process.env.PORT || '4173', 10);

export const presets = Object.freeze({
  '1080p': {
    id: '1080p',
    label: 'Full HD',
    detail: '1080p · MP4',
    selector: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    kind: 'video',
  },
  '720p': {
    id: '720p',
    label: 'HD',
    detail: '720p · MP4',
    selector: 'bestvideo[height<=720]+bestaudio/best[height<=720]',
    kind: 'video',
  },
  '480p': {
    id: '480p',
    label: 'Data saver',
    detail: '480p · MP4',
    selector: 'bestvideo[height<=480]+bestaudio/best[height<=480]',
    kind: 'video',
  },
  mp3: {
    id: 'mp3',
    label: 'Audio only',
    detail: 'Best audio · MP3',
    selector: 'bestaudio/best',
    kind: 'audio',
  },
});
