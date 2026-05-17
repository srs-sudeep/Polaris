const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, clipboard, screen, desktopCapturer, nativeImage } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { translateText, detectLanguage, containsJapanese, getProviderStatus } = require('./src/services/translationService');
const { extractTextFromImage, terminateOCR } = require('./src/services/ocrService');

const execFileAsync = promisify(execFile);

let mainWindow = null;
let overlayWindow = null;
let selectionWindow = null;
let tray = null;
let lastClipboardText = '';
let clipboardCheckInterval = null;
let currentOverlayData = null;
let selectedTextBusy = false;
let liveTranslationBusy = false;
let liveTranslationInterval = null;
let liveLastSignature = '';

const appState = {
  clipboardMonitoring: true,
  liveTranslationEnabled: false,
  sourceLang: 'ja',
  targetLang: 'en',
  liveStatus: 'Stopped',
  shortcuts: {
    selectedText: 'Ctrl/Cmd+Shift+T',
    ocrSnip: 'Ctrl/Cmd+Shift+O',
    liveScreen: 'Ctrl/Cmd+Shift+S'
  },
  provider: getProviderStatus().currentProvider
};

const translationHistory = [];
const MAX_HISTORY_ITEMS = 30;

function createMainWindow() {
  if (mainWindow) {
    return;
  }

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const fs = require('fs');
  
  const windowOptions = {
    width: 500,
    height: 650,
    frame: true,
    alwaysOnTop: true,
    resizable: true,
    show: true, // Show window on startup
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Polaris - Language, illuminated',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#ffffff'
  };
  
  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.loadFile('index.html');
  
  // Position window on startup
  positionWindowOnCurrentScreen();
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function positionWindowOnCurrentScreen() {
  if (!mainWindow) {
    createMainWindow();
  }

  // Get current cursor position to determine which screen we're on
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const { x, y, width, height } = display.workArea;
  
  // Position window in top-right of the screen where cursor is
  const windowWidth = 500;
  const windowHeight = 650;
  const windowX = x + width - windowWidth - 20; // 20px margin from right
  const windowY = y + 20; // 20px margin from top
  
  // Ensure window is visible on current workspace only (for Windows virtual desktops)
  mainWindow.setVisibleOnAllWorkspaces(false);
  
  // Set window position and size
  mainWindow.setBounds({
    x: windowX,
    y: windowY,
    width: windowWidth,
    height: windowHeight
  });
  
  // Show the window first (important for virtual desktop switching)
  mainWindow.show();
  
  // Ensure it's always on top
  mainWindow.setAlwaysOnTop(true);
  
  // Focus and activate the window (brings it to current virtual desktop)
  // On Windows, this should automatically move the window to the active virtual desktop
  mainWindow.focus();
  mainWindow.moveTop();
  
  // Force window activation on Windows to ensure it appears on current virtual desktop
  if (process.platform === 'win32') {
    // Use flashFrame to ensure window is brought to foreground on current desktop
    mainWindow.flashFrame(false);
    mainWindow.focus();
  }
}

function sendToMain(channel, payload) {
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function broadcastAppState() {
  sendToMain('app-state-update', {
    ...appState,
    historyCount: translationHistory.length
  });

  if (tray) {
    tray.setContextMenu(buildTrayMenu());
  }
}

function addTranslationHistory(entry) {
  const historyItem = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...entry
  };

  translationHistory.unshift(historyItem);
  translationHistory.splice(MAX_HISTORY_ITEMS);
  sendToMain('history-update', translationHistory);
  broadcastAppState();
}

async function translateAndPublish(text, options = {}) {
  const original = String(text || '').trim();
  if (!original) {
    throw new Error('No text provided for translation');
  }

  const mode = options.mode || 'translation';
  const sourceLang = options.sourceLang || appState.sourceLang;
  const targetLang = options.targetLang || appState.targetLang;
  const sourceLabel = options.sourceLabel || 'Text';

  if (options.showMain) {
    positionWindowOnCurrentScreen();
  }

  sendToMain('translation-update', {
    mode,
    sourceLabel,
    original,
    translating: true
  });

  const resolvedSourceLang = sourceLang === 'auto' ? await detectLanguage(original) : sourceLang;
  const translation = await translateText(original, resolvedSourceLang, targetLang);

  const result = {
    mode,
    sourceLabel,
    original,
    translation,
    sourceLang: resolvedSourceLang,
    targetLang
  };

  sendToMain('translation-update', result);
  addTranslationHistory(result);

  if (options.overlay) {
    createOverlayWindow(
      options.overlay.x,
      options.overlay.y,
      options.overlay.width,
      options.overlay.height,
      {
        ...result,
        autoCloseMs: options.autoCloseMs ?? 18000
      },
      options.overlayOptions || {}
    );
  }

  return result;
}

async function checkClipboard() {
  try {
    if (!appState.clipboardMonitoring) {
      return;
    }

    const currentText = clipboard.readText();

    if (currentText && currentText !== lastClipboardText && currentText.trim().length > 0) {
      if (containsJapanese(currentText)) {
        lastClipboardText = currentText;

        try {
          const result = await translateAndPublish(currentText, {
            mode: 'clipboard',
            sourceLabel: 'Clipboard',
            showMain: true
          });

          if (mainWindow) {
            mainWindow.setAlwaysOnTop(true);
            mainWindow.focus();
            mainWindow.moveTop();
          }

          return result;
        } catch (error) {
          console.error('Translation error:', error);
          sendToMain('translation-update', {
            error: error.message
          });
        }
      }
    }
  } catch (error) {
    console.log('Clipboard check skipped:', error.message);
  }
}

app.whenReady().then(() => {
  console.log('Polaris ready, initializing...');
  
  // Create main window (but don't show it yet - will show when Japanese detected)
  createMainWindow();
  
  // Create tray (optional - app works without it)
  try {
    createTray();
    console.log('✓ Tray icon created');
  } catch (error) {
    console.log('Could not create tray:', error.message);
  }

  registerShortcuts();

  // Start clipboard monitoring
  clipboardCheckInterval = setInterval(checkClipboard, 500);
  console.log('✓ Clipboard monitoring started - window will appear when Japanese text is detected');
  broadcastAppState();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    positionWindowOnCurrentScreen();
  }
});

