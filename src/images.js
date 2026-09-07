const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { listDevices } = require('./devices');

const cache = path.join(os.tmpdir(), 'var-flasher');
function get(url) { return new Promise((resolve, reject) => { https.get(url, {headers:{'User-Agent':'var-flasher/0.1'}}, r => { if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location) { r.resume(); return resolve(get(new URL(r.headers.location,url).href)); } if (r.statusCode !== 200) { r.resume(); return reject(new Error(`HTTP ${r.statusCode}`)); } resolve(r); }).on('error', reject); }); }
async function download(release, onProgress) {
  if (!release?.downloadUrl) throw new Error('This release has no published download link.');
  await fsp.mkdir(cache, {recursive:true});
  const name = path.basename(new URL(release.downloadUrl).pathname) || 'release-image';
  const target = path.join(cache, name);
  const response = await get(release.downloadUrl);
  const total = Number(response.headers['content-length'] || 0); let done = 0;
  const out = fs.createWriteStream(target);
  await new Promise((resolve,reject) => { response.on('data', b => { done += b.length; onProgress?.({phase:'download',done,total}); }); response.on('error',reject); out.on('error',reject); out.on('finish',resolve); response.pipe(out); });
  if (name.endsWith('.tar.zst')) {
    const extractDir = path.join(cache, name.replace(/\.tar\.zst$/, ''));
    await fsp.mkdir(extractDir, {recursive:true});
    await run('tar', ['--use-compress-program=unzstd', '-xf', target, '-C', extractDir]);
    const files = await findImages(extractDir);
    if (!files.length) throw new Error('The release package does not contain an .img or .wic recovery image.');
    const imagePath = files[0]; const hash = await sha256(imagePath);
    return { path:imagePath, size:(await fsp.stat(imagePath)).size, sha256:hash, artifactType:'image', artifactName:path.basename(imagePath), packagePath:target };
  }
  const hash = await sha256(target);
  return { path: target, size: (await fsp.stat(target)).size, sha256: hash, artifactType: release.artifactType, artifactName: name };
}
async function findImages(dir) { const out=[]; async function walk(d) { for (const e of await fsp.readdir(d,{withFileTypes:true})) { const p=path.join(d,e.name); if(e.isDirectory()) await walk(p); else if(/\.(?:img|wic)(?:\.gz)?$/i.test(e.name)) out.push(p); } } await walk(dir); return out; }
function sha256(file) { return new Promise((resolve,reject) => { const h=crypto.createHash('sha256'); const s=fs.createReadStream(file); s.on('data',b=>h.update(b)); s.on('error',reject); s.on('end',()=>resolve(h.digest('hex'))); }); }
function run(cmd,args) { return new Promise((resolve,reject)=>{ const p=spawn(cmd,args,{stdio:['ignore','pipe','pipe']}); let err=''; p.stderr.on('data',b=>err+=b); p.on('error',reject); p.on('close',c=>c?reject(new Error(err||`${cmd} failed (${c})`)):resolve()); }); }
async function unmount(device) { for (const m of device.mountpoints || []) if (m) await run('umount',[m]); }
function validWholeDisk(pathname) { return /^\/dev\/(sd[a-z]+|mmcblk\d+|vd[a-z]+|xvd[a-z]+)$/.test(pathname); }
async function writeImage({filePath, device}, onProgress) {
  if (!filePath || !device?.path) throw new Error('Image and SD card are required.');
  if (!validWholeDisk(device.path)) throw new Error('Only a whole removable disk can be selected.');
  const current = (await listDevices()).find(d => d.path === device.path);
  if (!current || current.readOnly || !current.removable || current.majorMinor !== device.majorMinor || current.serial !== device.serial) throw new Error('The selected device changed or is no longer the same removable writable disk. Refresh and select it again.');
  await unmount(current);
  const input = fs.createReadStream(filePath);
  const source = filePath.endsWith('.gz') ? input.pipe(zlib.createGunzip()) : input;
  const hash = crypto.createHash('sha256'); let bytes=0;
  source.on('data', b => { hash.update(b); bytes += b.length; onProgress?.({phase:'write',done:bytes,total:0}); });
  await new Promise((resolve,reject)=>{ const out=fs.createWriteStream(device.path,{flags:'w'}); source.on('error',reject); out.on('error',reject); out.on('finish',()=>{ if (out.fd != null) fs.fsync(out.fd, e=>e?reject(e):resolve()); else resolve(); }); source.pipe(out); });
  await run('sync',[]);
  const writtenHash = hash.digest('hex');
  const verifyHash = await readHash(device.path, bytes, onProgress);
  if (writtenHash !== verifyHash) throw new Error(`Verification failed: expected ${writtenHash}, read ${verifyHash}`);
  return {bytes, sha256:writtenHash, verified:true};
}
function readHash(file, length, onProgress) { return new Promise((resolve,reject)=>{ const fd=fs.openSync(file,'r'); const h=crypto.createHash('sha256'); const buf=Buffer.allocUnsafe(4*1024*1024); let pos=0; try { while(pos<length) { const n=fs.readSync(fd,buf,0,Math.min(buf.length,length-pos),pos); if(!n) throw new Error('Unexpected end of device during verification'); h.update(buf.subarray(0,n)); pos+=n; onProgress?.({phase:'verify',done:pos,total:length}); } fs.closeSync(fd); resolve(h.digest('hex')); } catch(e) { try{fs.closeSync(fd)}catch{} reject(e); } }); }
module.exports = { download, writeImage, sha256 };
