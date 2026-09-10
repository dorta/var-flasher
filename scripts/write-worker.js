#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeImage } = require('../src/images');

const [devicePath, imagePath, totalValue, encodedDevice, progressFile, resultFile] = process.argv.slice(2);

function validDevice(value) {
  return /^\/dev\/(?:sd[a-z]+|mmcblk\d+|vd[a-z]+|xvd[a-z]+)$/.test(value || '');
}

function validBridgeFile(value, kind) {
  return new RegExp('^/var-flasher-host/write-' + kind + '-[0-9a-f]{32}$').test(value || '');
}

function writeResult(result) {
  if (!validBridgeFile(resultFile, 'result')) throw new Error('Invalid result channel.');
  const temporary = resultFile + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(result) + '\n', { mode: 0o644 });
  fs.chmodSync(temporary, 0o644);
  fs.renameSync(temporary, resultFile);
}

function report(progress) {
  if (!validBridgeFile(progressFile, 'progress')) throw new Error('Invalid progress channel.');
  fs.appendFileSync(progressFile, JSON.stringify(progress) + '\n');
}

async function main() {
  if (!validDevice(devicePath)) throw new Error('Invalid whole-disk device.');
  if (!validBridgeFile(progressFile, 'progress') || !validBridgeFile(resultFile, 'result')) throw new Error('Invalid host bridge channel.');

  const dataRoot = fs.realpathSync('/var-flasher-data');
  const resolvedImage = fs.realpathSync(imagePath);
  const relative = path.relative(dataRoot, resolvedImage);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('The image is outside the protected application cache.');
  if (!fs.statSync(resolvedImage).isFile()) throw new Error('The selected image is not a regular file.');

  const device = JSON.parse(Buffer.from(encodedDevice, 'base64').toString('utf8'));
  if (device?.path !== devicePath) throw new Error('The selected device identity is invalid.');
  const totalBytes = Number(totalValue);
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) throw new Error('Invalid image size.');

  const result = await writeImage({ filePath: resolvedImage, device, totalBytes }, report);
  writeResult({ ok: true, ...result });
}

main().catch((error) => {
  try {
    writeResult({
      ok: false,
      code: error?.code || 'WRITE_FAILED',
      error: error?.message || 'The privileged write operation failed.',
    });
  } catch (resultError) {
    process.stderr.write((resultError?.message || 'Could not report the write failure.') + '\n');
  }
  process.exitCode = 1;
});
