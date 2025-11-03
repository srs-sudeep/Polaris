# Polaris

**Language, illuminated**

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

## How to Use

1. **Start the app** - It runs in the background (system tray)
2. **Select Japanese text** anywhere on your screen (web page, document, etc.)
3. **Copy it** (Ctrl/C or Cmd+C) - The translation window appears automatically as an overlay!

**That's it!** The window appears over your current application, showing the translation instantly. Use the tabs to navigate between Translation and Info screens.

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