const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('varFlasher', {
  getCatalog: () => ipcRenderer.invoke('catalog:list'),
  getRelease: (url) => ipcRenderer.invoke('catalog:release', url),
  getDevices: () => ipcRenderer.invoke('devices:list'),
  chooseImage: () => ipcRenderer.invoke('image:choose'),
  downloadImage: (release) => ipcRenderer.invoke('image:download', release),
  writeImage: (payload) => ipcRenderer.invoke('image:write', payload),
});