app.on('window-all-closed', () => {
  // Keep app running in background (tray)
  if (process.platform !== 'darwin') {
    // Don't quit on Windows/Linux
  }
});

app.on('will-quit', async () => {
  if (clipboardCheckInterval) {
    clearInterval(clipboardCheckInterval);
  }
  stopLiveTranslation();
  globalShortcut.unregisterAll();
  await terminateOCR().catch(() => {});
});

function registerShortcuts() {
  const shortcuts = [
    {
      accelerator: 'CommandOrControl+Shift+T',
      label: 'selected text translation',
      handler: () => translateCurrentSelection()
    },
    {
      accelerator: 'CommandOrControl+Shift+O',
      label: 'OCR snip',
      handler: () => {
        console.log('OCR shortcut triggered');
        sendToMain('trigger-ocr-snip');
      }
    },
    {
      accelerator: 'CommandOrControl+Shift+S',
      label: 'live screen translation',
      handler: () => toggleLiveTranslation()
    }
  ];

  for (const shortcut of shortcuts) {
    const registered = globalShortcut.register(shortcut.accelerator, shortcut.handler);
    if (!registered) {
      console.log(`Failed to register ${shortcut.label} shortcut (${shortcut.accelerator})`);
    } else {
      console.log(`✓ ${shortcut.label} shortcut registered (${shortcut.accelerator})`);
    }
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Show Polaris',
      click: () => {
        positionWindowOnCurrentScreen();
      }
    },
    {
      label: 'Translate Selected Text',
      accelerator: 'CommandOrControl+Shift+T',
      click: () => {
        translateCurrentSelection();
      }
    },
    {
      label: 'OCR Snip Translate',
      accelerator: 'CommandOrControl+Shift+O',
      click: () => {
        sendToMain('trigger-ocr-snip');
        positionWindowOnCurrentScreen();
      }
    },
    {
      label: appState.liveTranslationEnabled ? 'Stop Live Screen Translate' : 'Start Live Screen Translate',
      accelerator: 'CommandOrControl+Shift+S',
      click: () => {
        toggleLiveTranslation();
      }
    },
    { type: 'separator' },
    {
      label: appState.clipboardMonitoring ? 'Pause Clipboard Monitoring' : 'Resume Clipboard Monitoring',
      click: () => {
        appState.clipboardMonitoring = !appState.clipboardMonitoring;
        broadcastAppState();
      }
    },
    {
      label: 'Clear Overlay',
      click: () => {
        clearOverlay();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    const fs = require('fs');
    
    // Check if icon exists, otherwise use default or no icon
    if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath);
    } else {
      // Use nativeImage to create a simple default icon
      const { nativeImage } = require('electron');
      const icon = nativeImage.createEmpty();
      tray = new Tray(icon);
    }
    tray.setToolTip('Polaris - Language, illuminated');
    tray.setContextMenu(buildTrayMenu());
    
    tray.on('click', () => {
      positionWindowOnCurrentScreen();
    });
  } catch (error) {
    console.log('Tray creation skipped:', error.message);
    // App will still work without tray icon
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function translateCurrentSelection() {
  if (selectedTextBusy) {
    return { success: false, error: 'Selected text translation is already running' };
  }

  selectedTextBusy = true;

  try {
    const selectedText = await readSelectedTextViaClipboard();

    if (!selectedText) {
      throw new Error('Select text in any app, then press Ctrl/Cmd+Shift+T again.');
    }

    const cursor = screen.getCursorScreenPoint();
    const overlayBounds = {
      x: cursor.x + 16,
      y: cursor.y + 16,
      width: 420,
      height: 120
    };

    const result = await translateAndPublish(selectedText, {
      mode: 'selected-text',
      sourceLabel: 'Selected text',
      showMain: false,
      overlay: overlayBounds,
      overlayOptions: {
        placement: 'cursor',
        clickThrough: true
      }
    });

    return { success: true, ...result };
  } catch (error) {
    console.error('Selected text translation failed:', error);
    createOverlayWindowFromCursor({
      mode: 'error',
      sourceLabel: 'Selected text',
      translation: error.message,
      autoCloseMs: 9000
    });
    sendToMain('translation-update', {
      error: error.message,
      mode: 'selected-text',
      sourceLabel: 'Selected text'
    });
    return { success: false, error: error.message };
  } finally {
    selectedTextBusy = false;
  }
}

async function readSelectedTextViaClipboard() {
  const previousText = clipboard.readText();
  const hadTextClipboard = clipboard.availableFormats().some((format) => format.includes('text'));

  await sendCopyShortcut();
  await delay(180);

  const selectedText = clipboard.readText().trim();

  if (hadTextClipboard) {
    setTimeout(() => {
      try {
        clipboard.writeText(previousText);
      } catch (error) {
        console.log('Could not restore previous clipboard text:', error.message);
      }
    }, 250);
  }

  return selectedText;
}

async function sendCopyShortcut() {
  if (process.platform === 'darwin') {
    await execFileAsync('osascript', [
      '-e',
      'tell application "System Events" to keystroke "c" using command down'
    ], { timeout: 1500 });
    return;
  }

  if (process.platform === 'win32') {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-STA',
      '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^c")'
    ], { timeout: 1500 });
    return;
  }

  await execFileAsync('xdotool', ['key', 'ctrl+c'], { timeout: 1500 });
}

