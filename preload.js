const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  translate: (text, sourceLang, targetLang) => 
    ipcRenderer.invoke('translate', text, sourceLang, targetLang),
  
  getClipboard: () => 
    ipcRenderer.invoke('get-clipboard'),
  
  onTranslationUpdate: (callback) => 
    ipcRenderer.on('translation-update', (event, data) => callback(data)),
  
  resizeWindow: (width, height) => 
    ipcRenderer.invoke('resize-window', width, height)
});
