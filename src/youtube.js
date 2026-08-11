import { spawn } from 'node:child_process';
import path from 'node:path';
import { access, mkdir, readdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { ffmpegBinaryPath, presets, tempRoot, ytDlpPath } from './config.js';

const MAX_METADATA_BYTES = 6 * 1024 * 1024;
const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export function normalizeYouTubeUrl(input) {
  if (typeof input !== 'string' || input.trim().length > 2_048) {
    throw new UserError('Paste a valid YouTube link.');
  }

  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw new UserError('That does not look like a valid URL.');
  }

  if (!['https:', 'http:'].includes(url.protocol) || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new UserError('Only youtube.com and youtu.be links are supported.');
  }

  url.protocol = 'https:';
  url.username = '';
  url.password = '';
  url.hash = '';
  return url.toString();
}

export function getPreset(presetId) {
  const preset = presets[presetId];
  if (!preset) {
    throw new UserError('Choose one of the available download formats.');
  }
  return preset;
}

export async function checkDependencies() {
  const checks = await Promise.allSettled([
    access(ytDlpPath, constants.X_OK),
    access(ffmpegBinaryPath, constants.X_OK),
  ]);
  return {
    ytDlp: checks[0].status === 'fulfilled',
    ffmpeg: checks[1].status === 'fulfilled',
  };
}

export async function getVideoPreview(rawUrl) {
  const url = normalizeYouTubeUrl(rawUrl);
  const output = await runCapture([
    '--dump-single-json',
    '--skip-download',
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout',
    '20',
    url,
  ], 45_000);

  let metadata;
  try {
    metadata = JSON.parse(output);
  } catch {
    throw new UserError('YouTube returned an unexpected response. Try another link.');
  }

  if (metadata.is_live) {
    throw new UserError('Live streams are not supported yet.');
  }

  return {
    id: String(metadata.id || ''),
    title: String(metadata.title || 'Untitled video').slice(0, 300),
    channel: String(metadata.channel || metadata.uploader || 'Unknown channel').slice(0, 160),
    thumbnail: safeThumbnail(metadata.thumbnail),
    duration: Number.isFinite(metadata.duration) ? metadata.duration : null,
    durationLabel: formatDuration(metadata.duration),
    viewCount: Number.isFinite(metadata.view_count) ? metadata.view_count : null,
    viewCountLabel: formatCount(metadata.view_count),
    uploadDate: formatUploadDate(metadata.upload_date),
    webpageUrl: normalizeYouTubeUrl(metadata.webpage_url || url),
  };
}

export function startYtDlpDownload({ url: rawUrl, presetId, outputDir, onProgress }) {
  const url = normalizeYouTubeUrl(rawUrl);
  const preset = getPreset(presetId);
  const outputTemplate = path.join(outputDir, '%(title).120B [%(id)s].%(ext)s');
  const args = [
    '--no-playlist',
    '--newline',
    '--no-warnings',
    '--restrict-filenames',
    '--max-filesize',
    '500M',
    '--match-filter',
    'duration <= 7200 & !is_live',
    '--socket-timeout',
    '20',
    '--retries',
    '3',
    '--ffmpeg-location',
    ffmpegBinaryPath,
    '--progress-template',
    'download:PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--print',
    'after_move:FILE:%(filepath)s',
    '-f',
    preset.selector,
    '-o',
    outputTemplate,
  ];

  if (preset.kind === 'audio') {
    args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    args.push('--merge-output-format', 'mp4', '--remux-video', 'mp4');
  }
  args.push(url);

  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath, args, { windowsHide: true });
    let stdoutBuffer = '';
    let stderr = '';
    let reportedPath = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('PROGRESS:')) {
          const [percent, speed, eta] = line.slice(9).split('|').map((value) => value.trim());
          onProgress?.({
            percent: clampPercent(percent),
            speed: cleanProgressValue(speed),
            eta: cleanProgressValue(eta),
          });
        } else if (line.startsWith('FILE:')) {
          reportedPath = line.slice(5).trim();
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8_000);
    });

    child.on('error', (error) => reject(error));
    child.on('close', async (code) => {
      if (code !== 0) {
        reject(new UserError(friendlyYtDlpError(stderr), 422));
        return;
      }

      try {
        const files = await readdir(outputDir);
        const fallback = files.find((file) => !file.endsWith('.part') && !file.endsWith('.ytdl'));
        const filePath = reportedPath || (fallback ? path.join(outputDir, fallback) : '');
        if (!filePath) throw new Error('No completed output file was found.');
        resolve({ filePath, filename: path.basename(filePath) });
      } catch (error) {
        reject(error);
      }
    });
  });
}

export async function makeJobDirectory(jobId) {
  const directory = path.join(tempRoot, jobId);
  await mkdir(directory, { recursive: true });
  return directory;
}

export async function removeJobDirectory(directory) {
  if (directory && path.dirname(directory) === tempRoot) {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runCapture(args, timeoutMs) {
  await access(ytDlpPath, constants.X_OK).catch(() => {
    throw new UserError('The downloader is not installed. Run npm install and try again.', 503);
  });

  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > MAX_METADATA_BYTES) child.kill('SIGKILL');
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8_000);
    });
    child.on('error', (error) => {
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code, signal) => {
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolve(stdout);
      else if (signal === 'SIGKILL') reject(new UserError('YouTube took too long to respond. Try again.'));
      else reject(new UserError(friendlyYtDlpError(stderr), 422));
    });
  });
}

function friendlyYtDlpError(rawError = '') {
  const error = rawError.toLowerCase();
  if (error.includes('private video')) return 'That video is private.';
  if (error.includes('sign in') || error.includes('age-restricted')) return 'That video requires sign-in and cannot be downloaded here.';
  if (error.includes('copyright')) return 'That video is unavailable because of a copyright restriction.';
  if (error.includes('not available') || error.includes('unavailable')) return 'That video is not available in this region or has been removed.';
  if (error.includes('larger than max-filesize') || error.includes('max-filesize')) return 'That file is larger than the 500 MB project limit.';
  if (error.includes('does not pass filter')) return 'Live streams and videos over two hours are not supported.';
  if (error.includes('requested format is not available')) return 'That quality is not available for this video. Try another format.';
  return 'The video could not be processed. It may be restricted or temporarily unavailable.';
}

function safeThumbnail(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function formatDuration(value) {
  if (!Number.isFinite(value)) return 'Unknown length';
  const seconds = Math.max(0, Math.round(value));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function formatCount(value) {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatUploadDate(value) {
  if (!/^\d{8}$/.test(String(value || ''))) return '';
  const text = String(value);
  const date = new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00Z`);
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function clampPercent(value) {
  const parsed = Number.parseFloat(String(value || '').replace('%', ''));
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
}

function cleanProgressValue(value) {
  return value && value !== 'NA' ? value : '';
}

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'UserError';
    this.status = status;
  }
}
