const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, clipboard, screen } = require('electron');
const path = require('path');
const { translateText, detectLanguage } = require('./src/services/translationService');

let mainWindow = null;
let tray = null;
let lastClipboardText = '';
let clipboardCheckInterval = null;

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

async function checkClipboard() {
  try {
    const currentText = clipboard.readText();
    
    // Only process if clipboard changed and contains text
    if (currentText && currentText !== lastClipboardText && currentText.trim().length > 0) {
      // Check if text contains Japanese characters
      const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
      
      if (japaneseRegex.test(currentText)) {
        lastClipboardText = currentText;
        
        // Position window on the same screen as cursor and show it
        positionWindowOnCurrentScreen();
        
        // Send translation update to window
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('translation-update', {
            original: currentText.trim(),
            translating: true
          });
        } else {
          // Wait a bit for window to load, then send translation
          setTimeout(() => {
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('translation-update', {
                original: currentText.trim(),
                translating: true
              });
            }
          }, 300);
        }
        
        // Translate the text
        try {
          const translation = await translateText(currentText.trim(), 'ja', 'en');
          
        // Send translation to main window
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('translation-update', {
            original: currentText.trim(),
            translation: translation
          });
          
          // Ensure window stays on top after translation
          mainWindow.setAlwaysOnTop(true);
          mainWindow.focus();
          mainWindow.moveTop();
        }
        } catch (error) {
          console.error('Translation error:', error);
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('translation-update', {
              error: error.message
            });
          }
        }
      }
    }
  } catch (error) {
    // Clipboard might be empty or not text
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

  // Start clipboard monitoring
  clipboardCheckInterval = setInterval(checkClipboard, 500);
  console.log('✓ Clipboard monitoring started - window will appear when Japanese text is detected');
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

app.on('will-quit', () => {
  if (clipboardCheckInterval) {
    clearInterval(clipboardCheckInterval);
  }
  globalShortcut.unregisterAll();
});

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
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Window',
        click: () => {
          positionWindowOnCurrentScreen();
        }
      },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);
    
    tray.setToolTip('Polaris - Language, illuminated');
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
      positionWindowOnCurrentScreen();
    });
  } catch (error) {
    console.log('Tray creation skipped:', error.message);
    // App will still work without tray icon
  }
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
