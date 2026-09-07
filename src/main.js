const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const { listReleases, releaseDetails } = require('./catalog');
const { listDevices } = require('./devices');
const { download, writeImage } = require('./images');

function createWindow() {
  const window = new BrowserWindow({
    width: 1280, height: 720, resizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: '#f7f7f7',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  window.webContents.on('console-message', (_event, level, message) => console.log(`[renderer:${level}] ${message}`));
  window.webContents.on('render-process-gone', (_event, details) => console.error('Renderer process exited:', details.reason));
  window.webContents.on('dom-ready', () => {
    window.webContents.executeJavaScript(`(() => {
      if (!document.body || document.body.children.length === 0) {
        document.body.innerHTML = '<main style="padding:40px;font:16px Arial;color:#1d1d1d"><h1 style="color:#ff5f46">Var Flasher</h1><p>The interface loaded without content. Please refresh the application.</p></main>';
      }
      return {title: document.title, children: document.body.children.length, text: document.body.innerText.slice(0, 120)};
    })()`).then((result) => console.log('Renderer DOM:', JSON.stringify(result))).catch((error) => console.error('Renderer DOM check failed:', error));
  });
  window.loadFile(path.join(__dirname, 'renderer/index.html')).then(() => console.log('Renderer loaded successfully')).catch((error) => console.error('Renderer load failed:', error));
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
