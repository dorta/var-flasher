const { app, BrowserWindow, dialog, ipcMain, screen, Menu, shell } = require('electron');
const path = require('node:path');
const { listReleases, releaseDetails } = require('./catalog');
const { listDevices } = require('./devices');
const { download, writeImage } = require('./images');

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const preset = workArea.width >= 3000 ? { width: 1360, height: 900 } : workArea.width >= 1800 ? { width: 1200, height: 820 } : { width: 1040, height: 720 };
  const width = Math.min(preset.width, workArea.width);
  const height = Math.min(preset.height, workArea.height);
  const window = new BrowserWindow({
    width, height, title: 'Variscite Flasher Tool', center: true, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: '#171717',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  window.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
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
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
