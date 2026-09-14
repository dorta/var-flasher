#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
APP_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT_DIR/package.json" | head -n1)"
[[ "$APP_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || {
  echo "Variscite Flasher Tool has an invalid application version." >&2
  exit 1
}
IMAGE_NAME="var-flasher:v$APP_VERSION"
HOST_UID="$(id -u)"
HOST_GID="$(id -g)"
HOST_USER="$(id -un)"
CONTAINER_NAME="var-flasher-session-$HOST_UID-$$"
BRIDGE_DIR="$(mktemp -d /tmp/var-flasher-host.XXXXXX)"
BRIDGE_FILE="$BRIDGE_DIR/open-url"
WRITE_REQUEST="$BRIDGE_DIR/write-request"
BRIDGE_PID=""
HOST_TIMEZONE=""
if [[ -f /etc/timezone ]]; then HOST_TIMEZONE="$(tr -d '\r\n' < /etc/timezone)"; fi
if [[ -z "$HOST_TIMEZONE" ]]; then
  ZONEINFO_PATH="$(readlink -f /etc/localtime 2>/dev/null || true)"
  HOST_TIMEZONE="${ZONEINFO_PATH#*/usr/share/zoneinfo/}"
fi
HOST_TIMEZONE="${HOST_TIMEZONE:-America/Sao_Paulo}"
USER_HOME_DIR="$(getent passwd "$HOST_UID" | cut -d: -f6)"
HOST_DATA_DIR="$USER_HOME_DIR/.var-flasher"
HOST_CONFIG_DIR="$HOST_DATA_DIR/config"
HOST_SESSION_DIR="$HOST_DATA_DIR/session/$CONTAINER_NAME"
mkdir -p "$HOST_DATA_DIR" "$HOST_CONFIG_DIR" "$HOST_SESSION_DIR"
rm -f "$BRIDGE_DIR/auth-request" "$BRIDGE_DIR/write-request" 2>/dev/null || true
: > "$BRIDGE_FILE"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required. Install Docker and run this script again." >&2
  exit 1
}
command -v pkexec >/dev/null 2>&1 || {
  echo "Administrator authentication requires pkexec (policykit-1)." >&2
  exit 1
}

repair_data_ownership() {
  docker run --rm --entrypoint chown     --volume "$HOST_DATA_DIR:/var-flasher-data"     "$IMAGE_NAME" -R "$HOST_UID:$HOST_GID" /var-flasher-data >/dev/null 2>&1 || true
}

write_bridge_result() {
  local nonce="$1" code="$2" message="$3"
  local result="$BRIDGE_DIR/write-result-$nonce"
  local temporary="$result.$$"
  printf '{"ok":false,"code":"%s","error":"%s"}\n' "$code" "$message" > "$temporary"
  chmod 0644 "$temporary"
  mv "$temporary" "$result"
}

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  mapfile -t WRITERS < <(docker ps -aq --filter "label=com.variscite.flasher.session=$CONTAINER_NAME")
  if [[ "${#WRITERS[@]}" -gt 0 ]]; then docker rm -f "${WRITERS[@]}" >/dev/null 2>&1 || true; fi
  if [[ -n "$BRIDGE_PID" ]]; then kill "$BRIDGE_PID" >/dev/null 2>&1 || true; fi
  repair_data_ownership
  find "$BRIDGE_DIR" -mindepth 1 -maxdepth 1 -type f -delete >/dev/null 2>&1 || true
  rmdir "$BRIDGE_DIR" >/dev/null 2>&1 || true
  xhost -si:localuser:"$HOST_USER" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

docker image inspect "$IMAGE_NAME" >/dev/null 2>&1 || {
  echo "Variscite Flasher Tool is not prepared. Run the installer again." >&2
  exit 1
}
repair_data_ownership

command -v xhost >/dev/null 2>&1 || {
  echo "Could not find xhost. Install x11-xserver-utils." >&2
  exit 1
}
xhost +si:localuser:"$HOST_USER" >/dev/null 2>&1 || {
  echo "Could not authorize the Docker window on the X11 display." >&2
  exit 1
}

