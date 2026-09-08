# Changelog

All notable changes to Variscite Flasher Tool are documented here.

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
