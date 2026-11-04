#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

[[ "$(uname -s)" == Darwin ]] || { echo 'macOS is required' >&2; exit 1; }
[[ "$(wails3 version 2>&1)" == v3.1.0 ]] || { echo 'Install wails3 v3.1.0 (see README)' >&2; exit 1; }

OUT=build/bin
APP="$OUT/LAL.app"
BINARY="$OUT/LAL"
PLATFORM="${BUILD_PLATFORM:-darwin/universal}"
TAGS=production
FLAGS=(-trimpath -ldflags='-w -s')
ARCHES=(arm64 amd64)
if [[ "${DEV:-false}" == true ]]; then
  APP="$OUT/LAL.dev.app"
  BINARY="$OUT/LAL-dev"
  TAGS=dev
  FLAGS=(-gcflags='all=-l')
  ARCHES=("$(go env GOARCH)")
else
  case "$PLATFORM" in
    darwin/universal) ;;
    darwin/arm64) ARCHES=(arm64) ;;
    darwin/amd64) ARCHES=(amd64) ;;
    *) echo "Unsupported target: $PLATFORM" >&2; exit 1 ;;
  esac
fi

wails3 tool prepare-macos-output --dir "$OUT"
wails3 generate icons -input build/appicon.png -macfilename "$OUT/icons.icns" -windowsfilename "$OUT/icon.ico"
for TARGET_ARCH in "${ARCHES[@]}"; do
  GOOS=darwin GOARCH="$TARGET_ARCH" CGO_ENABLED=1 \
    MACOSX_DEPLOYMENT_TARGET=12.0 CGO_CFLAGS='-mmacosx-version-min=12.0' \
    CGO_LDFLAGS='-mmacosx-version-min=12.0' \
    go build -buildvcs=false -tags "$TAGS" "${FLAGS[@]}" -o "$BINARY-$TARGET_ARCH" .
done
if [[ ${#ARCHES[@]} == 2 ]]; then
  lipo -create -output "$BINARY" "$BINARY-arm64" "$BINARY-amd64"
else
  cp "$BINARY-${ARCHES[0]}" "$BINARY"
fi
rm -rf -- "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BINARY" "$APP/Contents/MacOS/LAL"
cp "$OUT/icons.icns" "$APP/Contents/Resources/icons.icns"
cp build/darwin/Info.plist "$APP/Contents/Info.plist"
if [[ "${DEV:-false}" == true ]]; then
  /usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier com.yango.lal.dev' "$APP/Contents/Info.plist"
fi
xattr -cr "$APP"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
