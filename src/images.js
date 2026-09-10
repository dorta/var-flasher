const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { listDevices } = require('./devices');

const cacheRoot = process.env.VAR_FLASHER_DATA_ROOT || path.join(os.homedir(), '.var-flasher');
const sessionId = String(process.env.VAR_FLASHER_SESSION_ID || process.pid).replace(/[^a-zA-Z0-9_.-]/g, '_');
const tempCache = path.join(cacheRoot, 'session', sessionId);
const savedCache = path.join(cacheRoot, 'images');
function get(url, signal) { return new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new Error('Download cancelled.'));
  const request = https.get(url, {headers:{'User-Agent':'var-flasher/0.2'}}, response => {
    if ([301,302,303,307,308].includes(response.statusCode) && response.headers.location) {
      response.resume(); return resolve(get(new URL(response.headers.location,url).href, signal));
    }
    if (response.statusCode !== 200) { response.resume(); return reject(new Error(`HTTP ${response.statusCode}`)); }
    resolve(response);
  });
  const abort = () => request.destroy(new Error('Download cancelled.'));
  signal?.addEventListener('abort', abort, {once:true});
  request.on('error', error => reject(signal?.aborted ? new Error('Download cancelled.') : error));
}); }
function cacheTarget(release, options = {}) { if (!release?.downloadUrl) throw new Error('This release has no published download link.'); const cache=options.persist ? savedCache : tempCache; const name=path.basename(new URL(release.downloadUrl).pathname) || 'release-image'; return {cache,name,target:path.join(cache,name)}; }
async function cachedDownload(release, options = {}) { const {target,name}=cacheTarget(release,options); try { const stat=await fsp.stat(target); return {exists:stat.isFile(),name,size:stat.size,path:target}; } catch(error) { if(error.code==='ENOENT') return {exists:false,name,size:0,path:target}; throw error; } }
async function cacheStatus(tags = []) {
  const wanted = [...new Set(tags.filter(tag => typeof tag === 'string' && tag))];
  const result = Object.fromEntries(wanted.map(tag => [tag, { exists: false, size: 0, persisted: false }]));
  for (const [directory, persisted] of [[tempCache, false], [savedCache, true]]) {
    let entries;
    try { entries = await fsp.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const tag = wanted.find(value => entry.name === value || entry.name.startsWith(`${value}.`));
      if (!tag) continue;
      const stat = await fsp.stat(path.join(directory, entry.name));
      if (!result[tag].exists || persisted) result[tag] = { exists: true, size: stat.size, persisted };
    }
  }
  return result;
}
async function download(release, onProgress, options = {}) {
  const {cache,name,target} = cacheTarget(release, options);
  const signal = options.signal;
  const cancelled = () => { const error = new Error('Download cancelled.'); error.code='ABORT_ERR'; return error; };
  if (signal?.aborted) throw cancelled();
  await fsp.mkdir(cache, {recursive:true, mode:0o700});
  const existing=await cachedDownload(release,options);
  if(existing.exists && !options.overwrite) throw new Error('This download already exists. Choose to replace it or reuse the saved copy.');
  if(existing.exists && options.overwrite) { await fsp.rm(target,{force:true}); if(name.endsWith('.tar.zst')) await fsp.rm(path.join(cache,name.replace(/\.tar\.zst$/,'')),{recursive:true,force:true}); }
  let extractDir = null;
  try {
    const response = await get(release.downloadUrl, signal);
    const total = Number(response.headers['content-length'] || 0); let done = 0;
    const out = fs.createWriteStream(target);
    await new Promise((resolve,reject) => {
      const abort = () => { response.destroy(cancelled()); out.destroy(cancelled()); };
      signal?.addEventListener('abort', abort, {once:true});
      response.on('data', b => { done += b.length; onProgress?.({phase:'download',done,total}); });
      response.on('error', reject); out.on('error',reject); out.on('finish',resolve); response.pipe(out);
    });
    if (signal?.aborted) throw cancelled();
    const packageSize = (await fsp.stat(target)).size;
    const packageHash = await sha256(target, done => onProgress?.({phase:'checksum',done,total:packageSize}));
    if (release.hash && packageHash.toLowerCase() !== release.hash.toLowerCase()) {
      throw new Error(`Downloaded file checksum mismatch. Expected ${release.hash}, received ${packageHash}.`);
    }
    if (name.endsWith('.tar.zst')) {
      extractDir = path.join(cache, name.replace(/\.tar\.zst$/, ''));
      await fsp.mkdir(extractDir, {recursive:true});
      onProgress?.({phase:'extract',done:0,total:0});
      await run('tar', ['--use-compress-program=unzstd', '-xf', target, '-C', extractDir]);
      if (signal?.aborted) throw cancelled();
      const files = await findImages(extractDir);
      if (!files.length) throw new Error('The release package does not contain an .img or .wic recovery image.');
      const imagePath = chooseRecoveryImage(files); const imageHash = await sha256(imagePath);
      return { path:imagePath, size:(await fsp.stat(imagePath)).size, sha256:imageHash, packageSha256:packageHash, artifactType:'image', artifactName:path.basename(imagePath), packagePath:target, persisted:!!options.persist };
    }
    return { path: target, size: (await fsp.stat(target)).size, sha256: packageHash, artifactType: release.artifactType, artifactName: name, persisted:!!options.persist };
  } catch (error) {
    await fsp.rm(target,{force:true}).catch(()=>{});
    if (extractDir) await fsp.rm(extractDir,{recursive:true,force:true}).catch(()=>{});
    if (signal?.aborted || error.code === 'ABORT_ERR') throw cancelled();
    throw error;
  }
}
async function findImages(dir) { const out=[]; async function walk(d) { for (const e of await fsp.readdir(d,{withFileTypes:true})) { const p=path.join(d,e.name); if(e.isDirectory()) await walk(p); else if(/\.(?:img|wic)(?:\.(?:gz|zst))?$/i.test(e.name)) out.push(p); } } await walk(dir); return out; }
function chooseRecoveryImage(files) { const score = (file) => { const name=path.basename(file).toLowerCase(); if(/recovery.*(?:sd|card)|(?:sd|card).*recovery/.test(name)) return 0; if(/recovery/.test(name)) return 1; if(/(?:sd|card)/.test(name)) return 2; if(/\.wic(?:\.|$)/.test(name)) return 3; return 4; }; return [...files].sort((a,b)=>score(a)-score(b)||a.localeCompare(b))[0]; }
function sha256(file, onProgress) { return new Promise((resolve,reject) => { const h=crypto.createHash('sha256'); const s=fs.createReadStream(file); let done=0; s.on('data',b=>{h.update(b);done+=b.length;onProgress?.(done)}); s.on('error',reject); s.on('end',()=>resolve(h.digest('hex'))); }); }
function run(cmd,args) { return new Promise((resolve,reject)=>{ const p=spawn(cmd,args,{stdio:['ignore','pipe','pipe']}); let out='',err=''; p.stdout.on('data',b=>out+=b); p.stderr.on('data',b=>err+=b); p.on('error',reject); p.on('close',c=>c?reject(new Error(err.trim()||cmd+' failed ('+c+')')):resolve(out)); }); }

