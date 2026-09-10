const { app, BrowserWindow, dialog, ipcMain, screen, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { listReleases, releaseDetails } = require('./catalog');
const { listDevices } = require('./devices');
const { download, cachedDownload, cacheStatus } = require('./images');
if (process.env.VAR_FLASHER_CONFIG_DIR) app.setPath('userData', process.env.VAR_FLASHER_CONFIG_DIR);
const activeDownloads = new Map();
let writeInProgress = false;
const catalogCacheFile = () => path.join(app.getPath('userData'), 'catalog-cache.json');

function friendlyNetworkError(error) {
  const transient = ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED'].includes(error?.code);
  return transient
    ? 'The Variscite catalog is temporarily unavailable. Check your connection and try again.'
    : 'The Variscite catalog could not be loaded. Try again shortly.';
}

async function catalogResponse() {
  try {
    const releases = await listReleases();
    fs.mkdirSync(path.dirname(catalogCacheFile()), { recursive: true });
    fs.writeFileSync(catalogCacheFile(), JSON.stringify({ savedAt: new Date().toISOString(), releases }), 'utf8');
    return { ok: true, releases, cached: false };
  } catch (error) {
    try {
      const cached = JSON.parse(fs.readFileSync(catalogCacheFile(), 'utf8'));
      if (Array.isArray(cached.releases) && cached.releases.length) {
        return { ok: true, releases: cached.releases, cached: true, savedAt: cached.savedAt };
      }
    } catch (_) { /* no usable cache yet */ }
    return { ok: false, releases: [], error: friendlyNetworkError(error) };
  }
}

function openHostBrowser(url) {
  if (!/^https?:\/\//i.test(url)) return;
  const bridgeFile = process.env.VAR_FLASHER_HOST_OPEN_FILE;
  if (!bridgeFile) return;
  try { fs.writeFileSync(bridgeFile, `${url}\n`, 'utf8'); } catch (_) { /* host bridge unavailable */ }
}

async function writeImageOnHost({ filePath, device, totalBytes }, onProgress) {
  if (!filePath || !device?.path) return { ok: false, code: 'INVALID_REQUEST', error: 'Image and SD card are required.' };
  if (!/^\/dev\/(?:sd[a-z]+|mmcblk\d+|vd[a-z]+|xvd[a-z]+)$/.test(device.path)) return { ok: false, code: 'INVALID_DEVICE', error: 'Only a whole removable disk can be selected.' };
  const bridgeDir = process.env.VAR_FLASHER_HOST_BRIDGE_DIR;
  const dataRoot = process.env.VAR_FLASHER_DATA_ROOT;
  if (!bridgeDir || !dataRoot) return { ok: false, code: 'BRIDGE_UNAVAILABLE', error: 'Administrator authorization is unavailable.' };
  const nonce = require('node:crypto').randomBytes(16).toString('hex');
  const requestFile = path.join(bridgeDir, 'write-request');
  const progressFile = path.join(bridgeDir, `write-progress-${nonce}`);
  const resultFile = path.join(bridgeDir, `write-result-${nonce}`);
  try {
    const [resolvedRoot, resolvedImage] = await Promise.all([fs.promises.realpath(dataRoot), fs.promises.realpath(filePath)]);
    const relativeImage = path.relative(resolvedRoot, resolvedImage);
    if (!relativeImage || relativeImage.startsWith('..') || path.isAbsolute(relativeImage)) return { ok: false, code: 'INVALID_IMAGE', error: 'The downloaded image is outside the protected application cache.' };
    await fs.promises.writeFile(progressFile, '', { mode: 0o600 });
    await fs.promises.rm(resultFile, { force: true });
    const encodedPath = Buffer.from(relativeImage, 'utf8').toString('base64');
    const encodedDevice = Buffer.from(JSON.stringify(device), 'utf8').toString('base64');
    await fs.promises.writeFile(requestFile, `${nonce}\n${device.path}\n${encodedPath}\n${Number(totalBytes) || 0}\n${encodedDevice}\n`, { mode: 0o644 });
    const deadline = Date.now() + 24 * 60 * 60 * 1000;
    let progressCount = 0;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 200));
      try {
        const lines = (await fs.promises.readFile(progressFile, 'utf8')).split(/\r?\n/).filter(Boolean);
        for (const line of lines.slice(progressCount)) {
          try { onProgress?.(JSON.parse(line)); } catch (_) { /* wait for a complete event */ }
        }
        progressCount = lines.length;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      try {
        const result = JSON.parse(await fs.promises.readFile(resultFile, 'utf8'));
        return result;
      } catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      }
    }
    return { ok: false, code: 'WRITE_TIMEOUT', error: 'The privileged write operation timed out.' };
  } catch (error) {
    return { ok: false, code: 'BRIDGE_FAILED', error: error.message || 'The privileged write operation failed.' };
  } finally {
    await Promise.all([progressFile, resultFile].map(file => fs.promises.rm(file, { force: true }).catch(() => {})));
  }
}

