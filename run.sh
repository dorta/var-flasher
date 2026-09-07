#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="var-flasher:local"
HOST_XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required. Install Docker and run this script again." >&2
  exit 1
}

docker build --pull --progress=quiet --tag "$IMAGE_NAME" "$ROOT_DIR"

# Docker needs host administrator authorization only for the privileged device session.
# Keep this after the build so opening the project does not prompt for a password.
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || { echo "sudo is required to authorize SD-card writing." >&2; exit 1; }
  echo "Administrator authentication is required before Var Flasher can access removable disks."
  sudo -v
fi

docker_args=(
  --rm
  --privileged
  --ipc=host
  --net=host
  --env "DISPLAY=${DISPLAY:-}"
  --env ELECTRON_OZONE_PLATFORM_HINT=x11
  --env LIBGL_ALWAYS_SOFTWARE=1
  --env NO_AT_BRIDGE=1
  --env GTK_MODULES=
  --volume /tmp/.X11-unix:/tmp/.X11-unix:rw
  --volume /dev:/dev
)



command -v xhost >/dev/null 2>&1 || {
  echo "Could not find xhost. Install x11-xserver-utils." >&2
  exit 1
}
xhost +si:localuser:root >/dev/null 2>&1 || {
  echo "Could not authorize the Docker window on the X11 display." >&2
  exit 1
}
trap 'xhost -si:localuser:root >/dev/null 2>&1 || true' EXIT

docker run "${docker_args[@]}" "$IMAGE_NAME"
