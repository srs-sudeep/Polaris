const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('polaris', {
  getState: () => ipcRenderer.invoke('state:get'),
  getHistory: () => ipcRenderer.invoke('history:get'),
  translateSelection: () => ipcRenderer.invoke('translate:selection'),
  translateClipboard: () => ipcRenderer.invoke('translate:clipboard'),
  translateManual: (payload) => ipcRenderer.invoke('translate:manual', payload),
  updateLanguages: (payload) => ipcRenderer.invoke('languages:update', payload),
  updateShortcut: (accelerator) => ipcRenderer.invoke('shortcut:update', accelerator),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  toggleClipboardMonitoring: () => ipcRenderer.invoke('monitoring:toggle'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  showMainWindow: () => ipcRenderer.invoke('window:show-main'),
  onState: (callback) => subscribe('state:changed', callback),
  onTranslation: (callback) => subscribe('translation:result', callback),
  onHistory: (callback) => subscribe('history:changed', callback),
  onBubblePayload: (callback) => subscribe('bubble:payload', callback)
});
