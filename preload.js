const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('main', {
  onSelection:   (cb) => ipcRenderer.on('selection',   (_, t) => cb(t)),
  onExplanation: (cb) => ipcRenderer.on('explanation', (_, t) => cb(t)),
  onThemes:      (cb) => ipcRenderer.on('themes',      (_, t) => cb(t)),
  onDevices:     (cb) => ipcRenderer.on('devices',     (_, t) => cb(t)),
  onError:       (cb) => ipcRenderer.on('error',       (_, t) => cb(t)),
  onLoading:     (cb) => ipcRenderer.on('loading',     ()    => cb()),
  analyzePassage: (payload) => ipcRenderer.invoke('analyze-passage', payload),
});
