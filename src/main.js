const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const path = require('node:path');
const { listReleases, releaseDetails } = require('./catalog');
const { listDevices } = require('./devices');
const { download, writeImage } = require('./images');

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const preset = workArea.width >= 3000 ? { width: 1920, height: 1080 } : workArea.width >= 1800 ? { width: 1440, height: 810 } : { width: 1280, height: 720 };
  const width = Math.min(preset.width, workArea.width);
  const height = Math.min(preset.height, workArea.height);
  const window = new BrowserWindow({
    width, height, resizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: '#f7f7f7',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  window.loadFile(path.join(__dirname, 'renderer/index.html')).catch((error) => console.error('Renderer load failed:', error));
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('Renderer failed to load:', code, description);
  });
}

ipcMain.handle('catalog:list', () => listReleases());
ipcMain.handle('catalog:release', (_event, url) => releaseDetails(url));
ipcMain.handle('devices:list', () => listDevices());
ipcMain.handle('image:download', async (event, payload) => download(payload.release, (progress) => event.sender.send('image:progress', progress), payload.options));
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
