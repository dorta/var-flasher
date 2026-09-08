<p align="center">
  <img src="./src/renderer/variscite-logo.svg" width="260" alt="Variscite">
</p>

<h1 align="center">Variscite Flasher Tool</h1>

<p align="center">
  Linux-first desktop tool for selecting, downloading, verifying, and safely writing Variscite recovery images to removable SD cards.
</p>

<p align="center">
  <a href="./LICENSE">BSD-3-Clause</a> · <a href="./CHANGELOG.md">Changelog</a>
</p>

> Status: **0.1.0** — Linux prototype. The interface is structured so native Windows and macOS backends can be added without changing the user flow.

## What it does

1. Lists supported Variscite System-on-Modules (SOMs).
2. Shows compatible operating systems and recovery releases.
3. Downloads the selected recovery artifact and validates its SHA-256 checksum when available.
4. Offers only whole, removable, writable disks detected by `lsblk`.
5. Requires an explicit confirmation before erasing the selected target, then writes, flushes, and verifies it by reading it back.

The catalog is sourced from the public Variscite release pages. Downloaded artifacts are cached locally so verified images can be reused.

## Run on Linux

Docker is the only required application runtime. You also need an X11 graphical session and permission to use Docker.

```sh
git clone git@github.com:dorta/var-flasher.git
cd var-flasher
./run.sh
```

`run.sh` builds the image and opens the desktop application. It cleans up the temporary container when the window closes or when you press `Ctrl+C` in the terminal.

## Safety model

Flashing a disk is destructive. Review the selected device carefully before confirming:

- Partitions are never shown as targets; only removable whole disks are eligible.
- Read-only and zero-size devices are excluded.
- The device is scanned again just before writing and matched by path, major/minor number, and serial number.
- Mounted partitions are unmounted before writing.
- The image is synced and read back for integrity verification.

Do not use this tool for a disk you have not physically identified. A wrong target can permanently destroy data.

## Development and CI

The supported local command is still only:

```sh
./run.sh
```

GitHub Actions validates JavaScript syntax, shell syntax, and the Docker image for every push and pull request. A pushed `v*` tag creates the GitHub release, marks it as **Latest**, and removes older release records while preserving their tags and source history.

## Project links

- [Buy a Variscite SOM](https://www.variscite.com/product/system-on-module-som/)
- [Variscite documentation](https://dev.variscite.com/)
- [Changelog](./CHANGELOG.md)
- [License](./LICENSE)

## License

Released under the [BSD 3-Clause License](./LICENSE).
