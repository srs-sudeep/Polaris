# Polaris

Polaris is a small desktop translation reader for selected, copied, and manually entered text.

## What It Does

- Press `Ctrl/Cmd+Shift+T` to translate selected text from any app.
- Translate the current clipboard from the main window or tray.
- Type or paste text into the source pane and press `Ctrl+Enter`.
- Choose source and target languages, swap them, copy translation, and use speech playback.
- Use separate Translate, History, and Settings tabs.
- Update the selected-text keyboard shortcut from Settings.
- Show a compact floating translation bubble for selected text.
- Keep recent translations in a local in-memory Reader history.
- Use free translation APIs only: MyMemory first, LibreTranslate fallback.

## What Is Removed

This rebuild intentionally removes OCR, screen selection, scroll translation, Tesseract, traineddata files, and the old multi-tab overlay implementation.

## Run

```bash
npm install
npm start
```

## Build

```bash
npm run build
```

## Notes

On macOS, selected-text translation uses a simulated copy shortcut and may require Accessibility permission for the terminal or packaged Polaris app.
