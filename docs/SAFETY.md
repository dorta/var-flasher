# Safety

Writing an OS image is destructive. Selecting the wrong target can permanently
erase user data.

## Target protection

- Only whole disks reported as removable and writable are offered as targets.
- Partitions, read-only devices, and zero-size devices are excluded.
- The selected disk is scanned again immediately before writing.
- Path, major/minor identifier, serial/WWN, model, transport, capacity, and
  removable state are checked before writing and again before verification.
- Mounted filesystems on the disk and all child partitions are unmounted before
  writing. The raw disk is opened exclusively so a busy target is rejected.
- The user must explicitly confirm the destructive operation.

## Privilege isolation

The desktop application, catalog, downloads, checksum validation, and device
selection run as the signed-in user in an unprivileged container. The application
can inspect `/dev` read-only, but it cannot write raw media.

After the destructive-operation confirmation and download verification, Linux
PolicyKit displays the administrator authentication dialog. Approval starts a
short-lived writer container with no network access, a read-only application
filesystem, and access only to the selected block device. The host and writer
then repeat the whole-disk, removable, read-only, mount, and device-identity
checks before the first byte is written. Cancelling authentication does not
modify the SD card.

## Integrity checks

The application calculates SHA-256 for the downloaded package and checks an
official checksum when one is published. Gzip and Zstandard recovery images are
identified by their content and decompressed before writing. The uncompressed
byte stream is hashed while it is written; the write stops if it would exceed
the target capacity. The file descriptor is synchronized, Linux block buffers
are flushed, and exactly the written byte range is read back asynchronously and
hashed again. Success is shown only when both hashes match.

## Operational guidance

- Physically identify the SD card before selecting it.
- Confirm its model and capacity in the review screen.
- Download and extraction may be cancelled safely.
- Do not remove the card or close the application during writing or verification.
- A successful write does not guarantee that a specific board will boot; board
  configuration, image compatibility, boot switches, and hardware must also be
  correct.
