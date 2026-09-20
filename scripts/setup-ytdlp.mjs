import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const binaryPath = path.join(projectRoot, 'bin', binaryName);

await mkdir(path.dirname(binaryPath), { recursive: true });

const installedVersion = await getInstalledVersion();
try {
  const release = await fetchJson('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest');
  if (installedVersion === release.tag_name) {
    console.log(`yt-dlp ${installedVersion} is up to date.`);
  } else {
    console.log(`Installing yt-dlp ${release.tag_name}${installedVersion ? ` (replacing ${installedVersion})` : ''}…`);
    await installRelease(release);
    console.log(`yt-dlp ${release.tag_name} installed at ${binaryPath}`);
  }
} catch (error) {
  if (!installedVersion) throw error;
  console.warn(`Could not update yt-dlp: ${error.message}. Keeping ${installedVersion}; run npm run update:downloader later.`);
}

async function getInstalledVersion() {
  try {
    await access(binaryPath, constants.X_OK);
    const { stdout } = await execFileAsync(binaryPath, ['--version'], { timeout: 30_000 });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function installRelease(release) {
  const assetName = getAssetName();
  const asset = release.assets.find((item) => item.name === assetName);
  const checksumsAsset = release.assets.find((item) => item.name === 'SHA2-256SUMS');
  if (!asset || !checksumsAsset) throw new Error(`No compatible yt-dlp release asset was found for ${process.platform}/${process.arch}.`);

  const [binary, checksumText] = await Promise.all([
    fetchBuffer(asset.browser_download_url),
    fetchText(checksumsAsset.browser_download_url),
  ]);
  const checksumLine = checksumText.split(/\r?\n/).find((line) => line.trim().endsWith(`  ${assetName}`));
  const expected = checksumLine?.trim().split(/\s+/)[0];
  const actual = createHash('sha256').update(binary).digest('hex');
  if (!expected || actual !== expected) throw new Error('The downloaded yt-dlp checksum did not match the published release.');

  const temporaryPath = `${binaryPath}.download-${process.pid}`;
  try {
    await writeFile(temporaryPath, binary, { mode: 0o755 });
    if (process.platform !== 'win32') await chmod(temporaryPath, 0o755);
    await rename(temporaryPath, binaryPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function getAssetName() {
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  if (process.platform === 'win32') return process.arch === 'arm64' ? 'yt-dlp_arm64.exe' : 'yt-dlp.exe';
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
  throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'loopdrop-setup' } });
  if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status}).`);
  return response.json();
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'loopdrop-setup' } });
  if (!response.ok) throw new Error(`yt-dlp download failed (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'loopdrop-setup' } });
  if (!response.ok) throw new Error(`yt-dlp checksum download failed (${response.status}).`);
  return response.text();
}
