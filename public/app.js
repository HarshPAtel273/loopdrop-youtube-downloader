const form = document.querySelector('#url-form');
const urlInput = document.querySelector('#video-url');
const pasteButton = document.querySelector('#paste-button');
const fetchButton = document.querySelector('#fetch-button');
const errorBox = document.querySelector('#form-error');
const resultSection = document.querySelector('#video-result');
const downloadButton = document.querySelector('#download-button');
const progressPanel = document.querySelector('#progress-panel');
const historyList = document.querySelector('#history-list');
const emptyHistory = document.querySelector('#empty-history');
const clearHistoryButton = document.querySelector('#clear-history');
const toast = document.querySelector('#toast');

const state = { video: null, url: '', polling: false };
const HISTORY_KEY = 'loopdrop-history-v1';

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return showError('Paste a YouTube link to get started.');

  setFetching(true);
  hideError();
  resultSection.hidden = true;
  try {
    const data = await api('/api/preview', { method: 'POST', body: { url } });
    state.video = data.video;
    state.url = data.video.webpageUrl || url;
    renderVideo(data.video);
    resultSection.hidden = false;
    progressPanel.hidden = true;
    downloadButton.hidden = false;
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    showError(error.message);
  } finally {
    setFetching(false);
  }
});

pasteButton.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    urlInput.value = text.trim();
    urlInput.focus();
    showToast('Link pasted');
  } catch {
    urlInput.focus();
    showToast('Use ⌘V or Ctrl+V to paste');
  }
});

document.querySelectorAll('input[name="preset"]').forEach((input) => {
  input.addEventListener('change', () => {
    document.querySelectorAll('.format-option').forEach((option) => option.classList.remove('selected'));
    input.closest('.format-option').classList.add('selected');
  });
});

downloadButton.addEventListener('click', async () => {
  if (!state.video || state.polling) return;
  const preset = document.querySelector('input[name="preset"]:checked').value;
  state.polling = true;
  downloadButton.disabled = true;
  downloadButton.querySelector('span').textContent = 'Starting…';
  progressPanel.hidden = false;
  updateProgress({ progress: 0, status: 'queued' });

  try {
    const data = await api('/api/downloads', {
      method: 'POST',
      body: { url: state.url, preset, title: state.video.title },
    });
    await pollDownload(data.job.id);
  } catch (error) {
    progressPanel.hidden = true;
    showError(error.message);
  } finally {
    state.polling = false;
    downloadButton.disabled = false;
    downloadButton.querySelector('span').textContent = 'Download now';
  }
});

clearHistoryButton.addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showToast('History cleared');
});

async function pollDownload(jobId) {
  while (true) {
    const { job } = await api(`/api/downloads/${jobId}`);
    updateProgress(job);
    if (job.status === 'ready') {
      addHistory({ title: state.video.title, format: job.preset.detail, completedAt: new Date().toISOString() });
      showToast('Your download is ready');
      window.location.assign(`/api/downloads/${jobId}/file`);
      return;
    }
    if (job.status === 'error') throw new Error(job.error || 'The download failed.');
    await wait(800);
  }
}

function renderVideo(video) {
  const thumbnail = document.querySelector('#video-thumbnail');
  thumbnail.src = video.thumbnail || thumbnailPlaceholder();
  thumbnail.alt = `Thumbnail for ${video.title}`;
  document.querySelector('#video-duration').textContent = video.durationLabel;
  document.querySelector('#video-channel').textContent = video.channel;
  document.querySelector('#video-title').textContent = video.title;
  const stats = [video.viewCountLabel ? `${video.viewCountLabel} views` : '', video.uploadDate].filter(Boolean);
  document.querySelector('#video-stats').textContent = stats.join('  ·  ');
}

function updateProgress(job) {
  const percent = Math.round(job.progress || 0);
  document.querySelector('#progress-percent').textContent = `${percent}%`;
  document.querySelector('#progress-bar').style.width = `${percent}%`;
  const statusText = job.status === 'ready' ? 'Ready — sending to Downloads' : job.status === 'queued' ? 'Getting things ready…' : 'Downloading your file…';
  document.querySelector('#progress-status').textContent = statusText;
  const details = [job.speed, job.eta ? `${job.eta} remaining` : ''].filter(Boolean);
  document.querySelector('#progress-detail').textContent = details.join(' · ') || 'This can take a moment for longer videos.';
}

function addHistory(item) {
  const history = readHistory();
  history.unshift(item);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 6)));
  renderHistory();
}

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function renderHistory() {
  const history = readHistory();
  historyList.replaceChildren();
  emptyHistory.hidden = history.length > 0;
  clearHistoryButton.hidden = history.length === 0;
  history.forEach((item, index) => {
    const row = document.createElement('article');
    row.className = 'history-item';
    const number = document.createElement('span');
    number.className = 'history-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.title || 'Untitled video';
    const detail = document.createElement('small');
    const date = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(item.completedAt));
    detail.textContent = `${item.format} · ${date}`;
    content.append(title, detail);
    const check = document.createElement('span');
    check.className = 'history-check';
    check.textContent = '✓ Saved';
    row.append(number, content, check);
    historyList.append(row);
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

function setFetching(loading) {
  fetchButton.disabled = loading;
  fetchButton.querySelector('span').textContent = loading ? 'Finding video…' : 'Fetch video';
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2_300);
}

function thumbnailPlaceholder() {
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#171713"/><circle cx="320" cy="180" r="60" fill="#f15236"/><path d="m302 145 56 35-56 35z" fill="#fffaf0"/></svg>`);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

renderHistory();
