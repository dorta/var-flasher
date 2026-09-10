#!/usr/bin/env bash
set -Eeuo pipefail

DEVICE="${1:-}"
DATA_ROOT="${2:-}"
RELATIVE_IMAGE="${3:-}"
TOTAL_BYTES="${4:-}"
EXPECTED_DEVICE_B64="${5:-}"
BRIDGE_DIR="${6:-}"
NONCE="${7:-}"
SESSION_NAME="${8:-}"

fail() {
  echo "${1:-Privileged writer validation failed.}" >&2
  exit "${2:-2}"
}

[[ "${EUID}" -eq 0 ]] || fail "Administrator authorization is required." 2
[[ "${PKEXEC_UID:-}" =~ ^[0-9]+$ ]] || fail "The requesting desktop user could not be identified." 2
[[ "$DEVICE" =~ ^/dev/(sd[a-z]+|mmcblk[0-9]+|vd[a-z]+|xvd[a-z]+)$ ]] || fail "Invalid whole-disk device." 2
[[ "$TOTAL_BYTES" =~ ^[0-9]+$ ]] || fail "Invalid image size." 2
[[ "$NONCE" =~ ^[0-9a-f]{32}$ ]] || fail "Invalid write request." 2
[[ "$SESSION_NAME" =~ ^var-flasher-session-[0-9]+-[0-9]+$ ]] || fail "Invalid application session." 2
[[ -n "$RELATIVE_IMAGE" && "$RELATIVE_IMAGE" != /* && "$RELATIVE_IMAGE" != .. && "$RELATIVE_IMAGE" != ../* && "$RELATIVE_IMAGE" != */../* && "$RELATIVE_IMAGE" != */.. ]] || fail "Invalid image path." 2

DATA_ROOT_REAL="$(/usr/bin/realpath -e -- "$DATA_ROOT")" || fail "The application data directory is unavailable." 2
BRIDGE_DIR_REAL="$(/usr/bin/realpath -e -- "$BRIDGE_DIR")" || fail "The application bridge is unavailable." 2
[[ "$(/usr/bin/stat -c %u -- "$DATA_ROOT_REAL")" == "$PKEXEC_UID" ]] || fail "The application data directory has an unexpected owner." 2
[[ "$(/usr/bin/stat -c %u -- "$BRIDGE_DIR_REAL")" == "$PKEXEC_UID" ]] || fail "The application bridge has an unexpected owner." 2
IMAGE_REAL="$(/usr/bin/realpath -e -- "$DATA_ROOT_REAL/$RELATIVE_IMAGE")" || fail "The downloaded image no longer exists." 2
case "$IMAGE_REAL" in "$DATA_ROOT_REAL"/*) ;; *) fail "The image is outside the protected application cache." 2 ;; esac
[[ -f "$IMAGE_REAL" ]] || fail "The selected image is not a regular file." 2
[[ -b "$DEVICE" ]] || fail "The selected device no longer exists." 3

read -r TYPE REMOVABLE READ_ONLY < <(/usr/bin/lsblk -dnro TYPE,RM,RO -- "$DEVICE")
[[ "$TYPE" == disk && "$REMOVABLE" == 1 && "$READ_ONLY" == 0 ]] || fail "The selected target is not a removable writable whole disk." 4

mapfile -t NODES < <(/usr/bin/lsblk -lnpo PATH -- "$DEVICE" | /usr/bin/tac)
for NODE in "${NODES[@]}"; do
  mapfile -t TARGETS < <(/usr/bin/findmnt -rn -S "$NODE" -o TARGET || true)
  for TARGET in "${TARGETS[@]}"; do
    /usr/bin/umount -- "$TARGET"
  done
done
/usr/bin/udevadm settle
if /usr/bin/lsblk -nrpo MOUNTPOINTS -- "$DEVICE" | /usr/bin/grep -q '[^[:space:]]'; then
  fail "One or more partitions are still mounted." 5
fi

RESULT_FILE="$BRIDGE_DIR_REAL/write-result-$NONCE"
PROGRESS_FILE="$BRIDGE_DIR_REAL/write-progress-$NONCE"
CONTAINER_NAME="var-flasher-writer-$NONCE"

set +e
/usr/bin/docker run --rm --name "$CONTAINER_NAME"   --label "com.variscite.flasher.session=$SESSION_NAME"   --network none --read-only --pids-limit 128   --cap-drop ALL --cap-add SYS_ADMIN   --security-opt no-new-privileges   --tmpfs /tmp:rw,noexec,nosuid,size=64m   --device "$DEVICE:$DEVICE:rwm"   --volume "$DATA_ROOT_REAL:/var-flasher-data:ro"   --volume "$BRIDGE_DIR_REAL:/var-flasher-host:rw"   --entrypoint node var-flasher:local   scripts/write-worker.js "$DEVICE" "/var-flasher-data/$RELATIVE_IMAGE" "$TOTAL_BYTES" "$EXPECTED_DEVICE_B64"   "/var-flasher-host/write-progress-$NONCE" "/var-flasher-host/write-result-$NONCE"
WRITER_CODE=$?
set -e

if [[ "$WRITER_CODE" -ne 0 && ! -s "$RESULT_FILE" ]]; then
  RESULT_TMP="$RESULT_FILE.$$"
  printf '%s\n' '{"ok":false,"code":"WRITE_LAUNCH_FAILED","error":"The protected SD-card writer could not be started."}' > "$RESULT_TMP"
  /usr/bin/chmod 0644 "$RESULT_TMP"
  /usr/bin/mv "$RESULT_TMP" "$RESULT_FILE"
fi
exit "$WRITER_CODE"
