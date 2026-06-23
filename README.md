# BiliSub

BiliSub is a Chrome extension for exporting Bilibili CC subtitles as `TXT` or `SRT` files.

![BiliSub preview](assets/github-preview.png)

## Demo

![BiliSub popup demo](assets/popup-demo.png)

![BiliSub usage demo](assets/use-demo.gif)

Full usage video: [UseDemo.mp4](UseDemo.mp4)

## Features

- Detects the active Bilibili video page and reads the current `BV`, `aid`, and `cid`.
- Finds available CC subtitle tracks through page interception first, then falls back to Bilibili web APIs.
- Downloads subtitles as plain text or SRT with UTF-8 BOM for better Windows compatibility.
- Keeps the extension small and dependency-free for Chrome Web Store submission.

## Architecture

The extension is intentionally layered:

- `content-main.js` runs in the page world, observes Bilibili player/subtitle responses, and can perform same-page fetches with the user's Bilibili session.
- `content.js` runs in the isolated extension world, bridges popup/background messages, and caches subtitle hints for a short time.
- `background.js` owns Bilibili API calls, WBI signing, subtitle JSON loading, and error normalization.
- `popup.js` owns UI state, cached-subtitle preference, format conversion, and downloads.

This keeps page access, extension messaging, API rules, and UI behavior decoupled.

## Install Locally

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the `chrome-extension` folder.
5. Open a Bilibili video URL like `https://www.bilibili.com/video/BV...`, then click the BiliSub extension icon.

## Package For Chrome Web Store

Zip the contents of the `chrome-extension` folder, not the parent folder:

```bash
python scratch/zip_extension.py
```

The generated `BiliSub.zip` is the upload package.

## Store Listing Draft

Short description:

> Export Bilibili CC subtitles from the current video page as TXT or SRT files.

Detailed description:

> BiliSub helps you save available Bilibili CC subtitles from the video you are watching. Open a Bilibili video page, click the extension, choose a subtitle track, and download it as TXT or SRT. The extension only runs on Bilibili pages and subtitle/CDN endpoints needed to read subtitle data.

Privacy note:

> BiliSub does not collect, sell, or transmit personal data to any third-party service. It reads the active Bilibili video page and stores short-lived subtitle metadata locally in Chrome storage to improve reliability.

## Files

```text
chrome-extension/
  manifest.json
  popup.html
  popup.js
  background.js
  content.js
  content-main.js
  icons/
chrome_store_promo.png
extension_screenshot.png
scratch/zip_extension.py
```

## License

MIT
