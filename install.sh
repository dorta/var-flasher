#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="dorta/var-flasher"
APPLICATION="var-flasher"
DATA_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/$APPLICATION"
BIN_ROOT="${XDG_BIN_HOME:-$HOME/.local/bin}"
CACHE_ROOT="$HOME/.var-flasher"

fail() { printf '%s\n' "Variscite Flasher Tool: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"; }

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
  local tag archive stage version_dir
  tag="$(latest_tag)"
  version_dir="$DATA_ROOT/releases/$tag"

  if [[ -d "$version_dir" && -x "$version_dir/run.sh" ]]; then
    ln -sfn "$version_dir" "$DATA_ROOT/current"
    printf 'Variscite Flasher Tool %s is already installed.\n' "$tag"
  else
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
    mv "$stage/source" "$version_dir"
    ln -sfn "$version_dir" "$DATA_ROOT/current"
    printf 'Installed Variscite Flasher Tool %s.\n' "$tag"
  fi

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
  printf 'This removes Variscite Flasher Tool, all installed versions, and %s. Continue? [y/N] ' "$CACHE_ROOT"
  local answer
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]] || { printf 'Cancelled.\n'; return; }
  rm -f "$BIN_ROOT/var-flasher"
  rm -rf "$DATA_ROOT" "$CACHE_ROOT"
  printf 'Variscite Flasher Tool was removed completely.\n'
}

case "${1:---install}" in
  --install|--update) install_version ;;
  --uninstall) uninstall ;;
  *) fail "Usage: install.sh [--install|--update|--uninstall]" ;;
esac
