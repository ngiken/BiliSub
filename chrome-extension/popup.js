const appState = {
  video: null,
  subtitles: null,
};

const FALLBACK_TEXT = Object.freeze({
  extensionName: 'BiliSub',
  headerSubtitle: 'Bilibili CC subtitle exporter',
  loading: 'Reading the current video...',
  notBili: 'Open a bilibili.com video page before using BiliSub.',
  unknownTitle: 'Untitled video',
  unknownDuration: '--:--',
  fetchButton: 'Extract subtitles',
  progressStart: 'Preparing subtitle extraction',
  progressVideo: 'Reading video information',
  progressTracks: 'Fetching subtitle tracks',
  progressDone: 'Subtitles are ready',
  videoInfoDone: 'Video information loaded',
  tracksFound: 'Found {count} subtitle tracks',
  subtitleCount: '{count} subtitles',
  noSubtitle: 'This video has no downloadable CC subtitles yet. Check whether subtitles are visible on the page, or sign in to Bilibili and try again.',
  loginRequired: "This video's subtitles require a Bilibili sign-in. Sign in with the current browser and try again.",
  errorPrefix: 'Failed: ',
  downloaded: 'Saved',
  previewLabel: 'Subtitle preview',
  backButton: 'Back',
  footerFormats: 'TXT / SRT',
  currentPageNotVideo: 'The current page is not a Bilibili video page.',
  backgroundNoResponse: 'The extension background did not return a result. Reopen the extension and try again.',
  subtitleApiFailed: 'The subtitle API request failed.',
  subtitleFileFailed: 'Subtitle file download failed: HTTP {status}',
});

const STATE_IDS = Object.freeze({
  loading: 'stateLoading',
  notbili: 'stateNotBili',
  ready: 'stateReady',
  extracting: 'stateExtracting',
  results: 'stateResults',
  nosub: 'stateNoSub',
  error: 'stateError',
});

document.addEventListener('DOMContentLoaded', async () => {
  applyStaticText();
  document.getElementById('fetchBtn')?.addEventListener('click', fetchSubtitles);
  document.querySelectorAll('.btn-back').forEach((button) => {
    button.addEventListener('click', () => showState('ready'));
  });

  await initActiveTab();
});

if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.onActivated.addListener(() => initActiveTab());
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'complete' && !changeInfo.url) return;
    chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
      if (activeTab?.id === tabId) initActiveTab();
    });
  });
}

async function initActiveTab() {
  showState('loading');
  setText('loadingText', t('loading'));
  appState.video = null;
  appState.subtitles = null;

  try {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      showState('notbili');
      return;
    }

    const tab = await getActiveTab();
    if (!isBilibiliVideo(tab?.url)) {
      showState('notbili');
      return;
    }

    const video = await getVideoInfoFromTab(tab);
    appState.video = video;
    populateVideoCard(video);
    showState('ready');

    if (!video.aid || !video.cid) {
      hydrateVideoDetail(video.bvid);
    }
  } catch (error) {
    showError(error);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function isBilibiliVideo(url) {
  return /bilibili\.com\/video\/BV[0-9A-Za-z]{10}/.test(url || '');
}

async function getVideoInfoFromTab(tab) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_INFO' });
    if (response?.success && response.data) return response.data;
  } catch (error) {
    console.warn('[BiliSub] Unable to read page state, falling back to URL.', error);
  }

  const match = tab.url.match(/BV[0-9A-Za-z]{10}/);
  if (!match) throw new Error(t('currentPageNotVideo'));
  return {
    bvid: match[0],
    title: cleanTitle(tab.title) || t('unknownTitle'),
    aid: null,
    cid: null,
    pages: [],
    currentP: 1,
  };
}

async function hydrateVideoDetail(bvid) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'FETCH_VIDEO_DETAIL', bvid });
    if (!response?.success || !response.data || appState.video?.bvid !== bvid) return;

    appState.video = {
      ...appState.video,
      aid: response.data.aid,
      cid: response.data.cid,
      title: response.data.title || appState.video.title,
      pages: response.data.pages || appState.video.pages,
    };
    populateVideoCard(appState.video);
  } catch (error) {
    console.warn('[BiliSub] Video detail fallback failed.', error);
  }
}

function populateVideoCard(info) {
  setText('videoTitle', info.title || t('unknownTitle'));
  setText('bvidTag', info.bvid || 'BV...');
  setText('durationTag', formatDuration(info.pages?.[0]?.duration));
}

