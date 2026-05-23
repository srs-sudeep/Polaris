# Polaris

Polaris is an Electron desktop translator focused on fast translation from selected text, clipboard content, and manual input.

## Overview

Polaris is built for quick reading and comprehension workflows, especially when switching between apps. It combines global shortcut translation, clipboard monitoring, and direct text input in a single lightweight desktop app.

## Key Features

- Translate selected text from any app with a global shortcut (default: Ctrl/Cmd + Shift + T).
- Translate clipboard text on demand from the tray or main window.
- Auto-translate copied Japanese text when clipboard monitoring is enabled.
- Enter or paste text manually and submit with Ctrl+Enter.
- Select source/target languages, swap them, and use speech playback.
- Review recent translation history from the current app session.
- Show a compact floating bubble for selected-text translation results.
- Use free translation providers with fallback behavior (MyMemory primary, LibreTranslate fallback).

## Requirements

- Node.js 18 or newer recommended.
- npm 9 or newer recommended.
- macOS, Windows, or Linux.
- Internet access for translation provider APIs.

## Setup

Install dependencies:

```bash
npm install
```

Run the desktop app in development mode:

```bash
npm start
```

Run syntax verification checks before committing changes:

```bash
npm run verify
```

## Development Workflow

1. Start with `npm install`.
2. Run `npm start` to open Polaris.
3. Make changes in the layer you are working on (main, preload, renderer, or service).
4. Run `npm run verify` before PR or merge.

### Working By Layer

- Main process: app lifecycle, windows, tray, global shortcuts, clipboard polling, IPC handlers.
- Preload bridge: controlled API exposure from Electron IPC to renderer.
- Renderer: UI events, tab behavior, state rendering, history rendering, speech/copy actions.
- Translation service: language normalization/detection, provider calls, caching, fallback flow.

Update all impacted layers when changing a feature end to end. For example, new translation actions usually require matching updates across IPC handlers, preload API exposure, and renderer usage.

## Build And Packaging

Build unpacked output:

```bash
npm run build
```

Build platform targets:

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

Artifacts are generated under `dist/`.

## Architecture

### Project Structure

- `main.js`: Electron main process orchestration and IPC registration.
- `preload.js`: `contextBridge` API exposed to renderer as `window.polaris`.
- `index.html`: main renderer shell and application layout.
- `styles/app.css`: shared app UI styling.
- `src/renderer/renderer.js`: renderer behavior, state updates, and interaction logic.
- `src/services/translationService.js`: API client, translation flow, chunking, and cache.
- `src/bubble/bubble.html`: floating translation bubble UI.
- `assets/icon.png`: app/tray icon asset.

### IPC And Security Conventions

- Keep `contextIsolation: true` and `nodeIntegration: false` for renderer safety.
- Expose only explicit, minimal APIs in `preload.js`.
- Route privileged operations through IPC handlers in `main.js`.
- Keep IPC channel names stable and update renderer + preload together when contracts change.

## Platform Notes

- macOS selected-text translation uses a simulated copy shortcut. If selected text is not captured, grant Accessibility permission to the terminal (development) or Polaris (packaged app).
- Tray behavior keeps the app running even when windows are closed; use tray Quit to fully exit.

## Contribution Guidelines

- Keep feature changes scoped and update related layers together.
- Run `npm run verify` before opening a PR.
- Validate core flows manually: selected text, clipboard translation, manual input, history, and settings shortcut updates.
