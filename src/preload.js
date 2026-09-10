const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('varFlasher', {
  getCatalog: () => ipcRenderer.invoke('catalog:list'),
  getRelease: (url) => ipcRenderer.invoke('catalog:release', url),
  getDevices: () => ipcRenderer.invoke('devices:list'),
  chooseImage: () => ipcRenderer.invoke('image:choose'),
  cachedImage: (release, options) => ipcRenderer.invoke('image:cached', { release, options }),
  cacheStatus: (tags) => ipcRenderer.invoke('image:cache-status', tags),
  downloadImage: (release, options) => ipcRenderer.invoke('image:download', { release, options }),
  cancelDownload: () => ipcRenderer.invoke('image:cancel-download'),
  writeImage: (payload) => ipcRenderer.invoke('image:write', payload),
  closeApp: () => ipcRenderer.invoke('app:close'),
  onProgress: (callback) => ipcRenderer.on('image:progress', (_event, progress) => callback(progress)),
});
