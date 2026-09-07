# Var Flasher

Linux-first desktop application for browsing Variscite recovery images, downloading a selected release, and writing it safely to an SD card.

The first prototype uses Electron for the interface. Device discovery, image downloads, checksum verification, and privileged SD-card writing will be implemented as separate services so support for other operating systems can be added later.

## Run with Docker

Docker is the only runtime requirement for the Linux prototype. From the repository directory:

```sh
./run.sh
```

The script builds the application image and starts the desktop app with access to the graphical session and removable devices. The application must be treated as a disk-writing tool: selecting the wrong device can destroy data.

## Development

```sh
npm install
npm start
```

This project is currently a Linux prototype. Never write to a device unless its path and contents have been verified; selecting the wrong block device can destroy data.
