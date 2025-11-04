const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, clipboard, screen, desktopCapturer } = require('electron');
const path = require('path');
const { translateText, detectLanguage } = require('./src/services/translationService');
const { extractTextFromImage } = require('./src/services/ocrService');

let mainWindow = null;
let overlayWindow = null;
let selectionWindow = null;
let tray = null;
let lastClipboardText = '';
let clipboardCheckInterval = null;
let currentOverlayData = null;

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
function createOverlayWindow(x, y, width, height, translation) {
  // Close existing overlay
  if (overlayWindow) {
    overlayWindow.close();
  }

  currentOverlayData = { x, y, width, height, translation };

  // Calculate overlay size based on translation length
  const baseWidth = Math.max(width, 250);
  const charCount = translation.length;
  const estimatedWidth = Math.min(Math.max(baseWidth, charCount * 8), 700);
  const estimatedHeight = Math.max(70, Math.ceil(charCount / 50) * 30);
  
  const overlayWidth = estimatedWidth;
  const overlayHeight = Math.min(estimatedHeight, 200);

  // Position overlay above the selected area, or below if not enough space
  let overlayX = x;
  let overlayY = y - overlayHeight - 10;

  // If overlay would go off screen, position it below
  const displays = screen.getAllDisplays();
  const display = screen.getDisplayNearestPoint({ x, y });
  if (overlayY < display.bounds.y) {
    overlayY = y + height + 10;
  }

  // Ensure overlay stays within screen bounds
  overlayX = Math.max(display.bounds.x, Math.min(overlayX, display.bounds.x + display.bounds.width - overlayWidth));
  overlayY = Math.max(display.bounds.y, Math.min(overlayY, display.bounds.y + display.bounds.height - overlayHeight));

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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  overlayWindow.loadFile('src/overlay/translation.html');
  overlayWindow.webContents.once('did-finish-load', () => {
    console.log('Translation overlay window loaded, sending translation');
    overlayWindow.webContents.send('set-translation', translation);
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
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
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });

    if (sources.length === 0) {
      throw new Error('No screen sources available');
    }

    // Get the primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = bounds;

    // Capture the selected region
    const source = sources[0];
    const image = source.thumbnail;
    
    // Crop the image to the selected region
    const { nativeImage } = require('electron');
    const img = nativeImage.createFromDataURL(image.toDataURL());
    const cropped = img.crop({ x, y, width, height });

    return cropped.toPNG();
  } catch (error) {
    console.error('Screen capture error:', error);
    throw error;
  }
});

ipcMain.handle('process-ocr', async (event, imageBuffer, bounds) => {
  try {
    // Extract text using OCR
    const extractedText = await extractTextFromImage(Buffer.from(imageBuffer));
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text found in the selected area');
    }

    // Translate the text
    const translation = await translateText(extractedText.trim(), 'ja', 'en');

    // Show overlay with translation
    createOverlayWindow(bounds.x, bounds.y, bounds.width, bounds.height, translation);

    return {
      success: true,
      original: extractedText.trim(),
      translation: translation
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
    // Notify renderer: Capturing screen
    sendOCRStage('Capturing screen...');
    console.log('Stage: Capturing screen...');
    
    // Capture the screen region with higher resolution
    const imageBuffer = await new Promise(async (resolve, reject) => {
      try {
        // Get primary display size for better resolution
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.size;
        
        // Use larger thumbnail size for better quality
        const thumbnailSize = {
          width: Math.max(screenWidth, 1920),
          height: Math.max(screenHeight, 1080)
        };
        
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: thumbnailSize
        });

        if (sources.length === 0) {
          reject(new Error('No screen sources available'));
          return;
        }

        // Use the source that matches the bounds location
        let source = sources[0];
        if (sources.length > 1) {
          // Try to find the correct display
          const displays = screen.getAllDisplays();
          const targetDisplay = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
          
          // Find source that matches the display
          for (const s of sources) {
            if (s.display_id && s.display_id === targetDisplay.id.toString()) {
              source = s;
              break;
            }
          }
        }
        
        const image = source.thumbnail;
        const { nativeImage } = require('electron');
        const img = nativeImage.createFromDataURL(image.toDataURL());
        
        // Get actual image size
        const actualSize = image.getSize();
        
        // Calculate scale factor based on actual thumbnail size vs screen size
        // The thumbnail might be scaled down, so we need to adjust coordinates
        const displays = screen.getAllDisplays();
        const targetDisplay = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
        const displayBounds = targetDisplay.bounds;
        
        // Calculate scale: thumbnail width / display width
        const scaleX = actualSize.width / displayBounds.width;
        const scaleY = actualSize.height / displayBounds.height;
        
        // Adjust bounds relative to display position and scale
        const adjustedBounds = {
          x: Math.round((bounds.x - displayBounds.x) * scaleX),
          y: Math.round((bounds.y - displayBounds.y) * scaleY),
          width: Math.round(bounds.width * scaleX),
          height: Math.round(bounds.height * scaleY)
        };
        
        // Ensure bounds are within image
        adjustedBounds.x = Math.max(0, Math.min(adjustedBounds.x, actualSize.width - 1));
        adjustedBounds.y = Math.max(0, Math.min(adjustedBounds.y, actualSize.height - 1));
        adjustedBounds.width = Math.min(adjustedBounds.width, actualSize.width - adjustedBounds.x);
        adjustedBounds.height = Math.min(adjustedBounds.height, actualSize.height - adjustedBounds.y);
        
        const cropped = img.crop(adjustedBounds);
        
        resolve(cropped.toPNG());
      } catch (error) {
        console.error('Screen capture error:', error);
        reject(error);
      }
    });

    // Notify renderer: Extracting text
    sendOCRStage('Extracting text with OCR...');
    console.log('Stage: Extracting text with OCR...');
    
    // Process OCR
    const extractedText = await extractTextFromImage(Buffer.from(imageBuffer));
    console.log('OCR extracted text:', extractedText);
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text found in the selected area. Please try selecting a different area.');
    }

    // Notify renderer: Translating
    sendOCRStage('Translating text...');
    console.log('Stage: Translating text...');
    
    // Translate the text
    const translation = await translateText(extractedText.trim(), 'ja', 'en');
    console.log('Translation complete:', translation);

    // Show overlay with translation
    console.log('Creating overlay window at:', { x: bounds.x, y: bounds.y });
    createOverlayWindow(bounds.x, bounds.y, bounds.width, bounds.height, translation);

    // Send result to renderer
    console.log('Sending OCR result to main window');
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('ocr-result', {
        success: true,
        original: extractedText.trim(),
        translation: translation
      });
    }

    return {
      success: true,
      original: extractedText.trim(),
      translation: translation
    };
  } catch (error) {
    console.error('OCR processing error:', error);
    
    // Send error to renderer
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('ocr-result', {
        success: false,
        error: error.message || 'Unknown error occurred'
      });
    }
    
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
});

ipcMain.handle('show-overlay', async (event, bounds, translation) => {
  if (bounds && translation) {
    createOverlayWindow(bounds.x, bounds.y, bounds.width, bounds.height, translation);
  } else if (currentOverlayData) {
    createOverlayWindow(
      currentOverlayData.x,
      currentOverlayData.y,
      currentOverlayData.width,
      currentOverlayData.height,
      currentOverlayData.translation
    );
  }
});

ipcMain.handle('clear-overlay', async () => {
  if (overlayWindow) {
    overlayWindow.close();
  }
  currentOverlayData = null;
});