(
  while :; do
    if [[ -s "$BRIDGE_FILE" ]]; then
      URL="$(head -n 1 "$BRIDGE_FILE")"
      : > "$BRIDGE_FILE"
      case "$URL" in http://*|https://*) xdg-open "$URL" >/dev/null 2>&1 || true ;; esac
    fi

    if [[ -s "$WRITE_REQUEST" ]]; then
      mapfile -t REQUEST_LINES < "$WRITE_REQUEST"
      rm -f "$WRITE_REQUEST"
      NONCE="${REQUEST_LINES[0]:-}"
      DEVICE="${REQUEST_LINES[1]:-}"
      IMAGE_B64="${REQUEST_LINES[2]:-}"
      TOTAL_BYTES="${REQUEST_LINES[3]:-}"
      DEVICE_B64="${REQUEST_LINES[4]:-}"
      VALID_REQUEST=true

      [[ "$NONCE" =~ ^[0-9a-f]{32}$ ]] || VALID_REQUEST=false
      [[ "$DEVICE" =~ ^/dev/(sd[a-z]+|mmcblk[0-9]+|vd[a-z]+|xvd[a-z]+)$ ]] || VALID_REQUEST=false
      [[ "$TOTAL_BYTES" =~ ^[0-9]+$ ]] || VALID_REQUEST=false
      RELATIVE_IMAGE="$(printf '%s' "$IMAGE_B64" | base64 --decode 2>/dev/null)" || VALID_REQUEST=false
      if [[ "$VALID_REQUEST" == true ]]; then
        [[ -n "$RELATIVE_IMAGE" && "$RELATIVE_IMAGE" != /* && "$RELATIVE_IMAGE" != .. && "$RELATIVE_IMAGE" != ../* && "$RELATIVE_IMAGE" != */../* && "$RELATIVE_IMAGE" != */.. ]] || VALID_REQUEST=false
      fi
      if [[ "$VALID_REQUEST" == true ]]; then
        IMAGE_REAL="$(realpath -e -- "$HOST_DATA_DIR/$RELATIVE_IMAGE" 2>/dev/null || true)"
        case "$IMAGE_REAL" in "$HOST_DATA_DIR"/*) [[ -f "$IMAGE_REAL" ]] || VALID_REQUEST=false ;; *) VALID_REQUEST=false ;; esac
      fi

      if [[ "$VALID_REQUEST" != true ]]; then
        if [[ "$NONCE" =~ ^[0-9a-f]{32}$ ]]; then
          write_bridge_result "$NONCE" "INVALID_REQUEST" "The protected write request was rejected."
        fi
      else
        set +e
        pkexec "$ROOT_DIR/scripts/write-device.sh" "$DEVICE" "$HOST_DATA_DIR" "$RELATIVE_IMAGE" "$TOTAL_BYTES" "$DEVICE_B64" "$BRIDGE_DIR" "$NONCE" "$CONTAINER_NAME" >/dev/null 2>&1
        WRITE_CODE=$?
        set -e
        RESULT_FILE="$BRIDGE_DIR/write-result-$NONCE"
        if [[ "$WRITE_CODE" -eq 126 || "$WRITE_CODE" -eq 127 ]]; then
          write_bridge_result "$NONCE" "AUTH_CANCELLED" "Administrator authorization was cancelled. Nothing was written to the SD card."
        elif [[ "$WRITE_CODE" -ne 0 && ! -s "$RESULT_FILE" ]]; then
          write_bridge_result "$NONCE" "WRITE_FAILED" "The protected SD-card writer failed before writing could begin."
        fi
      fi
    fi
    sleep 0.2
  done
) &
BRIDGE_PID=$!

docker run --name "$CONTAINER_NAME"   --label "com.variscite.flasher.session=$CONTAINER_NAME"   --user "$HOST_UID:$HOST_GID"   --cap-drop ALL --security-opt no-new-privileges   --ipc=host --net=host   --env "DISPLAY=$DISPLAY" --env ELECTRON_OZONE_PLATFORM_HINT=x11   --env "TZ=$HOST_TIMEZONE"   --env HOME=/var-flasher-data/home   --env VAR_FLASHER_DATA_ROOT=/var-flasher-data   --env "VAR_FLASHER_SESSION_ID=$CONTAINER_NAME"   --env VAR_FLASHER_CONFIG_DIR=/var-flasher-data/config   --env LIBGL_ALWAYS_SOFTWARE=1 --env NO_AT_BRIDGE=1 --env GTK_MODULES=   --env VAR_FLASHER_HOST_OPEN_FILE=/var-flasher-host/open-url   --env VAR_FLASHER_HOST_BRIDGE_DIR=/var-flasher-host   --volume /tmp/.X11-unix:/tmp/.X11-unix:rw   --volume /dev:/dev:ro   --volume "$HOST_DATA_DIR:/var-flasher-data:rw"   --volume "$BRIDGE_DIR:/var-flasher-host:rw"   "$IMAGE_NAME" 2> >(grep -v 'Kernel has no file descriptor comparison support' >&2)
