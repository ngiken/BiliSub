# BiliSub

中文 | [English](README.md)

BiliSub 是一个 Chrome 扩展，用来把 Bilibili 当前视频页里的 CC 字幕导出为 `TXT` 或 `SRT` 文件。

![BiliSub 预览图](assets/github-preview.png)

## 演示

![BiliSub 界面演示](assets/popup-demo.png)

![BiliSub 使用演示](assets/use-demo.gif)

完整使用影片：[UseDemo.mp4](UseDemo.mp4)

## 功能

- 自动识别当前打开的 Bilibili 视频页，并读取 `BV`、`aid`、`cid` 等视频信息。
- 优先通过页面已加载的数据寻找字幕轨道，失败时再回退到 Bilibili Web API。
- 支持把字幕保存为纯文本 `TXT` 或标准字幕 `SRT`。
- 下载文件使用 UTF-8 BOM，方便 Windows 记事本、剪映、字幕工具等软件直接读取中文。
- 扩展体积小，无第三方运行依赖，适合 Chrome Web Store 上架。

## 使用方法

1. 打开一个 Bilibili 视频页面，例如 `https://www.bilibili.com/video/BV...`。
2. 点击浏览器右上角的 BiliSub 扩展图标。
3. 点击「提取字幕」。
4. 选择需要的字幕轨道。
5. 点击 `TXT` 或 `SRT` 下载。

如果视频没有 CC 字幕，或者字幕需要登录后才能读取，扩展会显示对应提示。

## 本地安装

1. 打开 `chrome://extensions/`。
2. 开启「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择项目里的 `chrome-extension` 文件夹。
5. 打开 Bilibili 视频页后使用 BiliSub。

## Chrome Web Store 打包

打包时要压缩 `chrome-extension` 文件夹里面的内容，不要把外层文件夹一起压进去。

可以直接运行：

```bash
python scratch/zip_extension.py
```

生成的 `BiliSub.zip` 就是 Chrome Web Store 上传包。

## 架构说明

这个扩展按分层、解耦、规则化和数据化的方式组织：

- `content-main.js` 运行在页面主环境，负责观察 Bilibili 播放器和字幕接口响应，也可以使用页面会话发起请求。
- `content.js` 运行在扩展隔离环境，负责和 popup/background 通信，并短期缓存字幕元数据。
- `background.js` 负责 Bilibili API 请求、WBI 签名、字幕 JSON 下载和错误标准化。
- `popup.js` 负责界面状态、缓存优先策略、TXT/SRT 格式转换和下载。

这样页面访问、扩展通信、接口规则和界面逻辑不会写死在单一逻辑里，后续维护和扩展更稳。

## Chrome Web Store 中文资料草案

简短描述：

> 从当前 Bilibili 视频页面导出 CC 字幕，支持 TXT 和 SRT 格式。

详细描述：

> BiliSub 可以帮助你保存正在观看的 Bilibili 视频 CC 字幕。打开 Bilibili 视频页面，点击扩展图标，选择字幕轨道，然后下载为 TXT 或 SRT 文件。扩展只在 Bilibili 视频页面及读取字幕所需的接口/CDN 上运行。

隐私说明：

> BiliSub 不收集、不出售、也不会向第三方服务传输个人数据。扩展只读取当前 Bilibili 视频页和字幕数据，并在 Chrome 本地存储中短期保存字幕元数据，以提高字幕提取成功率。

## 文件结构

```text
chrome-extension/
  manifest.json
  popup.html
  popup.js
  background.js
  content.js
  content-main.js
  icons/
assets/
UseDemo.mp4
BiliSub.zip
scratch/zip_extension.py
```

## 许可证

MIT
