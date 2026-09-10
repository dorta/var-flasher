<!-- SPDX-License-Identifier: BSD-3-Clause -->
<!-- Copyright (c) 2026 Diego Dorta. All rights reserved. -->

<p align="center">
  <img src="./src/renderer/variscite-logo.svg" width="320" alt="Variscite">
</p>

<p align="center"><strong>Safe recovery-image flashing for Variscite System on Modules</strong></p>

<p align="center">
  <a href="https://github.com/dorta/var-flasher/releases/latest">Latest release</a> ·
  <a href="./docs/INSTALLATION.md">Installation</a> ·
  <a href="./docs/SAFETY.md">Safety</a> ·
  <a href="https://dev.variscite.com/">Developer Center</a>
</p>

Variscite Flasher Tool is a Linux desktop application for finding official
Variscite recovery images and writing them safely to removable SD cards. It
verifies both the downloaded image and the data written to the target media.

## Installation

Docker is the only application runtime required. Install the latest published
version directly from GitHub:

```sh
curl -fsSL https://raw.githubusercontent.com/dorta/var-flasher/main/install.sh | bash
```

Then run:

```sh
var-flasher
```

To run directly from a clone, use `./run.sh`. Update or remove an installed copy
with `var-flasher --update` or `var-flasher --uninstall`.

## Safety

Writing an image erases the selected device completely. The application accepts
only whole removable disks, confirms the target again immediately before
writing, requests administrator authorization only when required, and verifies
the written bytes before reporting success. Read the [safety guide](./docs/SAFETY.md)
before using important media.

## License

Available under the [BSD 3-Clause License](./LICENSE).
