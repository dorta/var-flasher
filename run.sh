#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="var-flasher:local"

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
  --env "XAUTHORITY=/tmp/.Xauthority"
  --volume /tmp/.X11-unix:/tmp/.X11-unix:rw
  --volume /dev:/dev
)

if [[ -n "${XAUTHORITY:-}" && -f "$XAUTHORITY" ]]; then
  docker_args+=(--volume "$XAUTHORITY:/tmp/.Xauthority:ro")
fi

if [[ -n "${WAYLAND_DISPLAY:-}" && -S "${XDG_RUNTIME_DIR:-}/$WAYLAND_DISPLAY" ]]; then
  docker_args+=(
    --env "WAYLAND_DISPLAY=$WAYLAND_DISPLAY"
    --env XDG_RUNTIME_DIR=/tmp/runtime
    --volume "${XDG_RUNTIME_DIR}/${WAYLAND_DISPLAY}:/tmp/runtime/${WAYLAND_DISPLAY}"
  )
fi

docker run "${docker_args[@]}" "$IMAGE_NAME"
