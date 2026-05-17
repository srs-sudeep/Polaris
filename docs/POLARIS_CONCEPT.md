# Polaris Product Concept

## Origin

Polaris started from a simple frustration: translation tools are powerful, but they are rarely effortless when you are already inside another app, reading a page, watching a video, playing a game, or working through a document.

The original goal was to make translation feel easy enough that the user does not have to stop what they are doing. Instead of copying text, opening a website, pasting it, translating it, and switching back, Polaris should become a lightweight translation layer over the desktop.

The core idea:

> Translate what I am looking at, where I am looking at it.

Polaris should work across apps and pages, provide more than one way to translate, and show the result directly on the screen whenever possible.

## Vision

Polaris is a desktop translation assistant that sits quietly in the background and appears only when needed. It should feel closer to a system feature than a normal app window.

The long-term experience is inspired by the Google Assistant translation overlay: when text appears on screen, Polaris can translate it in place, show an overlay near the source text, continue translating as the user scrolls, and support quick selected-text translation.

Polaris should not force one workflow. Different situations need different translation methods, so the product should support multiple paths:

- Copy text and instantly translate it.
- Select a region of the screen and translate text inside it with OCR.
- Select text in any app and trigger a translation overlay.
- Translate visible text while scrolling through a page or document.
- Translate text directly over the original screen location.
- Keep a history of recent translations for review.

## Product Promise

Polaris helps users understand foreign-language content without breaking their flow.

It should be:

- Fast: translation should appear within a moment.
- Contextual: results should appear near the source text when possible.
- Flexible: support clipboard, OCR, selected text, and live page/screen workflows.
- Quiet: stay out of the way until the user asks or Japanese text is detected.
- Cross-app: work over browsers, PDFs, documents, games, images, chat apps, and desktop software.

## Primary Users

### Language learners

People reading Japanese websites, manga scans, visual novels, documents, or apps who want quick help without constantly switching tools.

### Researchers and everyday readers

People who need to skim foreign-language content quickly and understand enough context to continue.

### Power users

People who want hotkeys, overlay positioning, OCR, scroll translation, and provider choices.

## Core Translation Modes

### 1. Clipboard Translation

This is the simplest and most reliable mode.

Flow:

1. User selects Japanese text anywhere.
2. User copies it.
3. Polaris detects Japanese text in the clipboard.
4. Polaris translates it and shows the result in the main window.

This mode is already partially implemented.

Good for:

- Web pages
- Documents
- Chat apps
- PDFs with selectable text
- Any app where copy works

### 2. Selected Text Translation

This is the next step beyond clipboard translation. The user selects text and presses a hotkey, such as `Ctrl+Shift+T`.

Flow:

1. User highlights text in any app.
2. User presses the translate hotkey.
3. Polaris reads the current selection, using clipboard fallback if required.
4. A small translation overlay appears near the cursor or selected text.

Good for:

- Quick lookup without opening the full app window
- Reading long pages
- Translating one sentence at a time

Implementation note:

Cross-app selected-text access is different on each operating system. A practical first version can temporarily copy the selection, translate the clipboard content, then restore the previous clipboard value.

### 3. OCR Snip Translation

This mode translates text that cannot be selected or copied.

Flow:

1. User presses `Ctrl+Shift+O` or clicks "Select Screen Area".
2. Polaris lets the user drag over a screen region.
3. Polaris captures that region.
4. OCR extracts the text.
5. Polaris translates it.
6. The translation appears as an overlay near or over the selected area.

This mode is already partially implemented.

Good for:

- Images
- Screenshots
- Games
- Videos
- Manga panels
- App UI text
- Scanned PDFs

### 4. In-Place Overlay Translation

This is the signature Polaris experience.

Instead of only showing translated text in a separate window, Polaris can draw the translated text over the screen itself. The user sees the English text in the same visual location as the Japanese text.

Flow:

1. Polaris identifies a screen region with text.
2. OCR detects text bounding boxes.
3. Translation is generated per text block.
4. Polaris places transparent overlay windows or overlay elements above the source text.
5. The user can dismiss, pin, fade, or refresh the overlay.

Good for:

- Reading apps without switching context
- Translating UI labels
- Visual novel/game dialogue
- Image-heavy pages

Design challenge:

The overlay must be readable without hiding too much of the original content. It needs opacity controls, compact text fitting, and quick hide/show behavior.

### 5. Scroll Translation

Scroll translation turns Polaris from a one-shot translator into a reading companion.

Flow:

1. User enables "Scroll Translate" for the active screen or region.
2. Polaris periodically captures the visible area.
3. OCR extracts visible Japanese text.
4. Previously translated text blocks are cached.
5. As the user scrolls, Polaris translates new visible text and removes stale overlays.

Good for:

- Long web pages
- Online novels
- Forums
- Documentation
- PDFs
- Manga readers

Key behavior:

