import { createHash } from 'node:crypto';
import { access, chmod, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const binaryPath = path.join(projectRoot, 'bin', binaryName);

await mkdir(path.dirname(binaryPath), { recursive: true });

try {
  await access(binaryPath, constants.X_OK);
  console.log(`yt-dlp is ready at ${binaryPath}`);
} catch {
  console.log('Downloading the latest yt-dlp binary…');
  const release = await fetchJson('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest');
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

  await writeFile(binaryPath, binary, { mode: 0o755 });
  if (process.platform !== 'win32') {
    await chmod(binaryPath, 0o755);
  }
  console.log(`yt-dlp installed at ${binaryPath}`);
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
