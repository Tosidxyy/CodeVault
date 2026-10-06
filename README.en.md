<p align="center"><img src="public/icons/icon-128.png" alt="CodeVault" width="96" height="96" /></p>
<h1 align="center">CodeVault</h1>
<p align="center">Bookmark problems, collect solutions and capture your thinking.</p>
<p align="center"><a href="README.md">简体中文</a></p>

CodeVault is a local-first browser extension for your LeetCode algorithm library. It supports leetcode.com and leetcode.cn in Chrome and Edge.

Current version: **v0.3.0**. This release adds backup/restore, a recycle bin, filters, sorting, a draggable panel and English/Chinese interfaces. Chrome Web Store availability depends on the installed release.

## Features

- Bookmark problems and search by title, tags or solution names.
- Save multiple code snapshots and reference solutions with names, languages and notes.
- Load a matching solution into the editor, confirm replacement and undo with Ctrl+Z.
- Keep one illustrated note per problem, with automatic saving, image thumbnails and centered previews.
- Optionally analyze selected code using your own DeepSeek, OpenAI, Claude or compatible API.
- Includes JSON backup/restore, a problem recycle bin, difficulty/tag filters, sorting and a draggable panel with remembered layout.

## Install from source

Requires Node.js 22.12 or newer.

```sh
git clone https://github.com/Tosidxyy/CodeVault.git
cd CodeVault
npm ci
npm run build
```

Open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select the generated `dist` folder. Refresh your LeetCode page. After rebuilding, reload the extension and refresh the page again.

## Use

1. Open a normal LeetCode problem and click the CodeVault icon. Choose **View current problem** and **Bookmark problem**.
2. Hover over the editor or a standard solution article code block to capture code. Review the snapshot and save it. A blank name generates an automatic name.
3. Select the same language in the site editor before using **Load into editor**. Replacement of different code requires confirmation; Ctrl+Z undoes it.
4. Type notes and wait for **Saved**. Upload, paste or drop a PNG, JPEG or WebP image. Click a thumbnail to enlarge it; image deletion has a short undo window. Limits: 20,000 characters, 5 images / 6MB total, 2MB per image.
5. Configure an optional AI provider, model and your own API key in settings. Read the code snapshot, then explicitly send it for analysis. Complete results for saved solutions can be saved; stopped or incomplete results cannot.

The interface supports English and Simplified Chinese. Non-Chinese browser preferences default to English. Use **English / 中文** in the popup, settings or panel to switch; the choice persists locally and updates open extension views. Your problem titles, tags, code, solution names, notes and existing analyses are not translated. New analyses request the selected interface language.

## Library tools

**Backups:** Export a local JSON file from Data backup. Keys and AI settings are excluded. Preview an import before confirming. Existing records are preserved; missing records are added. Backups include trash, are unencrypted and have a 64MB limit. Keep them private.

**Trash:** Move a whole problem and its related content to trash. Restore it or confirm permanent deletion. Trash is not automatically emptied. Existing backup files are not removed by deletion in the extension.

**Filters:** Combine search, difficulty and one tag. Sort by date bookmarked, recent visits or title. Returning or refreshing preserves session filters and scroll position; restarting the browser resets session filters.

**Panel:** Drag the icon or header, or focus them and use arrow keys; Shift moves farther and Escape cancels a drag. Switch compact/expanded mode in the header. Position and size are remembered and constrained to the screen. Reset them using the button at the bottom.

## Data and limits

Library data is stored locally in the browser profile. Uninstalling or clearing extension storage removes it; export a backup first. There is no CodeVault cloud synchronization.

API keys are stored locally without additional at-rest encryption. User-triggered AI analysis sends problem details, code and language directly to the selected provider, without notes or images. Connection tests and analysis may incur provider charges. CodeVault does not execute code, submit solutions or verify correctness. See the [privacy policy](docs/PRIVACY.md).

Normal problem routes and standard article code blocks are supported. Contest-specific routes and some custom editors/widgets are outside the current scope. CodeVault is an independent project and is not affiliated with LeetCode.

Report issues at [GitHub Issues](https://github.com/Tosidxyy/CodeVault/issues). Include reproduction steps, but never publish keys or private code.
