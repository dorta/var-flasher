const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { detectCompression, createImageSource, readHash } = require('../src/images');

async function readSource(file, compression) {
  const source = createImageSource(file, compression);
  const chunks = [];
  for await (const chunk of source.stream) chunks.push(chunk);
  await source.completion;
  return Buffer.concat(chunks);
}

async function fixture(t) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'var-flasher-test-'));
  t.after(() => fsp.rm(dir, {recursive:true, force:true}));
  const original = Buffer.alloc(1024 * 1024 + 517);
  for (let i=0; i<original.length; i+=1) original[i] = (i * 31 + 17) & 0xff;
  original[510] = 0x55; original[511] = 0xaa;
  const raw = path.join(dir, 'recovery.wic');
  await fsp.writeFile(raw, original);
  return {dir, raw, original};
}

test('gzip recovery image is decompressed before writing', async t => {
  const {dir, original} = await fixture(t);
  const file = path.join(dir, 'recovery.wic.gz');
  await fsp.writeFile(file, zlib.gzipSync(original));
  assert.equal(await detectCompression(file), 'gzip');
  assert.deepEqual(await readSource(file, 'gzip'), original);
});

test('zstd recovery image is decompressed before writing', async t => {
  const {dir, raw, original} = await fixture(t);
  const file = path.join(dir, 'recovery.wic.zst');
  const result = spawnSync('zstd', ['--quiet', '--force', raw, '-o', file], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await detectCompression(file), 'zstd');
  assert.deepEqual(await readSource(file, 'zstd'), original);
});

test('raw recovery image stays uncompressed', async t => {
  const {raw, original} = await fixture(t);
  assert.equal(await detectCompression(raw), 'none');
  assert.deepEqual(await readSource(raw, 'none'), original);
});

test('verification hashes exactly the written byte range', async t => {
  const {raw, original} = await fixture(t);
  const progress = [];
  const actual = await readHash(raw, original.length, event => progress.push(event));
  const expected = crypto.createHash('sha256').update(original).digest('hex');
  assert.equal(actual, expected);
  assert.equal(progress.at(-1).done, original.length);
  assert.equal(progress.at(-1).total, original.length);
});

test('verification detects different destination bytes', async t => {
  const {dir, original} = await fixture(t);
  const target = path.join(dir, 'target-device.bin');
  const corrupted = Buffer.from(original);
  corrupted[Math.floor(corrupted.length / 2)] ^= 0xff;
  await fsp.writeFile(target, corrupted);
  const sourceHash = crypto.createHash('sha256').update(original).digest('hex');
  assert.notEqual(await readHash(target, original.length), sourceHash);
});
