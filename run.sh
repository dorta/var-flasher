#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
IMAGE_NAME="var-flasher:local"
CONTAINER_NAME="var-flasher-session-$(id -u)-$$"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required. Install Docker and run this script again." >&2
  exit 1
}

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  xhost -si:localuser:root >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

echo "Building Variscite Flasher Tool…"
docker build --pull --progress=quiet --tag "$IMAGE_NAME" "$ROOT_DIR" || {
  echo "Variscite Flasher Tool could not be built." >&2
  exit 1
}

command -v xhost >/dev/null 2>&1 || {
  echo "Could not find xhost. Install x11-xserver-utils." >&2
  exit 1
}
xhost +si:localuser:root >/dev/null 2>&1 || {
  echo "Could not authorize the Docker window on the X11 display." >&2
  exit 1
}

docker run   --name "$CONTAINER_NAME"   --privileged   --ipc=host   --net=host   --env "DISPLAY=$DISPLAY"   --env ELECTRON_OZONE_PLATFORM_HINT=x11   --env LIBGL_ALWAYS_SOFTWARE=1   --env NO_AT_BRIDGE=1   --env GTK_MODULES=   --volume /tmp/.X11-unix:/tmp/.X11-unix:rw   --volume /dev:/dev   "$IMAGE_NAME"