async function fetchSubtitles() {
  if (!appState.video) return;

  showState('extracting');
  updateProgress(5, t('progressStart'));
  setStep(1, t('progressVideo'), 'active');
  setStep(2, t('progressTracks'));
  setStep(3, t('progressDone'));

  try {
    const tab = await getActiveTab();
    const stored = await getStoredSubtitles(appState.video.bvid, appState.video.cid);
    let subtitleData = null;

    updateProgress(25, t('progressVideo'));
    setStep(1, '视频信息已读取', 'done');
    setStep(2, t('progressTracks'), 'active');

    if (stored?.subtitles?.length) {
      subtitleData = await buildTracksFromStoredHint(stored);
    }

    if (!subtitleData?.tracks?.length) {
      subtitleData = await requestSubtitlesFromBackground(tab?.id, stored);
    }

    appState.subtitles = subtitleData;
    if (!subtitleData?.hasSubtitles || subtitleData.tracks.length === 0) {
      showNoSubtitle(subtitleData);
      return;
    }

    updateProgress(85, t('tracksFound', [subtitleData.tracks.length]));
    setStep(2, t('tracksFound', [subtitleData.tracks.length]), 'done');
    setStep(3, t('progressDone'), 'active');

    renderResults(subtitleData.tracks);
    updateProgress(100, t('progressDone'));
    setStep(3, t('progressDone'), 'done');

    await wait(250);
    showState('results');
  } catch (error) {
    showError(error);
  }
}

async function requestSubtitlesFromBackground(tabId, stored) {
  const video = appState.video;
  const response = await chrome.runtime.sendMessage({
    type: 'FETCH_SUBTITLES',
    bvid: video.bvid,
    aid: video.aid || stored?.aid || null,
    cid: video.cid || stored?.cid || null,
    tabId: tabId || null,
  });

  if (!response) throw new Error(t('backgroundNoResponse'));
  if (!response.success) throw new Error(response.error || t('subtitleApiFailed'));
  return response.data;
}

async function buildTracksFromStoredHint(stored) {
  const tracks = [];
  for (const subtitle of stored.subtitles) {
    try {
      tracks.push({
        lan: subtitle.lan,
        lanDoc: subtitle.lan_doc,
        entries: await downloadSubtitleJson(subtitle.subtitle_url),
      });
    } catch (error) {
      console.warn('[BiliSub] Failed to use cached subtitle hint.', error);
    }
  }
  return { hasSubtitles: tracks.length > 0, needLogin: false, tracks };
}

async function getStoredSubtitles(bvid, cid) {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      if (chrome.runtime.lastError) return resolve(null);

      if (cid && items[`bilisub_${bvid}_${cid}`]) {
        return resolve(items[`bilisub_${bvid}_${cid}`]);
      }

      const keys = Object.keys(items)
        .filter((key) => key.startsWith(`bilisub_${bvid}_`))
        .sort((a, b) => (items[b].timestamp || 0) - (items[a].timestamp || 0));
      return resolve(keys.length ? items[keys[0]] : null);
    });
  });
}

async function downloadSubtitleJson(url) {
  const normalizedUrl = url?.startsWith('//') ? `https:${url}` : url;
  const response = await fetch(normalizedUrl, { credentials: 'include' });
  if (!response.ok) throw new Error(t('subtitleFileFailed', [response.status]));
  const data = await response.json();
  return data.body || [];
}

function renderResults(tracks) {
  setText('videoTitle2', appState.video.title || t('unknownTitle'));
  setText('bvidTag2', appState.video.bvid || 'BV...');
  renderTracks(tracks);
  showPreview(tracks[0]);
}

function renderTracks(tracks) {
  const list = document.getElementById('tracksList');
  if (!list) return;
  list.replaceChildren();

  tracks.forEach((track, index) => {
    const item = document.createElement('div');
    item.className = 'track-item';

    const meta = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'track-name';
    name.textContent = track.lanDoc || track.lan || 'Subtitle';
    const count = document.createElement('div');
    count.className = 'track-count';
    count.textContent = t('subtitleCount', [track.entries.length]);
    meta.append(name, count);

    const buttons = document.createElement('div');
    buttons.className = 'track-btns';
    buttons.append(
      createDownloadButton(track, index, 'txt'),
      createDownloadButton(track, index, 'srt'),
    );

    item.append(meta, buttons);
    list.appendChild(item);
  });
}

function createDownloadButton(track, index, format) {
  const button = document.createElement('button');
  button.className = `dl-btn ${format}`;
  button.id = `dl-${format}-${index}`;
  button.type = 'button';
  button.textContent = format.toUpperCase();
  button.addEventListener('click', () => {
    triggerDownload(track, format, appState.video?.title || 'subtitle');
    flashButton(button);
  });
  return button;
}

