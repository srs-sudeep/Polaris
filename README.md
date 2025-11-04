<div align="center">
  <img src="assets/icon.png" alt="Polaris Logo" width="200" height="200">
  
  # Polaris
  
  **Language, illuminated**
</div>

---

A sleek desktop application that automatically translates Japanese text to English. The translation window appears as an overlay when Japanese text is detected, providing a seamless translation experience.

## Features

✨ **Smart Overlay Window**
- Window appears automatically when Japanese text is detected
- Always-on-top overlay positioned in top-right corner
- Clean, modern interface with tab navigation

🌐 **Multiple Screens (Tabs)**
- **Translation Tab**: Shows original text and translation
- **Info Tab**: Usage instructions and app information
- More tabs coming soon!

🎯 **Seamless Experience**
- Runs in the system tray
- No window visible until needed
- Automatic clipboard monitoring
- Instant translation

## Installation

1. **Install Node.js** (v16 or higher)
   - Download from https://nodejs.org

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the application:**
   ```bash
   npm start
   ```

## 📸 Screenshots

### Main Window
<!-- Add screenshot of main window here -->
![Main Window](./screenshots/main-window.png)

### Translation Mode
<!-- Add screenshot of translation mode here -->
![Translation Mode](./screenshots/translation-mode.png)

### OCR Snip Mode
<!-- Add screenshot of OCR snip mode here -->
![OCR Snip Mode](./screenshots/ocr-snip-mode.png)

### Overlay Translation
<!-- Add screenshot of overlay translation here -->
![Overlay Translation](./screenshots/overlay-translation.png)

## 🎥 Demo Video

<!-- Add demo video here -->
[![Demo Video](./screenshots/demo-thumbnail.png)](./demo-video.mp4)

Click the thumbnail above to watch the full demo video, or [view on YouTube](./demo-video.mp4)

## How to Use

### 📋 Translation Mode
1. **Start the app** - The main window opens automatically
2. **Select Japanese text** anywhere on your screen (web page, document, etc.)
3. **Copy it** (Ctrl/C or Cmd+C) - The translation window appears automatically!

**That's it!** The window shows the translation instantly. Use the tabs to navigate between Info, Translation, and OCR screens.

### 📷 OCR Snip Mode
1. **Open the OCR tab** or press **Ctrl+Shift+O** (Cmd+Shift+O on Mac)
2. **Click "Select Screen Area"** button
3. **Drag to select** the area containing Japanese text
4. **Translation overlay appears** directly over the selected area
5. **View results** in the OCR tab for extracted and translated text

## Building for Distribution

```bash
# Build for current platform
npm run build

# Build for specific platform
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

Built applications will be in the `dist/` folder.

## Technical Details

- **Translation API**: Uses MyMemory Translation API (free, 10K words/day)
- **Detection**: Automatically detects Japanese text via character recognition
- **Overlay**: Transparent, always-on-top window that positions near cursor

## Requirements

- Node.js v16+
- Internet connection (for translation API)
- Screen recording permissions (for overlay positioning)

## Permissions Needed

- **Windows**: May require screen capture permissions
- **macOS**: Grant screen recording permissions in System Preferences → Security & Privacy
- **Linux**: Usually works without additional permissions

## Troubleshooting

**Overlay not appearing?**
- Make sure you've copied Japanese text (contains hiragana, katakana, or kanji)
- Check that the app is running (check system tray)
- Try the keyboard shortcut: `Ctrl/Cmd + Shift + T`

**Translation errors?**
- Check internet connection
- Free API limit may be reached (10K words/day)
- Wait a moment and try again

## License

MIT License