function windowLayout(display) {
  const { width: availableWidth, height: availableHeight } = display.workArea;
  let preset;
  if (availableWidth >= 3000 && availableHeight >= 1600) {
    preset = { width: 1920, height: 1080, zoom: 1.2 };
  } else if (availableWidth >= 2300 && availableHeight >= 1200) {
    preset = { width: 1680, height: 1000, zoom: 1.05 };
  } else if (availableWidth >= 1700 && availableHeight >= 850) {
    preset = { width: 1360, height: 900, zoom: 1 };
  } else if (availableWidth >= 1200 && availableHeight >= 700) {
    preset = { width: 1180, height: 760, zoom: 1 };
  } else {
    preset = {
      width: Math.min(1040, Math.floor(availableWidth * 0.88)),
      height: Math.min(700, Math.floor(availableHeight * 0.88)),
      zoom: 1,
    };
  }
  const width = Math.min(preset.width, availableWidth);
  const height = Math.min(preset.height, availableHeight);
  return {
    x: Math.round(display.workArea.x + (availableWidth - width) / 2),
    y: Math.round(display.workArea.y + (availableHeight - height) / 2),
    width,
    height,
    zoom: preset.zoom,
  };
}

function cursorDisplayLayout() {
  return windowLayout(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
}

function createWindow() {
  const initial = cursorDisplayLayout();
  const window = new BrowserWindow({
    x: initial.x, y: initial.y, width: initial.width, height: initial.height,
    title: 'Variscite Flasher Tool', show: false,
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: '#171717',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  window.on('close', event => { if (writeInProgress) event.preventDefault(); });
  window.webContents.setZoomFactor(initial.zoom);
  window.webContents.setWindowOpenHandler(({ url }) => { openHostBrowser(url); return { action: 'deny' }; });
  window.loadFile(path.join(__dirname, 'renderer/index.html')).catch((error) => console.error('Renderer load failed:', error));
  window.once('ready-to-show', () => {
    const current = cursorDisplayLayout();
    const bounds = { x: current.x, y: current.y, width: current.width, height: current.height };
    window.webContents.setZoomFactor(current.zoom);
    window.setBounds(bounds, false);
    window.show();
    setImmediate(() => window.setBounds(bounds, false));
  });
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('Renderer failed to load:', code, description);
  });
}

ipcMain.handle('catalog:list', () => catalogResponse());
ipcMain.handle('catalog:release', async (_event, url) => {
  try { return { ok: true, details: await releaseDetails(url) }; }
  catch (error) { return { ok: false, error: friendlyNetworkError(error) }; }
});
ipcMain.handle('app:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.handle('devices:list', () => listDevices());
ipcMain.handle('image:cached', (_event, payload) => cachedDownload(payload.release, payload.options));
ipcMain.handle('image:cache-status', (_event, tags) => cacheStatus(tags));
ipcMain.handle('image:download', async (event, payload) => { const controller=new AbortController(); activeDownloads.set(event.sender.id, controller); try { return await download(payload.release, (progress) => event.sender.send('image:progress', progress), {...payload.options,signal:controller.signal}); } catch (error) { if (error?.code === 'ABORT_ERR') return {cancelled:true}; throw error; } finally { activeDownloads.delete(event.sender.id); } });
ipcMain.handle('image:cancel-download', event => { const controller=activeDownloads.get(event.sender.id); if (!controller) return false; controller.abort(); return true; });
ipcMain.handle('image:write', async (event, payload) => { writeInProgress=true; try { return await writeImageOnHost(payload, progress => event.sender.send('image:progress', progress)); } finally { writeInProgress=false; } });
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
