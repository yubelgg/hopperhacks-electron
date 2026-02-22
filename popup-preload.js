const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popup', {
  onLoading:     (cb) => ipcRenderer.on('loading',     (_, t) => cb(t)),
  onExplanation: (cb) => ipcRenderer.on('explanation', (_, t) => cb(t)),
  onError:       (cb) => ipcRenderer.on('error',       (_, t) => cb(t)),
  close:         ()   => ipcRenderer.send('close-popup'),
  openApp:       ()   => ipcRenderer.send('open-app'),
});

