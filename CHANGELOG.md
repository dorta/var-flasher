# Changelog

All notable changes to Variscite Flasher Tool are documented here.

## Unreleased

## [0.3.1] - 2026-09-11

### Changed

- Simplified README navigation and normalized heading capitalization.
- Relicensed the project from BSD-3-Clause to Apache-2.0.

## [0.3.0] - 2026-09-11

### Added

- Responsive HD, Full HD, QHD, and UHD window presets centered on the display under the pointer.
- Local download-state badges for every visible recovery release.
- Real-time SHA-256 verification progress and readable transfer-speed metrics.

### Changed

- The desktop application now runs without root privileges; PolicyKit starts a short-lived, network-isolated writer with access only to the selected SD card after explicit authorization.
- Expanded layouts use the available application width with compact gutters.
- The OS selector is full-width and the selected SOM remains visible in the panel header.
- The language menu opens upward from the footer.
- Progress screens hide unavailable metrics and animate indeterminate work.
- The public installer discovers releases through the GitHub HTTPS API without requiring a token.
- The README follows the concise Variscite repository style.

### Fixed

- Host PolicyKit authorization requests are readable by the launcher, allowing the password dialog to open.
- Persistent cache ownership is restored to the desktop user.
- Improved dialog and safety-message contrast, the completed-step check icon, the Buy a SOM link, and CI shell validation.

## [0.2.0] - 2026-09-08

### Added

- One-line authenticated installer for the private GitHub repository.
- `var-flasher`, `var-flasher --update`, `var-flasher --uninstall`, and `var-flasher --version` commands.
- Release asset for the installer and CI validation for the installer itself.

### Changed

- Tag-driven publishing always promotes the newest release and removes older release records while preserving tags.

## [0.1.0] - 2026-09-08

### Added

- Linux-first Electron application launched only through Docker.
- Variscite recovery catalog with SOM, operating-system, and release selection.
- Verified download cache, SHA-256 validation, removable-disk discovery, image writing, and read-back verification.
- Guided four-step workflow, light/dark themes, localized interface, and SOM hardware profiles.
- CI validation and a tag-driven release workflow.

### Safety

- Only whole removable disks reported by `lsblk` are presented.
- The target is re-identified immediately before writing.
- Writing requires an explicit destructive-operation confirmation.
