#!/usr/bin/env bash
set -Eeuo pipefail

DEVICE="${1:-}"
case "$DEVICE" in
  /dev/sd[a-z]*|/dev/mmcblk[0-9]*|/dev/vd[a-z]*|/dev/xvd[a-z]*) ;;
  *) echo "Invalid whole-disk device." >&2; exit 2 ;;
esac

[[ -b "$DEVICE" ]] || { echo "The selected device no longer exists." >&2; exit 3; }
read -r TYPE REMOVABLE READ_ONLY < <(/usr/bin/lsblk -dnro TYPE,RM,RO -- "$DEVICE")
[[ "$TYPE" == disk && "$REMOVABLE" == 1 && "$READ_ONLY" == 0 ]] || {
  echo "The selected target is not a removable writable whole disk." >&2
  exit 4
}

mapfile -t NODES < <(/usr/bin/lsblk -lnpo PATH -- "$DEVICE" | /usr/bin/tac)
for NODE in "${NODES[@]}"; do
  mapfile -t TARGETS < <(/usr/bin/findmnt -rn -S "$NODE" -o TARGET || true)
  for TARGET in "${TARGETS[@]}"; do
    /usr/bin/umount -- "$TARGET"
  done
done

/usr/bin/udevadm settle
if /usr/bin/lsblk -nrpo MOUNTPOINTS -- "$DEVICE" | /usr/bin/grep -q '[^[:space:]]'; then
  echo "One or more partitions are still mounted." >&2
  exit 5
fi
