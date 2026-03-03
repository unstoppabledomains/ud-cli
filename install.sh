#!/bin/sh
# Unstoppable Domains CLI installer
# Usage: curl -fsSL https://raw.githubusercontent.com/unstoppabledomains/ud-cli/main/install.sh | sh
set -eu

GITHUB_REPO="unstoppabledomains/ud-cli"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="ud"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

has_color() {
  [ -t 1 ] && [ "${TERM:-}" != "dumb" ]
}

info() {
  if has_color; then
    printf '\033[1;34m==>\033[0m %s\n' "$1"
  else
    printf '==> %s\n' "$1"
  fi
}

warn() {
  if has_color; then
    printf '\033[1;33mwarning:\033[0m %s\n' "$1" >&2
  else
    printf 'warning: %s\n' "$1" >&2
  fi
}

error() {
  if has_color; then
    printf '\033[1;31merror:\033[0m %s\n' "$1" >&2
  else
    printf 'error: %s\n' "$1" >&2
  fi
}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

TMPFILE=""
cleanup() {
  if [ -n "$TMPFILE" ]; then
    rm -f "$TMPFILE" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------

detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Darwin)
      PLATFORM="macos"
      ;;
    Linux)
      PLATFORM="linux"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      error "Windows is not supported by this installer."
      error "Install via npm instead:"
      error "  npm install -g @unstoppabledomains/ud-cli"
      exit 1
      ;;
    *)
      error "Unsupported operating system: $OS"
      exit 1
      ;;
  esac

  case "$ARCH" in
    x86_64|amd64)
      ARCH="x64"
      ;;
    arm64|aarch64)
      ARCH="arm64"
      ;;
    *)
      error "Unsupported architecture: $ARCH"
      exit 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
# HTTP helper (curl or wget)
# ---------------------------------------------------------------------------

http_get() {
  url="$1"
  output="${2:-}"

  if command -v curl >/dev/null 2>&1; then
    if [ -n "$output" ]; then
      curl -fsSL -o "$output" "$url"
    else
      curl -fsSL "$url"
    fi
  elif command -v wget >/dev/null 2>&1; then
    if [ -n "$output" ]; then
      wget -qO "$output" "$url"
    else
      wget -qO- "$url"
    fi
  else
    error "Neither curl nor wget found. Please install one and try again."
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Fetch latest version
# ---------------------------------------------------------------------------

get_latest_version() {
  RELEASES_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
  # Parse tag_name from GitHub API JSON using grep+sed (no jq dependency).
  # This is fragile if the JSON format changes, but acceptable for a POSIX installer.
  VERSION=$(http_get "$RELEASES_URL" | grep '"tag_name"' | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\([^"]*\)".*/\1/')

  if [ -z "$VERSION" ]; then
    error "Failed to determine the latest version from GitHub."
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  info "Unstoppable Domains CLI installer"
  echo

  detect_platform
  info "Detected platform: ${PLATFORM}-${ARCH}"

  get_latest_version
  info "Latest version: v${VERSION}"

  ASSET_NAME="ud-${PLATFORM}-${ARCH}"
  DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/${ASSET_NAME}"

  TMPFILE="$(mktemp)"
  info "Downloading ${ASSET_NAME}…"
  http_get "$DOWNLOAD_URL" "$TMPFILE"

  chmod +x "$TMPFILE"

  # macOS: strip quarantine attribute to avoid Gatekeeper block
  if [ "$PLATFORM" = "macos" ]; then
    xattr -d com.apple.quarantine "$TMPFILE" 2>/dev/null || true
  fi

  INSTALL_PATH="${INSTALL_DIR}/${BINARY_NAME}"

  # Ensure install directory exists
  if [ ! -d "$INSTALL_DIR" ]; then
    if [ -w "$(dirname "$INSTALL_DIR")" ]; then
      mkdir -p "$INSTALL_DIR"
    elif command -v sudo >/dev/null 2>&1; then
      info "Creating ${INSTALL_DIR} (sudo required)…"
      sudo mkdir -p "$INSTALL_DIR"
    else
      error "${INSTALL_DIR} does not exist and sudo is not available."
      error "Create the directory manually or run this installer as root."
      exit 1
    fi
  fi

  if [ -w "$INSTALL_DIR" ]; then
    mv "$TMPFILE" "$INSTALL_PATH"
  elif command -v sudo >/dev/null 2>&1; then
    info "Installing to ${INSTALL_DIR} (sudo required)…"
    sudo mv "$TMPFILE" "$INSTALL_PATH"
    sudo chmod +x "$INSTALL_PATH"
  else
    error "${INSTALL_DIR} is not writable and sudo is not available."
    error "Run this installer as root or move the binary manually:"
    error "  mv $TMPFILE $INSTALL_PATH"
    TMPFILE=""
    exit 1
  fi

  # Clear TMPFILE so cleanup trap doesn't try to remove the installed binary
  TMPFILE=""

  echo
  info "ud-cli v${VERSION} installed to ${INSTALL_PATH}"
  echo
  info "Get started:"
  echo "  ud auth login"
  echo "  ud domains list"
}

main
