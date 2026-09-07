const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const { listReleases, releaseDetails } = require('./catalog');
const { listDevices } = require('./devices');
const { download, writeImage } = require('./images');

function createWindow() {
  const window = new BrowserWindow({
    width: 1180, height: 780, minWidth: 900, minHeight: 620,
    backgroundColor: '#f7f7f7',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  window.webContents.on('console-message', (_event, level, message) => console.log(`[renderer:${level}] ${message}`));
  window.webContents.on('render-process-gone', (_event, details) => console.error('Renderer process exited:', details.reason));
  window.loadFile(path.join(__dirname, 'renderer/index.html')).then(() => console.log('Renderer loaded successfully')).catch((error) => console.error('Renderer load failed:', error));
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('Renderer failed to load:', code, description);
  });
}

ipcMain.handle('catalog:list', () => listReleases());
ipcMain.handle('catalog:release', (_event, url) => releaseDetails(url));
ipcMain.handle('devices:list', () => listDevices());
ipcMain.handle('image:download', async (event, release) => download(release, (progress) => event.sender.send('image:progress', progress)));
ipcMain.handle('image:write', async (event, payload) => writeImage(payload, (progress) => event.sender.send('image:progress', progress)));
ipcMain.handle('image:choose', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Recovery images', extensions: ['img', 'gz'] }] });
  return result.canceled ? null : result.filePaths[0];
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
