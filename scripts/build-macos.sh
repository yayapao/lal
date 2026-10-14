#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
APP_NAME="LAL"
BUILD_PLATFORM="${BUILD_PLATFORM:-darwin/universal}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/Applications}"
INSTALL_APP="$INSTALL_DIR/$APP_NAME.app"
BUILD_APP="$REPO_ROOT/build/bin/$APP_NAME.app"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

usage() {
  cat <<'EOF'
Usage: scripts/build-macos.sh [options]

Build and install LAL, then refresh macOS application discovery metadata.

Options:
  --install-dir PATH  Install the app into PATH (default: ~/Applications)
  --no-install        Build and verify the app without copying it
  -h, --help          Show this help

Environment:
  BUILD_PLATFORM      Wails platform target (default: darwin/universal)
  INSTALL_DIR         Same as --install-dir
EOF
}

log() {
  printf '[build-macos] %s\n' "$*"
}

fail() {
  printf '[build-macos] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

NO_INSTALL=0
while (($# > 0)); do
  case "$1" in
    --install-dir)
      (($# >= 2)) || fail "--install-dir requires a path"
      INSTALL_DIR="$2"
      INSTALL_APP="$INSTALL_DIR/$APP_NAME.app"
      shift 2
      ;;
    --no-install)
      NO_INSTALL=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

[[ "$(uname -s)" == "Darwin" ]] || fail "this script only supports macOS"
require_command wails
require_command mdimport
require_command mdfind
require_command mdls
require_command open
require_command osascript
[[ -x "$LSREGISTER" ]] || fail "lsregister not found at $LSREGISTER"

cd "$REPO_ROOT"
log "building $APP_NAME for $BUILD_PLATFORM"
wails build -clean -platform "$BUILD_PLATFORM"
[[ -d "$BUILD_APP" ]] || fail "build output not found: $BUILD_APP"
[[ -x "$BUILD_APP/Contents/MacOS/$APP_NAME" ]] || fail "built executable not found"

BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$BUILD_APP/Contents/Info.plist")"
BUNDLE_TYPE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundlePackageType' "$BUILD_APP/Contents/Info.plist")"
BUNDLE_EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$BUILD_APP/Contents/Info.plist")"
[[ "$BUNDLE_ID" == "com.yango.lal" ]] || fail "unexpected bundle id: $BUNDLE_ID"
[[ "$BUNDLE_TYPE" == "APPL" ]] || fail "unexpected bundle type: $BUNDLE_TYPE"
[[ "$BUNDLE_EXECUTABLE" == "$APP_NAME" ]] || fail "unexpected executable name: $BUNDLE_EXECUTABLE"
log "bundle metadata OK ($BUNDLE_ID, $BUNDLE_TYPE, $BUNDLE_EXECUTABLE)"

if ((NO_INSTALL)); then
  log "skipping install (--no-install)"
  exit 0
fi

mkdir -p "$INSTALL_DIR"
log "installing to $INSTALL_APP"
/usr/bin/ditto --rsrc --extattr --acl "$BUILD_APP" "$INSTALL_APP"
# Refresh the bundle directory timestamp so NSWorkspace/Raycast notices a new
# icon even when the installation path stays the same.
touch "$INSTALL_APP"

log "refreshing LaunchServices"
"$LSREGISTER" -u "$INSTALL_APP" >/dev/null 2>&1 || true
"$LSREGISTER" -f "$INSTALL_APP"
open -Ra "$INSTALL_APP"
REGISTERED_ID="$(osascript -e 'id of app "'"$INSTALL_APP"'"' 2>/dev/null || true)"
[[ "$REGISTERED_ID" == "$BUNDLE_ID" ]] || fail "LaunchServices resolved id '$REGISTERED_ID', expected '$BUNDLE_ID'"
log "LaunchServices OK ($REGISTERED_ID)"

log "refreshing Spotlight metadata"
mdimport "$INSTALL_APP"
INDEXED_PATH=""
for attempt in {1..10}; do
  # mdfind may not accept a newly-created user Applications directory as an
  # -onlyin scope immediately, so query the global index and allow a short
  # window for metadata propagation.
  INDEXED_PATH="$(mdfind 'kMDItemFSName == "LAL.app"c' | /usr/bin/grep -F -x -- "$INSTALL_APP" || true)"
  [[ "$INDEXED_PATH" == "$INSTALL_APP" ]] && break
  sleep 1
done
[[ "$INDEXED_PATH" == "$INSTALL_APP" ]] || fail "Spotlight did not index $INSTALL_APP"
INDEXED_ID="$(mdls -raw -name kMDItemCFBundleIdentifier "$INSTALL_APP" 2>/dev/null || true)"
[[ "$INDEXED_ID" == "$BUNDLE_ID" ]] || fail "Spotlight bundle id '$INDEXED_ID' is stale; expected '$BUNDLE_ID'"
log "Spotlight OK ($INDEXED_PATH, $INDEXED_ID)"

if [[ -d "/Applications/Raycast.app" ]]; then
  log "Raycast detected; open Raycast and search for '$APP_NAME'"
else
  log "Raycast is not installed; application indexing checks completed"
fi

log "completed successfully"
