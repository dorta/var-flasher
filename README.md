# Var Flasher

Linux-first desktop application for browsing Variscite recovery images, downloading a selected release, and writing it safely to an SD card.

The Linux prototype uses Electron for the interface. It reads the public Variscite release catalog, follows recovery-package pages, downloads `.tar.zst` artifacts, extracts the recovery image, detects removable disks, asks for administrator authorization at startup, unmounts the target, writes it, flushes it, and reads it back for SHA-256 verification.

## Run with Docker

Docker is the only runtime requirement for the Linux prototype. From the repository directory:

```sh
./run.sh
```

The script builds the application image and starts the desktop app with access to the graphical session and removable devices. The application must be treated as a disk-writing tool: selecting the wrong device can destroy data.

## Safety

The app only presents whole disks marked removable by `lsblk`, never partitions. Before writing it re-scans the device and compares its path, major/minor identifier, and serial number. Writing always requires a confirmation and erases the selected disk.

The app is intentionally run through Docker with `./run.sh`; host-side `npm start` is not supported. This is currently a Linux prototype, with the download/catalog and flashing services kept separate so Windows and macOS can be added later. Never write to a device unless its path and contents have been verified; selecting the wrong block device can destroy data.
