const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  clipboard,
  globalShortcut,
  ipcMain,
  screen,
  nativeImage,
} = require("electron");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const {
  translateText,
  containsJapanese,
} = require("./src/services/translationService");

const execFileAsync = promisify(execFile);
const DEFAULT_SHORTCUT_TRANSLATE_SELECTION = "CommandOrControl+Shift+T";
const CLIPBOARD_POLL_MS = 900;
const MAX_HISTORY_ITEMS = 40;

let mainWindow = null;
let bubbleWindow = null;
let tray = null;
let clipboardTimer = null;
let lastClipboardText = "";
let isQuitting = false;
let isTranslatingSelection = false;

const state = {
  clipboardMonitoring: true,
  busy: false,
  sourceLang: "auto",
  targetLang: "en",
  provider: "Free APIs",
  shortcut: DEFAULT_SHORTCUT_TRANSLATE_SELECTION,
};

const history = [];

app.whenReady().then(() => {
  createMainWindow();
  createTray();
  registerShortcuts();
  startClipboardMonitoring();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  } else {
    showMainWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (clipboardTimer) {
    clearInterval(clipboardTimer);
  }
});

app.on("window-all-closed", () => {
  // Keep the tray app alive until the user explicitly quits.
});

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  const iconPath = path.join(__dirname, "assets", "icon.png");

  mainWindow = new BrowserWindow({
    width: 780,
    height: 640,
    minWidth: 620,
    minHeight: 520,
    show: false,
    title: "Polaris",
    backgroundColor: "#f6f7fb",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile("index.html");
  mainWindow.once("ready-to-show", () => {
    showMainWindow();
    emitState();
    emitHistory();
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

function showMainWindow() {
  const win = createMainWindow();
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}

function createTray() {
  const iconPath = path.join(__dirname, "assets", "icon.png");
  let icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  if (!icon.isEmpty()) {
    if (process.platform === "darwin") {
      // macOS status bar icons should be small and template-ready.
      icon = icon.resize({ width: 18, height: 18 });
      icon.setTemplateImage(true);
    } else if (process.platform === "win32") {
      icon = icon.resize({ width: 16, height: 16 });
    } else {
      icon = icon.resize({ width: 22, height: 22 });
    }
  }

  tray = new Tray(icon);
  tray.setToolTip("Polaris");
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Polaris", click: showMainWindow },
      {
        label: "Translate Selected Text",
        accelerator: state.shortcut,
        click: translateSelection,
      },
      { label: "Translate Clipboard", click: translateClipboard },
      { type: "separator" },
      {
        label: state.clipboardMonitoring
          ? "Pause Clipboard Monitoring"
          : "Resume Clipboard Monitoring",
        click: toggleClipboardMonitoring,
      },
      { label: "Clear History", click: clearHistory },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function registerShortcuts() {
  const registered = globalShortcut.register(
    state.shortcut,
    translateSelection,
  );
  if (!registered) {
    emitTranslation({
      ok: false,
      error: `Could not register shortcut ${formatShortcutLabel(state.shortcut)}.`,
      sourceLabel: "Settings",
    });
  }
  refreshTrayMenu();
}

function startClipboardMonitoring() {
  lastClipboardText = clipboard.readText();
  clipboardTimer = setInterval(async () => {
    if (!state.clipboardMonitoring || state.busy || isTranslatingSelection) {
      return;
    }

    const text = clipboard.readText();
    if (!text || text === lastClipboardText || !containsJapanese(text)) {
      return;
    }

    lastClipboardText = text;
    await translateFromText(text, {
      mode: "clipboard",
      sourceLabel: "Clipboard",
      showBubble: false,
      revealMain: true,
    });
  }, CLIPBOARD_POLL_MS);
}

async function translateSelection() {
  if (isTranslatingSelection) {
    return { ok: false, error: "Selection translation is already running." };
  }

  if (state.busy) {
    return { ok: false, error: "Polaris is already translating." };
  }

  isTranslatingSelection = true;

  try {
    updateState({ busy: true });
    const text = await readSelectedText();

    if (!text) {
      throw new Error(
        "Select text in another app, then press Ctrl/Cmd+Shift+T again.",
      );
    }

    return await translateFromText(text, {
      mode: "selection",
      sourceLabel: "Selected text",
      showBubble: true,
      revealMain: false,
    });
  } catch (error) {
    const result = handleTranslationError(error, "Selected text");
    showBubble({
      sourceLabel: "Selected text",
      translation: result.error,
      isError: true,
    });
    return result;
  } finally {
    isTranslatingSelection = false;
    lastClipboardText = clipboard.readText();
  }
}

async function translateClipboard() {
  if (state.busy) {
    return { ok: false, error: "Polaris is already translating." };
  }

  const text = clipboard.readText();
  if (!text.trim()) {
    return handleTranslationError(
      new Error("Clipboard does not contain text."),
      "Clipboard",
    );
  }

  return await translateFromText(text, {
    mode: "clipboard-manual",
    sourceLabel: "Clipboard",
    showBubble: false,
    revealMain: true,
  });
}

async function translateManual(_event, payload = {}) {
  if (state.busy) {
    return { ok: false, error: "Polaris is already translating." };
  }

  if (payload.sourceLang || payload.targetLang) {
    updateLanguages(payload.sourceLang, payload.targetLang);
  }

  return await translateFromText(payload.text || "", {
    mode: "manual",
    sourceLabel: "Manual input",
    showBubble: false,
    revealMain: false,
  });
}

async function translateFromText(text, options) {
  try {
    updateState({ busy: true });

    const result = await translateText(text, {
      sourceLang: options.sourceLang || state.sourceLang,
      targetLang: options.targetLang || state.targetLang,
    });

    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      mode: options.mode,
      sourceLabel: options.sourceLabel,
      original: result.original,
      translation: result.translation,
      sourceLang: result.sourceLang,
      targetLang: result.targetLang,
      provider: result.provider,
    };

    addHistoryItem(item);
    emitTranslation({ ok: true, item });
    updateState({ busy: false });

    if (options.showBubble) {
      showBubble(item);
    }

    if (options.revealMain) {
      showMainWindow();
    }

    return { ok: true, item };
  } catch (error) {
    return handleTranslationError(error, options.sourceLabel);
  }
}

async function readSelectedText() {
  const previousText = clipboard.readText();
  const hadText = previousText.length > 0;

  clipboard.clear();

  try {
    await sendCopyShortcut();
  } catch (error) {
    if (hadText) {
      clipboard.writeText(previousText);
    }

    if (process.platform === "darwin") {
      throw new Error(
        "Accessibility permission needed for selected-text hotkey. You can still copy text and use clipboard mode.",
      );
    }

    throw new Error(`Could not read selected text: ${error.message}`);
  }

  await delay(180);

  const selectedText = clipboard.readText().trim();

  if (hadText) {
    clipboard.writeText(previousText);
  } else {
    clipboard.clear();
  }

  return selectedText;
}

async function sendCopyShortcut() {
  if (process.platform === "darwin") {
    await execFileAsync(
      "osascript",
      [
        "-e",
        'tell application "System Events" to keystroke "c" using command down',
      ],
      { timeout: 2000 },
    );
    return;
  }

  if (process.platform === "win32") {
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-STA",
        "-Command",
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^c")',
      ],
      { timeout: 2000 },
    );
    return;
  }

  await execFileAsync("xdotool", ["key", "ctrl+c"], { timeout: 2000 });
}

function showBubble(payload) {
  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    bubbleWindow.close();
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const width = 390;
  const height = 188;
  const margin = 18;
  const x = Math.min(
    cursor.x + 18,
    display.workArea.x + display.workArea.width - width - margin,
  );
  const y = Math.min(
    cursor.y + 18,
    display.workArea.y + display.workArea.height - height - margin,
  );

  bubbleWindow = new BrowserWindow({
    width,
    height,
    x: Math.max(display.workArea.x + margin, x),
    y: Math.max(display.workArea.y + margin, y),
    frame: false,
    transparent: true,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  bubbleWindow.loadFile(path.join(__dirname, "src", "bubble", "bubble.html"));
  bubbleWindow.webContents.once("did-finish-load", () => {
    bubbleWindow.webContents.send("bubble:payload", payload);
  });
  bubbleWindow.on("closed", () => {
    bubbleWindow = null;
  });
}

function addHistoryItem(item) {
  history.unshift(item);
  history.splice(MAX_HISTORY_ITEMS);
  emitHistory();
}

function clearHistory() {
  history.splice(0, history.length);
  emitHistory();
  return { ok: true };
}

function updateLanguages(sourceLang, targetLang) {
  if (sourceLang) {
    state.sourceLang = sourceLang;
  }

  if (targetLang) {
    state.targetLang = targetLang;
  }

  emitState();
  return {
    ok: true,
    sourceLang: state.sourceLang,
    targetLang: state.targetLang,
  };
}

function toggleClipboardMonitoring() {
  state.clipboardMonitoring = !state.clipboardMonitoring;
  lastClipboardText = clipboard.readText();
  emitState();
  refreshTrayMenu();
  return { ok: true, clipboardMonitoring: state.clipboardMonitoring };
}

function updateShortcut(accelerator) {
  if (!accelerator || accelerator === state.shortcut) {
    return { ok: true, shortcut: state.shortcut };
  }

  globalShortcut.unregister(state.shortcut);
  const previousShortcut = state.shortcut;
  state.shortcut = accelerator;
  const registered = globalShortcut.register(
    state.shortcut,
    translateSelection,
  );

  if (!registered) {
    state.shortcut = previousShortcut;
    globalShortcut.register(state.shortcut, translateSelection);
    emitState();
    refreshTrayMenu();
    return {
      ok: false,
      error: `Could not register shortcut ${formatShortcutLabel(accelerator)}.`,
      shortcut: state.shortcut,
    };
  }

  emitState();
  refreshTrayMenu();
  return { ok: true, shortcut: state.shortcut };
}

function handleTranslationError(error, sourceLabel) {
  const message = error.message || "Translation failed.";
  const payload = {
    ok: false,
    error: message,
    sourceLabel,
  };

  emitTranslation(payload);
  updateState({ busy: false });
  return payload;
}

function updateState(patch) {
  Object.assign(state, patch);
  emitState();
}

function emitState() {
  sendToMain("state:changed", { ...state, historyCount: history.length });
}

function emitHistory() {
  sendToMain("history:changed", [...history]);
}

function emitTranslation(payload) {
  sendToMain("translation:result", payload);
}

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

ipcMain.handle("state:get", () => ({ ...state, historyCount: history.length }));
ipcMain.handle("history:get", () => [...history]);
ipcMain.handle("translate:selection", translateSelection);
ipcMain.handle("translate:clipboard", translateClipboard);
ipcMain.handle("translate:manual", translateManual);
ipcMain.handle("history:clear", clearHistory);
ipcMain.handle("monitoring:toggle", toggleClipboardMonitoring);
ipcMain.handle("languages:update", (_event, payload = {}) =>
  updateLanguages(payload.sourceLang, payload.targetLang),
);
ipcMain.handle("shortcut:update", (_event, accelerator) =>
  updateShortcut(accelerator),
);
ipcMain.handle("clipboard:write", (_event, text) => {
  clipboard.writeText(String(text || ""));
  return { ok: true };
});

function formatShortcutLabel(accelerator) {
  return String(accelerator || "")
    .replace("CommandOrControl", "Ctrl/Cmd")
    .replaceAll("+", " + ");
}
ipcMain.handle("window:show-main", () => {
  showMainWindow();
  return { ok: true };
});