function triggerDownload(track, format, title) {
  const content = format === 'txt' ? toPlainText(track.entries) : toSrt(track.entries);
  const filename = `${safeFilename(title)}_${safeFilename(track.lan || 'subtitle')}.${format}`;
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/plain;charset=utf-8' });
  const reader = new FileReader();

  reader.onloadend = () => {
    const dataUrl = reader.result;
    chrome.downloads.download({ url: dataUrl, filename, saveAs: false }, () => {
      if (chrome.runtime.lastError) downloadWithAnchor(dataUrl, filename);
    });
  };
  reader.readAsDataURL(blob);
}

function toPlainText(entries) {
  return entries.map((entry) => entry.content).filter(Boolean).join('\n');
}

function toSrt(entries) {
  return entries.map((entry, index) => (
    `${index + 1}\n${toSrtTime(entry.from || 0)} --> ${toSrtTime(entry.to || 0)}\n${entry.content || ''}\n`
  )).join('\n');
}

function toSrtTime(value) {
  const sec = Number(value) || 0;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(ms, 3)}`;
}

function downloadWithAnchor(url, filename) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function showPreview(track) {
  const previewBox = document.getElementById('previewBox');
  const previewText = document.getElementById('previewText');
  if (!previewBox || !previewText || !track) return;

  previewText.textContent = track.entries.slice(0, 10)
    .map((entry) => entry.content)
    .filter(Boolean)
    .join('\n');
  previewBox.classList.add('visible');
}

function showNoSubtitle(data) {
  setText('videoTitle3', appState.video?.title || t('unknownTitle'));
  setText('noSubHint', data?.needLogin ? t('loginRequired') : t('noSubtitle'));
  showState('nosub');
}

function showError(error) {
  showState('error');
  setText('errorMsg', `${t('errorPrefix')}${error.message || String(error)}`);
}

function showState(state) {
  Object.values(STATE_IDS).forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.hidden = true;
  });

  const target = document.getElementById(STATE_IDS[state]);
  if (target) target.hidden = false;
}

function setStep(number, text, status = '') {
  const row = document.getElementById(`stepRow${number}`);
  const label = document.getElementById(`step${number}`);
  if (label) label.textContent = text;
  if (!row) return;

  row.classList.remove('active', 'done');
  if (status) row.classList.add(status);
}

function updateProgress(percent, text) {
  const bar = document.getElementById('progressBar');
  const info = document.getElementById('progressInfo');
  if (bar) bar.style.width = `${percent}%`;
  if (info) info.textContent = `${text} (${percent}%)`;
}

function flashButton(button) {
  const originalText = button.textContent;
  button.textContent = t('downloaded');
  button.classList.add('downloaded');
  setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove('downloaded');
  }, 1200);
}

function formatDuration(seconds) {
  if (!seconds) return t('unknownDuration');
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${pad(secs, 2)}`;
}

function cleanTitle(title) {
  return (title || '').replace(/\s*-\s*bilibili.*$/i, '').replace(/\s*-\s*\u54d4\u54e9\u54d4\u54e9.*$/i, '').trim();
}

function safeFilename(name) {
  return (name || 'subtitle').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

function pad(value, length) {
  return String(value).padStart(length, '0');
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}


function applyStaticText() {
  const uiLanguage = typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage
    ? chrome.i18n.getUILanguage()
    : 'en';
  document.documentElement.lang = uiLanguage.startsWith('zh') ? 'zh-CN' : 'en';
  setText('headerTitle', t('extensionName'));
  setText('headerSubtitle', t('headerSubtitle'));
  setText('notBiliText', t('notBili'));
  setText('loadingText', t('loading'));
  setText('videoTitle', t('unknownTitle'));
  setText('durationTag', t('unknownDuration'));
  setText('fetchBtn', t('fetchButton'));
  setText('progressInfo', `${t('progressStart')} (0%)`);
  setText('step1', t('progressVideo'));
  setText('step2', t('progressTracks'));
  setText('step3', t('progressDone'));
  setText('videoTitle2', t('unknownTitle'));
  setText('previewLabel', t('previewLabel'));
  setText('videoTitle3', t('unknownTitle'));
  setText('noSubHint', t('noSubtitle'));
  setText('errorMsg', t('errorPrefix'));
  document.querySelectorAll('.btn-back').forEach((button) => {
    button.textContent = t('backButton');
  });
  setText('footerVersion', `${t('extensionName')} v1.0.0`);
  setText('footerFormats', t('footerFormats'));
}

function t(key, substitutions = []) {
  if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
    const message = chrome.i18n.getMessage(key, substitutions.map(String));
    if (message) return message;
  }

  let text = FALLBACK_TEXT[key] || key;
  substitutions.forEach((value, index) => {
    text = text
      .replace(`{${index}}`, value)
      .replace('{count}', value)
      .replace('{status}', value);
  });
  return text;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