function toggleLiveTranslation() {
  if (appState.liveTranslationEnabled) {
    stopLiveTranslation();
    return { success: true, enabled: false };
  }

  startLiveTranslation();
  return { success: true, enabled: true };
}

function startLiveTranslation() {
  if (liveTranslationInterval) {
    return;
  }

  appState.liveTranslationEnabled = true;
  appState.liveStatus = 'Watching the visible screen';
  liveLastSignature = '';
  broadcastAppState();
  runLiveTranslationCycle();
  liveTranslationInterval = setInterval(runLiveTranslationCycle, 4500);
}

function stopLiveTranslation() {
  if (liveTranslationInterval) {
    clearInterval(liveTranslationInterval);
    liveTranslationInterval = null;
  }

  appState.liveTranslationEnabled = false;
  appState.liveStatus = 'Stopped';
  liveTranslationBusy = false;
  liveLastSignature = '';
  broadcastAppState();
}

async function runLiveTranslationCycle() {
  if (!appState.liveTranslationEnabled || liveTranslationBusy) {
    return;
  }

  liveTranslationBusy = true;

  try {
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const bounds = display.workArea;

    appState.liveStatus = 'Capturing visible screen';
    broadcastAppState();

    const imageBuffer = await captureScreenBounds(bounds, { hideOverlay: true });

    appState.liveStatus = 'Reading screen text';
    broadcastAppState();

    const extractedText = await extractTextFromImage(Buffer.from(imageBuffer));
    const signature = createTextSignature(extractedText);

    if (!extractedText || !containsJapanese(extractedText)) {
      appState.liveStatus = 'No Japanese text visible';
      broadcastAppState();
      return;
    }

    if (signature === liveLastSignature) {
      appState.liveStatus = 'Waiting for visible text to change';
      broadcastAppState();
      return;
    }

    liveLastSignature = signature;
    appState.liveStatus = 'Translating visible screen';
    broadcastAppState();

    const overlayWidth = Math.min(460, Math.max(360, Math.floor(bounds.width * 0.34)));
    await translateAndPublish(extractedText, {
      mode: 'live-screen',
      sourceLabel: 'Live screen',
      showMain: false,
      overlay: {
        x: bounds.x + bounds.width - overlayWidth - 24,
        y: bounds.y + 24,
        width: overlayWidth,
        height: 180
      },
      overlayOptions: {
        placement: 'fixed',
        persistent: true,
        clickThrough: true
      },
      autoCloseMs: 0
    });

    appState.liveStatus = 'Live translation updated';
    broadcastAppState();
  } catch (error) {
    console.error('Live screen translation failed:', error);
    appState.liveStatus = error.message;
    broadcastAppState();
  } finally {
    liveTranslationBusy = false;
  }
}