async function detectCompression(filePath) {
  const handle = await fsp.open(filePath, 'r');
  const header = Buffer.alloc(6);
  try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
  if (header[0] === 0x1f && header[1] === 0x8b) return 'gzip';
  if (header[0] === 0x28 && header[1] === 0xb5 && header[2] === 0x2f && header[3] === 0xfd) return 'zstd';
  if (header.subarray(0, 6).equals(Buffer.from([0xfd,0x37,0x7a,0x58,0x5a,0x00]))) throw new Error('XZ-compressed recovery images are not supported yet.');
  if (header.subarray(0, 3).toString('ascii') === 'BZh') throw new Error('Bzip2-compressed recovery images are not supported yet.');
  return 'none';
}
function createImageSource(filePath, compression) {
  if (compression === 'gzip') return { stream: fs.createReadStream(filePath).pipe(zlib.createGunzip()), completion: Promise.resolve(), child: null };
  if (compression === 'zstd') {
    const child = spawn('unzstd', ['--stdout', '--quiet', filePath], {stdio:['ignore','pipe','pipe']});
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    const completion = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.trim() || `unzstd failed (${code})`)));
    });
    return { stream: child.stdout, completion, child };
  }
  return { stream: fs.createReadStream(filePath), completion: Promise.resolve(), child: null };
}
async function unmount(device) {
  const mountpoints = [...new Set(device.mountpoints || [])].filter(Boolean).sort((a,b) => b.length - a.length);
  for (const mountpoint of mountpoints) await run('umount', [mountpoint]);
  await run('udevadm', ['settle']);
  const mounted = (await run('lsblk', ['-n', '-o', 'MOUNTPOINTS', device.path])).split('\n').map(value => value.trim()).filter(Boolean);
  if (mounted.length) throw new Error('Could not unmount every partition on ' + device.path + '.');
}
function validWholeDisk(pathname) { return /^\/dev\/(sd[a-z]+|mmcblk\d+|vd[a-z]+|xvd[a-z]+)$/.test(pathname); }
function sameDevice(expected, current) {
  return current && current.path === expected.path && current.removable && !current.readOnly &&
    current.sizeBytes === expected.sizeBytes && current.majorMinor === expected.majorMinor &&
    current.model === expected.model && current.transport === expected.transport &&
    current.serial === expected.serial && current.wwn === expected.wwn;
}
async function writeImage({filePath, device, totalBytes}, onProgress) {
  if (!filePath || !device?.path) throw new Error('Image and SD card are required.');
  if (!validWholeDisk(device.path)) throw new Error('Only a whole removable disk can be selected.');
  let current = (await listDevices()).find(d => d.path === device.path);
  if (!sameDevice(device, current)) throw new Error('The selected device changed or is no longer the same removable writable disk. Refresh and select it again.');
  const compression = await detectCompression(filePath);
  await unmount(current);
  current = (await listDevices()).find(d => d.path === device.path);
  if (!sameDevice(device, current)) throw new Error('The selected device changed while it was being prepared. No data was written.');
  const image = createImageSource(filePath, compression);
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const expectedBytes = compression === 'none' ? Number(totalBytes) || 0 : 0;
  const meter = new Transform({ transform(chunk, _encoding, callback) {
    const nextBytes = bytes + chunk.length;
    if (nextBytes > current.sizeBytes) return callback(new Error('The uncompressed image is larger than the selected device (' + current.size + ').'));
    hash.update(chunk);
    bytes = nextBytes;
    onProgress?.({phase:'write',done:bytes,total:expectedBytes});
    callback(null, chunk);
  }});
  let handle;
  try { handle = await fsp.open(device.path, fs.constants.O_RDWR | fs.constants.O_EXCL); }
  catch (error) {
    if (error.code === 'EBUSY') throw new Error('The selected SD card is still mounted or being used by another application. Close any file manager windows using it, reconnect the card, and try again.');
    if (error.code === 'EACCES' || error.code === 'EPERM') throw new Error('Administrator authorization is required to write this SD card.');
    throw error;
  }
  const output = fs.createWriteStream(null, {fd:handle.fd, autoClose:false});
  try {
    await Promise.all([pipeline(image.stream, meter, output), image.completion]);
    if (bytes === 0) throw new Error('The recovery image is empty.');
    await handle.sync();
  } catch (error) {
    image.stream.destroy();
    output.destroy();
    image.child?.kill('SIGTERM');
    throw error;
  } finally {
    await handle.close().catch(()=>{});
  }
  await run('blockdev', ['--flushbufs', device.path]);
  await run('sync', []);
  current = (await listDevices()).find(d => d.path === device.path);
  if (!sameDevice(device, current)) throw new Error('The selected device changed before verification could begin.');
  await unmount(current);
  const diskCompression = await detectCompression(device.path);
  if (diskCompression !== 'none') throw new Error('Safety check failed: compressed ' + diskCompression + ' data was written instead of a disk image.');
  const writtenHash = hash.digest('hex');
  const verifyHash = await readHash(device.path, bytes, onProgress);
  if (writtenHash !== verifyHash) throw new Error('Verification failed: expected ' + writtenHash + ', read ' + verifyHash);
  return {bytes, sha256:writtenHash, verified:true, compression};
}
function readHash(file, length, onProgress) {
  return new Promise((resolve,reject) => {
    if (!Number.isSafeInteger(length) || length <= 0) return reject(new Error('Invalid verification length.'));
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    const stream = fs.createReadStream(file, {start:0, end:length-1, highWaterMark:4*1024*1024});
    stream.on('data', chunk => {
      hash.update(chunk);
      bytes += chunk.length;
      onProgress?.({phase:'verify',done:bytes,total:length});
    });
    stream.once('error', reject);
    stream.once('end', () => {
      if (bytes !== length) return reject(new Error('Verification stopped early: expected ' + length + ' bytes, read ' + bytes + '.'));
      resolve(hash.digest('hex'));
    });
  });
}
module.exports = { download, cachedDownload, cacheStatus, writeImage, sha256, detectCompression, createImageSource, readHash };