- Translate only visible text.
- Avoid re-translating the same text repeatedly.
- Debounce after scrolling stops.
- Keep overlays aligned with screen coordinates.

### 6. Page Translation Companion

For browsers and readable documents, Polaris can provide a page-level translation mode.

Flow:

1. User triggers "Translate Page".
2. Polaris detects text either through accessibility APIs, browser automation, clipboard workflows, or OCR fallback.
3. Polaris shows translations in an overlay, side panel, or replacement view.

Good for:

- Articles
- Documentation
- News pages
- Product pages

This can be built after the core desktop overlay system is reliable.

## Interaction Model

Polaris should offer a small set of predictable commands:

- `Ctrl/Cmd+Shift+T`: translate selected text.
- `Ctrl/Cmd+Shift+O`: OCR snip translate.
- `Ctrl/Cmd+Shift+S`: toggle scroll translation.
- `Esc`: dismiss current overlay.
- Tray menu: show app, pause detection, clear overlays, settings, quit.

The app should also support passive detection:

- Clipboard monitoring for Japanese text.
- Optional auto OCR for a chosen screen region.
- Optional scroll monitoring for active translation sessions.

## Main App Structure

The main Polaris window can be organized around workflows:

- Translate: current clipboard or selected text translation.
- OCR: screen-area capture and extracted text.
- Overlay: active overlays, opacity, position, clear/pin controls.
- History: recent translations.
- Settings: languages, providers, hotkeys, privacy, OCR options.

## Technical Architecture

### Current foundation

Polaris currently uses:

- Electron for the desktop shell.
- BrowserWindow overlays for always-on-top translation surfaces.
- Electron clipboard monitoring.
- Electron desktop capture for screen OCR.
- Tesseract.js for OCR.
- MyMemory and LibreTranslate for translation.

### Recommended architecture

Polaris should evolve into separate internal services:

- Translation service: provider selection, language detection, retries, caching.
- OCR service: image preprocessing, text extraction, bounding boxes, confidence filtering.
- Capture service: screen, region, active-window, and scrolling capture.
- Overlay service: create, update, position, pin, and dismiss overlays.
- Hotkey service: global shortcuts and command routing.
- Session service: tracks active translation mode, history, and cache.

### Provider strategy

Start with free providers, but design the service so users can choose:

- MyMemory for free simple translation.
- LibreTranslate for self-hosted or public translation.
- DeepL for high-quality translation.
- Google Cloud Translation for broad language support.
- OpenAI-compatible models for contextual translation and explanation.

## Privacy Principles

Polaris will often process text from other apps, so trust matters.

Product rules:

- Make translation providers visible to the user.
- Allow local-only OCR.
- Let users pause clipboard monitoring.
- Do not store history unless enabled.
- Clearly indicate when text is sent to a remote provider.
- Provide a "clear all overlays and history" command.

## MVP Roadmap

### Phase 1: Solidify Existing Core

- Clipboard Japanese-to-English translation.
- OCR snip translation.
- Overlay above selected screen region.
- Clear/show overlay controls.
- Better error messages.
- Translation history in the app window.

### Phase 2: Assistant-Style Quick Translation

- Global selected-text translate hotkey.
- Small overlay near cursor.
- Clipboard restoration after hotkey translation.
- Configurable source and target languages.
- Tray pause/resume controls.

### Phase 3: Better In-Place Overlay

- OCR bounding boxes.
- Multiple overlay text blocks.
- Overlay opacity and font-size controls.
- Pin, dismiss, and refresh actions.
- Cache repeated translations.

### Phase 4: Scroll Translation

- User-selected scroll region.
- Detect when visible text changes.
- Debounced OCR while scrolling.
- Translate new text blocks only.
- Remove or update overlays as content moves.

### Phase 5: Page and App Intelligence

- Browser-friendly page translation.
- Accessibility API text extraction where possible.
- Per-app profiles.
- Translation memory.
- Optional contextual explanations for learners.

## Experience Examples

### Reading a Japanese article

The user highlights a paragraph and presses `Ctrl+Shift+T`. Polaris shows a compact translation near the selected area. If they want to read continuously, they enable Scroll Translate and Polaris keeps translating visible text as they move down the page.

### Playing a Japanese game

The user presses `Ctrl+Shift+O`, drags over the dialogue box, and Polaris overlays the English translation above the original text. For repeated dialogue boxes, they can keep a pinned region and refresh it with a hotkey.

### Reading a manga page

The user selects a panel region. Polaris OCRs the text bubbles and overlays translations near each detected bubble. Future versions can preserve approximate placement and styling.

### Translating app UI

The user activates OCR snip over a settings window. Polaris translates labels directly over the UI so the user can continue navigating.

## Product North Star

Polaris succeeds when translation feels like part of the screen, not another destination.

The user should be able to keep reading, keep working, keep playing, or keep exploring while Polaris quietly turns foreign text into understandable text in the place where it matters.
