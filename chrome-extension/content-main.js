(function () {
  const rawFetch = window.fetch;
  const MESSAGE_TYPES = Object.freeze({
    fetchRequest: 'BILISUB_FETCH_REQUEST',
    fetchResponse: 'BILISUB_FETCH_RESPONSE',
    infoRequest: 'BILISUB_INFO_REQUEST',
    infoResponse: 'BILISUB_INFO_RESPONSE',
    subtitleIntercepted: 'BILISUB_SUBTITLE_INTERCEPTED',
  });

  function getRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input === 'object' && input.url) return input.url;
    return '';
  }

  function publishSubtitlePayload(url, responseBody) {
    if (!responseBody || responseBody.code !== 0 || !responseBody.data) return;

    const isPlayerApi = url.includes('/x/player/v2') || url.includes('/x/player/wbi/v2');
    const isSubtitleApi = url.includes('/x/v2/subtitle/web/view');
    let subtitles = [];
    let aid = null;
    let cid = null;

    if (isPlayerApi && responseBody.data.subtitle) {
      subtitles = responseBody.data.subtitle.subtitles || [];
      aid = responseBody.data.aid || null;
      cid = responseBody.data.cid || null;
    }

    if (isSubtitleApi) {
      subtitles = responseBody.data.subtitles || [];
      const urlObject = new URL(url, window.location.origin);
      aid = urlObject.searchParams.get('pid') || urlObject.searchParams.get('aid');
      cid = urlObject.searchParams.get('oid') || urlObject.searchParams.get('cid');
    }

    if (subtitles.length > 0 || aid || cid) {
      window.postMessage({
        type: MESSAGE_TYPES.subtitleIntercepted,
        aid: aid ? Number(aid) : null,
        cid: cid ? Number(cid) : null,
        subtitles,
      }, '*');
    }
  }

  window.fetch = async function (...args) {
    const response = await rawFetch.apply(this, args);
    const url = getRequestUrl(args[0]);
    const shouldInspect =
      url.includes('/x/player/v2') ||
      url.includes('/x/player/wbi/v2') ||
      url.includes('/x/v2/subtitle/web/view');

    if (shouldInspect) {
      response.clone().json()
        .then((body) => publishSubtitlePayload(url, body))
        .catch((error) => console.warn('[BiliSub] Unable to inspect page response.', error));
    }

    return response;
  };

  window.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === MESSAGE_TYPES.fetchRequest) {
      const { requestId, url } = event.data;
      rawFetch(url, { credentials: 'include' })
        .then((response) => response.json())
        .then((data) => window.postMessage({
          type: MESSAGE_TYPES.fetchResponse,
          requestId,
          success: true,
          data,
        }, '*'))
        .catch((error) => window.postMessage({
          type: MESSAGE_TYPES.fetchResponse,
          requestId,
          success: false,
          error: error.message,
        }, '*'));
    }

    if (event.data.type === MESSAGE_TYPES.infoRequest) {
      const { requestId } = event.data;
      try {
        window.postMessage({
          type: MESSAGE_TYPES.infoResponse,
          requestId,
          success: true,
          state: window.__INITIAL_STATE__ || null,
        }, '*');
      } catch (error) {
        window.postMessage({
          type: MESSAGE_TYPES.infoResponse,
          requestId,
          success: false,
          error: error.message,
        }, '*');
      }
    }
  });
}());