function createTextSignature(text) {
  return String(text || '')
    .replace(/\s+/g, '')
    .slice(0, 1200);
}

async function captureScreenBounds(bounds, options = {}) {
  const targetDisplay = screen.getDisplayNearestPoint({
    x: bounds.x + Math.max(1, bounds.width / 2),
    y: bounds.y + Math.max(1, bounds.height / 2)
  });

  let overlayWasVisible = false;
  if (options.hideOverlay && overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWasVisible = overlayWindow.isVisible();
    overlayWindow.hide();
    await delay(120);
  }

  try {
    const thumbnailSize = {
      width: Math.max(Math.round(targetDisplay.size.width * targetDisplay.scaleFactor), 1920),
      height: Math.max(Math.round(targetDisplay.size.height * targetDisplay.scaleFactor), 1080)
    };

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize
    });

    if (!sources.length) {
      throw new Error('No screen sources available');
    }

    const source = findScreenSourceForDisplay(sources, targetDisplay);
    const image = source.thumbnail;
    const imageSize = image.getSize();
    const displayBounds = targetDisplay.bounds;
    const scaleX = imageSize.width / displayBounds.width;
    const scaleY = imageSize.height / displayBounds.height;

    const adjustedBounds = {
      x: Math.round((bounds.x - displayBounds.x) * scaleX),
      y: Math.round((bounds.y - displayBounds.y) * scaleY),
      width: Math.round(bounds.width * scaleX),
      height: Math.round(bounds.height * scaleY)
    };

    adjustedBounds.x = Math.max(0, Math.min(adjustedBounds.x, imageSize.width - 1));
    adjustedBounds.y = Math.max(0, Math.min(adjustedBounds.y, imageSize.height - 1));
    adjustedBounds.width = Math.max(1, Math.min(adjustedBounds.width, imageSize.width - adjustedBounds.x));
    adjustedBounds.height = Math.max(1, Math.min(adjustedBounds.height, imageSize.height - adjustedBounds.y));

    const img = nativeImage.createFromDataURL(image.toDataURL());
    return img.crop(adjustedBounds).toPNG();
  } finally {
    if (overlayWasVisible && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.showInactive();
    }
  }
}

function findScreenSourceForDisplay(sources, display) {
  return sources.find((source) => source.display_id === String(display.id)) || sources[0];
}

function clearOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
  currentOverlayData = null;
}

function createOverlayWindowFromCursor(payload) {
  const cursor = screen.getCursorScreenPoint();
  createOverlayWindow(
    cursor.x + 16,
    cursor.y + 16,
    420,
    120,
    payload,
    { placement: 'cursor', clickThrough: true }
  );
}

