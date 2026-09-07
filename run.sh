#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="var-flasher:local"
HOST_XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required. Install Docker and run this script again." >&2
  exit 1
}

docker build --tag "$IMAGE_NAME" "$ROOT_DIR"

docker_args=(
  --rm
  --privileged
  --ipc=host
  --net=host
  --env "DISPLAY=${DISPLAY:-}"
  --env ELECTRON_OZONE_PLATFORM_HINT=x11
  --env LIBGL_ALWAYS_SOFTWARE=1
  --volume /tmp/.X11-unix:/tmp/.X11-unix:rw
  --volume /dev:/dev
)

if [[ -f "$HOST_XAUTHORITY" ]]; then
  docker_args+=(
    --env XAUTHORITY=/tmp/.Xauthority
    --volume "$HOST_XAUTHORITY:/tmp/.Xauthority:ro"
  )
else
  command -v xhost >/dev/null 2>&1 || {
    echo "Could not find xhost. Install x11-xserver-utils or set XAUTHORITY." >&2
    exit 1
  }
  xhost +si:localuser:root >/dev/null
  trap 'xhost -si:localuser:root >/dev/null 2>&1 || true' EXIT
fi

docker run "${docker_args[@]}" "$IMAGE_NAME"
