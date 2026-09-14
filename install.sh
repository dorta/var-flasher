#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="dorta/var-flasher"
APPLICATION="var-flasher"
DATA_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/$APPLICATION"
BIN_ROOT="${XDG_BIN_HOME:-$HOME/.local/bin}"
CACHE_ROOT="$HOME/.var-flasher"
IMAGE_REPOSITORY="var-flasher"
BUILDER_NAME="var-flasher-builder-$(id -u)"

fail() { printf '%s\n' "Variscite Flasher Tool: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"; }

require_docker() {
  need docker
  docker info >/dev/null 2>&1 \
    || fail "Docker is installed, but its daemon is not available to this user."
}

image_name_for_source() {
  local source_dir="$1" version
  version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$source_dir/package.json" | head -n1)"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] \
    || fail "The release has an invalid application version."
  printf 'var-flasher:v%s\n' "$version"
}

prepare_image() {
  local source_dir="$1" image_name
  require_docker
  image_name="$(image_name_for_source "$source_dir")"
  if docker image inspect "$image_name" >/dev/null 2>&1; then
    printf 'Docker image %s is already prepared.\n' "$image_name"
    return
  fi
  printf 'Preparing Docker image %s. The first installation may take several minutes.\n' "$image_name"
  docker buildx version >/dev/null 2>&1 \
    || fail "Docker Buildx is required to prepare the application image."
  if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
    docker buildx create --name "$BUILDER_NAME" --driver docker-container >/dev/null \
      || fail "Could not create the isolated Docker builder."
  fi
  docker buildx inspect --bootstrap "$BUILDER_NAME" >/dev/null \
    || fail "Could not start the isolated Docker builder."
  docker buildx build --builder "$BUILDER_NAME" --pull --load --tag "$image_name" "$source_dir" \
    || fail "Could not prepare the Docker image."
  printf 'Docker image %s is ready.\n' "$image_name"
}

remove_docker_artifacts() {
  require_docker

  local -a images containers
  mapfile -t images < <(
    docker image ls --filter "reference=$IMAGE_REPOSITORY:*" --format '{{.Repository}}:{{.Tag}}' \
      | sort -u
  )
  mapfile -t containers < <(
    {
      docker ps -aq --filter 'name=^/var-flasher-session-'
      docker ps -aq --filter 'label=com.variscite.flasher.session'
      local image
      for image in "${images[@]}"; do
        docker ps -aq --filter "ancestor=$image"
      done
    } | sed '/^$/d' | sort -u
  )

  if [[ "${#containers[@]}" -gt 0 ]]; then
    docker rm -f "${containers[@]}" >/dev/null \
      || fail "Could not remove all Variscite Flasher Tool containers."
  fi
  if [[ "${#images[@]}" -gt 0 ]]; then
    docker image rm -f "${images[@]}" >/dev/null \
      || fail "Could not remove all Variscite Flasher Tool images."
  fi
  if docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
    docker buildx rm --force "$BUILDER_NAME" >/dev/null \
      || fail "Could not remove the Variscite Flasher Tool build cache."
  fi

  [[ -z "$({ docker ps -aq --filter 'name=^/var-flasher-session-'; docker ps -aq --filter 'label=com.variscite.flasher.session'; } | sed '/^$/d' | sort -u)" ]] \
    || fail "A Variscite Flasher Tool container remains after uninstall."
  [[ -z "$(docker image ls --filter "reference=$IMAGE_REPOSITORY:*" -q)" ]] \
    || fail "A Variscite Flasher Tool image remains after uninstall."
  ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1 \
    || fail "The Variscite Flasher Tool build cache remains after uninstall."
}

request_header=()
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  request_header=(-H "Authorization: Bearer $GITHUB_TOKEN")
fi

latest_tag() {
  need curl
  local response tag
  response="$(curl --fail --silent --show-error --location --retry 3 "${request_header[@]}" \
    -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$REPOSITORY/releases/latest")" \
    || fail "Could not read the latest public GitHub release."
  tag="$(printf '%s\n' "$response" | sed -n 's/^[[:space:]]*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*$/\1/p' | head -n1)"
  [[ -n "$tag" ]] || fail "The repository does not have a published version yet."
  printf '%s\n' "$tag"
}

install_version() {
  need curl
  need tar
  local tag archive stage version_dir source_dir new_install=false
  tag="$(latest_tag)"
  version_dir="$DATA_ROOT/releases/$tag"

  if [[ -d "$version_dir" && -x "$version_dir/run.sh" ]]; then
    source_dir="$version_dir"
  else
    new_install=true
    archive="$(mktemp)"
    stage="$(mktemp -d)"
    trap 'rm -f "$archive"; rm -rf "$stage"' RETURN
    curl --fail --silent --show-error --location --retry 3 "${request_header[@]}" \
      "https://api.github.com/repos/$REPOSITORY/tarball/$tag" -o "$archive" \
      || fail "Could not download $tag from GitHub."
    mkdir -p "$stage/source" "$DATA_ROOT/releases"
    tar -xzf "$archive" --strip-components=1 -C "$stage/source" \
      || fail "The release archive could not be extracted."
    [[ -x "$stage/source/run.sh" || -f "$stage/source/run.sh" ]] || fail "The release does not include run.sh."
    chmod +x "$stage/source/run.sh" "$stage/source/install.sh"
    source_dir="$stage/source"
  fi

  prepare_image "$source_dir"

  if [[ "$new_install" == true ]]; then
    mv "$stage/source" "$version_dir"
  fi
  ln -sfn "$version_dir" "$DATA_ROOT/current"
  printf 'Installed Variscite Flasher Tool %s.\n' "$tag"

  mkdir -p "$BIN_ROOT"
  cat > "$BIN_ROOT/var-flasher" <<'WRAPPER'
#!/usr/bin/env bash
set -Eeuo pipefail
APP_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/var-flasher"
CURRENT="$APP_ROOT/current"
[[ -x "$CURRENT/run.sh" ]] || { printf '%s\n' 'Variscite Flasher Tool is not installed. Run the installer first.' >&2; exit 1; }
case "${1:-}" in
  --update) exec "$CURRENT/install.sh" --update ;;
  --uninstall) exec "$CURRENT/install.sh" --uninstall ;;
  --version) sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CURRENT/package.json" | head -n1 ;;
  --help|-h) printf '%s\n' 'Usage: var-flasher [--update|--uninstall|--version]' ;;
  *) exec "$CURRENT/run.sh" "$@" ;;
esac
WRAPPER
  chmod 755 "$BIN_ROOT/var-flasher"
  case ":$PATH:" in *":$BIN_ROOT:"*) ;; *) printf 'Add %s to PATH, then run: var-flasher\n' "$BIN_ROOT" ;; esac
}

uninstall() {
  printf 'This removes Variscite Flasher Tool, all installed versions, its Docker containers, images, build cache, and %s. Continue? [y/N] ' "$CACHE_ROOT"
  local answer
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]] || { printf 'Cancelled.\n'; return; }
  remove_docker_artifacts
  rm -f "$BIN_ROOT/var-flasher"
  rm -rf "$DATA_ROOT" "$CACHE_ROOT"
  printf 'Variscite Flasher Tool was removed completely.\n'
}

case "${1:---install}" in
  --install|--update) install_version ;;
  --uninstall) uninstall ;;
  *) fail "Usage: install.sh [--install|--update|--uninstall]" ;;
esac
