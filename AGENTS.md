# Variscite Flasher Tool — Agent Guide

## Purpose

Variscite Flasher Tool is a Linux-first desktop application for selecting an
official Variscite recovery image and writing it safely to a removable SD card.

## Non-negotiable safety rules

- Treat every write operation as destructive.
- Never offer partitions as targets: only whole removable disks discovered from
  the host.
- Re-scan and re-identify the selected disk immediately before writing.
- Require an explicit user confirmation before erasing a disk.
- Never request administrator authentication until the write operation starts.
- Verify downloads and written data. Do not claim a verification succeeded
  unless it actually completed.
- Never use Variscite repositories as write targets. They are reference sources
  only; this project pushes only to the configured `dorta/var-flasher` remote.

## Product expectations

- `./run.sh` is the supported local development entry point and runs the app in
  Docker.
- The launcher must be quiet during successful startup: no raw Docker hashes,
  X11, DBus, Mesa, Electron, or browser-launch diagnostics in the terminal.
- External links must open using the host browser, never a browser inside the
  container.
- The app must open on the display where it was launched.
- Keep the interface stable: avoid layout shifts, preserve fixed page geometry,
  and use skeleton states while data or assets load.
- Default to the light theme. Both themes must use the correct Variscite logo.
- Use local assets from `/home/dorta/dev.variscite.com` when available; do not
  invent, rotate, crop, or substitute System on Module product images.

## Workflow

1. Inspect the existing behavior before modifying it.
2. Make small, focused changes.
3. Validate shell syntax, JavaScript syntax, and whitespace before handing off:

   ```bash
   bash -n run.sh
   node --check src/main.js
   git diff --check
   ```

4. For changes that affect writing media, test the no-write path first and
   describe remaining risk plainly.
5. Do not commit, push, tag, create GitHub releases, or delete releases unless
   the user explicitly authorizes that action for the current request.

## Useful locations

- Electron main process: `src/main.js`
- Renderer UI: `src/renderer/`
- Download, extraction, writing, verification: `src/images.js`
- Removable-disk discovery: `src/devices.js`
- Container runtime: `Dockerfile`, `run.sh`
- Local Variscite source assets: `/home/dorta/dev.variscite.com`
