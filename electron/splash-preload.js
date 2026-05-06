'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splash', {
  onProgress: (cb) => ipcRenderer.on('splash-progress', (_event, data) => cb(data)),
  onError:    (cb) => ipcRenderer.on('splash-error',    (_event, msg)   => cb(msg)),
  minimize:       () => ipcRenderer.send('splash-minimize'),
  cancelInstall:  () => ipcRenderer.send('splash-cancel'),
});