// IPC Handlers
ipcMain.handle('translate', async (event, text, sourceLang = 'ja', targetLang = 'en') => {
  try {
    const result = await translateText(text, sourceLang, targetLang);
    return { success: true, translation: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-clipboard', async () => {
  return clipboard.readText();
});

ipcMain.handle('get-app-state', async () => ({
  ...appState,
  historyCount: translationHistory.length
}));

ipcMain.handle('get-history', async () => translationHistory);

ipcMain.handle('translate-selection', async () => {
  return await translateCurrentSelection();
});

ipcMain.handle('translate-clipboard-now', async () => {
  try {
    const text = clipboard.readText();
    const result = await translateAndPublish(text, {
      mode: 'clipboard-manual',
      sourceLabel: 'Clipboard',
      showMain: true
    });
    return { success: true, ...result };
  } catch (error) {
    sendToMain('translation-update', {
      error: error.message,
      mode: 'clipboard-manual',
      sourceLabel: 'Clipboard'
    });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('toggle-live-translation', async () => {
  return toggleLiveTranslation();
});

ipcMain.handle('toggle-clipboard-monitoring', async () => {
  appState.clipboardMonitoring = !appState.clipboardMonitoring;
  broadcastAppState();
  return {
    success: true,
    enabled: appState.clipboardMonitoring
  };
});

ipcMain.handle('resize-window', async (event, width, height) => {
  if (mainWindow) {
    const currentBounds = mainWindow.getBounds();
    const newHeight = Math.min(Math.max(height, 400), 900); // Min 400px, max 900px
    mainWindow.setBounds({
      x: currentBounds.x,
      y: currentBounds.y,
      width: width || currentBounds.width,
      height: newHeight
    });
  }
});

// Create selection overlay window for screen area selection
function createSelectionWindow() {
  if (selectionWindow) {
    selectionWindow.focus();
    return;
  }

  // Get all displays and create a window that covers all screens
  const displays = screen.getAllDisplays();
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  
  displays.forEach(display => {
    const { x, y, width, height } = display.bounds;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  selectionWindow = new BrowserWindow({
    width: maxX - minX,
    height: maxY - minY,
    x: minX,
    y: minY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    acceptFirstMouse: true,
    fullscreen: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  selectionWindow.loadFile('src/overlay/selection.html');
  selectionWindow.setIgnoreMouseEvents(false, { forward: true });

  // Focus the window when ready
  selectionWindow.webContents.once('did-finish-load', () => {
    console.log('Selection window finished loading');
    selectionWindow.focus();
    selectionWindow.setAlwaysOnTop(true, 'screen-saver'); // Highest level
    
    // Store the window offset for coordinate adjustment
    selectionWindow.webContents.executeJavaScript(`
      console.log('Injecting WINDOW_OFFSET:', { x: ${minX}, y: ${minY} });
      window.WINDOW_OFFSET = { x: ${minX}, y: ${minY} };
    `);
  });

  // Note: Global shortcuts for single keys like Escape don't work well
  // We rely on window focus and document event listeners instead

  selectionWindow.on('closed', () => {
    console.log('Selection window closed');
    selectionWindow = null;
    
    // Ensure main window is visible
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Create translation overlay window
function createOverlayWindow(x, y, width, height, translationPayload, options = {}) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }

  const payload = normalizeOverlayPayload(translationPayload);
  currentOverlayData = { x, y, width, height, translation: payload, options };

  const display = screen.getDisplayNearestPoint({ x, y });
  const displayBounds = display.workArea || display.bounds;
  const baseWidth = Math.max(width, options.minWidth || 280);
  const combinedText = `${payload.sourceLabel || ''} ${payload.original || ''} ${payload.translation || ''}`;
  const charCount = combinedText.length;
  const charsPerLine = Math.max(24, Math.floor(baseWidth / 8.5));
  const estimatedLines = Math.ceil(charCount / charsPerLine);
  const overlayWidth = Math.min(Math.max(baseWidth, 320), options.maxWidth || 720);
  const overlayHeight = Math.min(
    Math.max(height || 96, estimatedLines * 22 + 82),
    options.maxHeight || 520
  );

  let overlayX = x;
  let overlayY = y - overlayHeight - 10;

  if (options.placement === 'fixed') {
    overlayX = x;
    overlayY = y;
  } else if (options.placement === 'cursor') {
    overlayX = x;
    overlayY = y;
  } else if (overlayY < displayBounds.y) {
    overlayY = y + height + 10;
  }

  overlayX = Math.max(displayBounds.x, Math.min(overlayX, displayBounds.x + displayBounds.width - overlayWidth));
  overlayY = Math.max(displayBounds.y, Math.min(overlayY, displayBounds.y + displayBounds.height - overlayHeight));

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: overlayX,
    y: overlayY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  overlayWindow.overlayDimensions = { width: overlayWidth, height: overlayHeight };
  overlayWindow.loadFile('src/overlay/translation.html');

  overlayWindow.webContents.once('did-finish-load', () => {
    overlayWindow.webContents.send('set-translation', {
      ...payload,
      autoCloseMs: options.persistent ? 0 : payload.autoCloseMs
    });

    if (options.clickThrough !== false) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function normalizeOverlayPayload(payload) {
  if (typeof payload === 'string') {
    return {
      mode: 'translation',
      sourceLabel: 'Translation',
      translation: payload,
      autoCloseMs: 15000
    };
  }

  return {
    mode: payload?.mode || 'translation',
    sourceLabel: payload?.sourceLabel || 'Translation',
    original: payload?.original || '',
    translation: payload?.translation || 'Translation not available',
    sourceLang: payload?.sourceLang || appState.sourceLang,
    targetLang: payload?.targetLang || appState.targetLang,
    autoCloseMs: payload?.autoCloseMs ?? 15000
  };
}

// IPC Handlers for OCR
ipcMain.handle('start-screen-selection', async () => {
  console.log('Starting screen selection...');
  
  // Hide main window so it doesn't appear in the screenshot
  if (mainWindow) {
    mainWindow.hide();
    console.log('Main window hidden for screenshot');
  }
  
  createSelectionWindow();
  return { success: true };
});

ipcMain.handle('capture-screen-region', async (event, bounds) => {
  try {
    return await captureScreenBounds(bounds, { hideOverlay: true });
  } catch (error) {
    console.error('Screen capture error:', error);
    throw error;
  }
});

ipcMain.handle('process-ocr', async (event, imageBuffer, bounds) => {
  try {
    const extractedText = await extractTextFromImage(Buffer.from(imageBuffer));
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text found in the selected area');
    }

    const result = await translateAndPublish(extractedText, {
      mode: 'ocr-snip',
      sourceLabel: 'OCR snip',
      showMain: false,
      overlay: bounds,
      overlayOptions: {
        placement: 'area',
        clickThrough: true
      }
    });

    return {
      success: true,
      original: result.original,
      translation: result.translation
    };
  } catch (error) {
    console.error('OCR processing error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('close-selection-window', async () => {
  console.log('Closing selection window...');
  if (selectionWindow) {
    selectionWindow.close();
  }
  
  // Show main window again
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    console.log('Main window shown again');
  }
});

// Handle selection cancellation
ipcMain.on('selection-cancelled', () => {
  console.log('Selection cancelled by user');
  
  // Show main window again
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
  
  // Re-enable button in renderer
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('ocr-result', {
      success: false,
      error: 'Selection cancelled',
      cancelled: true
    });
  }
});

// Handle selection complete (show loading immediately)
ipcMain.on('selection-complete', () => {
  console.log('Selection complete, showing loading...');
  sendOCRStage('Processing selection...');
});

// Send processing stage update to renderer
function sendOCRStage(message) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('ocr-processing-stage', { message });
  }
}

// Handle selected region from selection window
ipcMain.handle('process-selected-region', async (event, bounds) => {
  console.log('Processing selected region:', bounds);
  
  try {
    sendOCRStage('Capturing screen...');
    if (selectionWindow && !selectionWindow.isDestroyed()) {
      selectionWindow.hide();
      await delay(120);
    }

    const imageBuffer = await captureScreenBounds(bounds, { hideOverlay: true });

    sendOCRStage('Extracting text with OCR...');
    const extractedText = await extractTextFromImage(Buffer.from(imageBuffer));
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text found in the selected area. Please try selecting a different area.');
    }

    sendOCRStage('Translating text...');
    const result = await translateAndPublish(extractedText, {
      mode: 'ocr-snip',
      sourceLabel: 'OCR snip',
      showMain: false,
      overlay: bounds,
      overlayOptions: {
        placement: 'area',
        clickThrough: true
      }
    });

    sendToMain('ocr-result', {
      success: true,
      original: result.original,
      translation: result.translation
    });

    return {
      success: true,
      original: result.original,
      translation: result.translation
    };
  } catch (error) {
    console.error('OCR processing error:', error);
    
    sendToMain('ocr-result', {
      success: false,
      error: error.message || 'Unknown error occurred'
    });
    
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
});

ipcMain.handle('show-overlay', async (event, bounds, translation) => {
  if (bounds && translation) {
    createOverlayWindow(bounds.x, bounds.y, bounds.width, bounds.height, translation, {
      clickThrough: true
    });
  } else if (currentOverlayData) {
    createOverlayWindow(
      currentOverlayData.x,
      currentOverlayData.y,
      currentOverlayData.width,
      currentOverlayData.height,
      currentOverlayData.translation,
      currentOverlayData.options || {}
    );
  }
});

ipcMain.handle('clear-overlay', async () => {
  clearOverlay();
});
