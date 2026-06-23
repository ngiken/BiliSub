(function () {
  const MESSAGE_TYPES = Object.freeze({
    fetchRequest: 'BILISUB_FETCH_REQUEST',
    fetchResponse: 'BILISUB_FETCH_RESPONSE',
    infoRequest: 'BILISUB_INFO_REQUEST',
    infoResponse: 'BILISUB_INFO_RESPONSE',
    subtitleIntercepted: 'BILISUB_SUBTITLE_INTERCEPTED',
  });

  const pendingRequests = new Map();

  window.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === MESSAGE_TYPES.fetchResponse || event.data.type === MESSAGE_TYPES.infoResponse) {
      resolvePendingRequest(event.data);
      return;
    }

    if (event.data.type === MESSAGE_TYPES.subtitleIntercepted) {
      saveSubtitleHint(event.data);
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_VIDEO_INFO') {
      getPageInitialState()
        .then((state) => sendResponse({ success: true, data: extractVideoInfo(state) }))
        .catch(() => {
          try {
            sendResponse({ success: true, data: extractVideoInfo(null) });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
        });
      return true;
    }

    if (request.type === 'FETCH_API_FROM_PAGE') {
      fetchFromPageContext(request.url)
        .then((data) => sendResponse({ success: true, data }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    return false;
  });

  function resolvePendingRequest(message) {
    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    pendingRequests.delete(message.requestId);

    if (message.success) {
      pending.resolve(message.type === MESSAGE_TYPES.infoResponse ? message.state : message.data);
    } else {
      pending.reject(new Error(message.error || 'Request failed'));
    }
  }

  function saveSubtitleHint({ aid, cid, subtitles }) {
    if (!cid) return;

    let bvid;
    try {
      bvid = extractBvidFromUrl(location.href);
    } catch (error) {
      return;
    }

    const key = `bilisub_${bvid}_${cid}`;
    chrome.storage.local.set({
      [key]: {
        bvid,
        aid: aid || null,
        cid,
        subtitles: subtitles || [],
        title: cleanTitle(document.title),
        timestamp: Date.now(),
      },
    }, cleanupOldCache);
  }

  function cleanupOldCache() {
    chrome.storage.local.get(null, (items) => {
      if (chrome.runtime.lastError) return;

      const maxAgeMs = 24 * 60 * 60 * 1000;
      const now = Date.now();
      const expiredKeys = Object.keys(items).filter((key) => (
        key.startsWith('bilisub_') &&
        items[key]?.timestamp &&
        now - items[key].timestamp > maxAgeMs
      ));

      if (expiredKeys.length > 0) {
        chrome.storage.local.remove(expiredKeys);
      }
    });
  }

  function requestFromMainWorld(type, timeoutMs, extraPayload = {}) {
    return new Promise((resolve, reject) => {
      const requestId = `${type}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      pendingRequests.set(requestId, { resolve, reject });
      window.postMessage({ type, requestId, ...extraPayload }, '*');

      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error('Page request timed out'));
        }
      }, timeoutMs);
    });
  }

  function fetchFromPageContext(url) {
    return requestFromMainWorld(MESSAGE_TYPES.fetchRequest, 10000, { url });
  }

  function getPageInitialState() {
    return requestFromMainWorld(MESSAGE_TYPES.infoRequest, 2000);
  }

  function extractVideoInfo(state) {
    const bvid = extractBvidFromUrl(location.href);

    if (state && state.bvid === bvid) {
      const videoData = state.videoData || {};
      const pages = videoData.pages || [];
      const currentP = state.p || 1;
      const currentPage = pages[currentP - 1] || pages[0] || {};

      return {
        bvid,
        aid: state.aid || videoData.aid || null,
        cid: state.cid || currentPage.cid || null,
        title: videoData.title || cleanTitle(document.title),
        pages,
        currentP,
      };
    }

    return {
      bvid,
      aid: null,
      cid: null,
      title: cleanTitle(document.title),
      pages: [],
      currentP: 1,
    };
  }

  function extractBvidFromUrl(url) {
    const match = url.match(/BV[0-9A-Za-z]{10}/);
    if (!match) throw new Error('No BV id found in this page URL.');
    return match[0];
  }

  function cleanTitle(title) {
    return (title || '').replace(/\s*-\s*哔哩哔哩.*$/, '').trim();
  }
}());
