const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  translate: (text, sourceLang, targetLang) => 
    ipcRenderer.invoke('translate', text, sourceLang, targetLang),
  
  getClipboard: () => 
    ipcRenderer.invoke('get-clipboard'),
  
  onTranslationUpdate: (callback) => 
    ipcRenderer.on('translation-update', (event, data) => callback(data)),
  
  resizeWindow: (width, height) => 
    ipcRenderer.invoke('resize-window', width, height),
  
  startScreenSelection: () => 
    ipcRenderer.invoke('start-screen-selection'),
  
  captureScreenRegion: (bounds) => 
    ipcRenderer.invoke('capture-screen-region', bounds),
  
  processOCR: (imageBuffer, bounds) => 
    ipcRenderer.invoke('process-ocr', imageBuffer, bounds),
  
  showOverlay: (bounds, translation) => 
    ipcRenderer.invoke('show-overlay', bounds, translation),
  
  clearOverlay: () => 
    ipcRenderer.invoke('clear-overlay'),
  
  closeSelectionWindow: () => 
    ipcRenderer.invoke('close-selection-window'),
  
  processSelectedRegion: (bounds) => 
    ipcRenderer.invoke('process-selected-region', bounds),
  
  onOCRResult: (callback) => 
    ipcRenderer.on('ocr-result', (event, data) => callback(data)),
  
  onOCRProcessingStage: (callback) => 
    ipcRenderer.on('ocr-processing-stage', (event, data) => callback(data)),
  
  selectionCancelled: () => 
    ipcRenderer.send('selection-cancelled'),
  
  notifySelectionComplete: () =>
    ipcRenderer.send('selection-complete'),
  
  onSetTranslation: (callback) =>
    ipcRenderer.on('set-translation', (event, data) => callback(data)),
  
  onTriggerOCRSnip: (callback) =>
    ipcRenderer.on('trigger-ocr-snip', () => callback())
});
