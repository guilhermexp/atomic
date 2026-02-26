#!/usr/bin/env bash
set -euo pipefail

# Build a styled DMG installer using native hdiutil + APFS.
#
# Replaces appdmg (which creates HFS+ images) because macOS 26+ no longer
# supports mounting HFS+ disk images.
#
# Contains:
# - <App>.app (positioned on the left)
# - /Applications symlink (positioned on the right)
# - Custom background image (set via .background dir)
#
# Usage:
#   scripts/build-dmg-from-app.sh <app_path> <output_dmg>
#
# Env:
#   DMG_VOLUME_NAME   override volume name (defaults to CFBundleName)
#   DMG_MARGIN_MB     extra MB added to image size (default 300)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

APP_PATH="${1:-}"
OUT_DMG="${2:-}"

if [[ -z "$APP_PATH" || -z "$OUT_DMG" ]]; then
  echo "Usage: $0 <app_path> <output_dmg>" >&2
  exit 1
fi
if [[ ! -d "$APP_PATH" ]]; then
  echo "Error: app bundle not found: $APP_PATH" >&2
  exit 1
fi

# Resolve to absolute paths
APP_PATH="$(cd "$APP_PATH" && pwd)"
OUT_DMG="$(cd "$(dirname "$OUT_DMG")" && pwd)/$(basename "$OUT_DMG")"

APP_NAME=$(/usr/libexec/PlistBuddy -c "Print CFBundleName" "$APP_PATH/Contents/Info.plist" 2>/dev/null || echo "Atomic Bot")
DMG_VOLUME_NAME="${DMG_VOLUME_NAME:-$APP_NAME}"
DMG_MARGIN_MB="${DMG_MARGIN_MB:-300}"

# Background image and icon for the DMG window
BG_IMAGE="$APP_DIR/assets/dmg-installer-bg.png"
ICON_FILE="$APP_DIR/assets/icon.icns"

# Calculate needed image size
APP_SIZE_MB=$(du -sm "$APP_PATH" | awk '{print $1}')
TOTAL_SIZE_MB=$(( APP_SIZE_MB + DMG_MARGIN_MB ))

# Temporary sparse image (hdiutil appends .sparseimage automatically)
TMP_BASE="$(mktemp /tmp/atomicbot-dmg.XXXXXX)"
MOUNT_POINT=""
trap 'rm -f "${TMP_BASE}" "${TMP_BASE}.sparseimage"; if [[ -n "$MOUNT_POINT" ]]; then hdiutil detach "$MOUNT_POINT" 2>/dev/null || true; fi' EXIT

echo "[atomicbot] build-dmg-from-app: creating ${TOTAL_SIZE_MB}MB APFS image for '$DMG_VOLUME_NAME'"
rm -f "$OUT_DMG"

# Create writable sparse image with APFS
hdiutil create \
  -size "${TOTAL_SIZE_MB}m" \
  -fs APFS \
  -volname "$DMG_VOLUME_NAME" \
  -type SPARSE \
  "$TMP_BASE"

# Attach (mount) the writable image
MOUNT_OUTPUT=$(hdiutil attach "${TMP_BASE}.sparseimage" -readwrite -nobrowse -noverify -noautoopen 2>&1)
MOUNT_POINT=$(echo "$MOUNT_OUTPUT" | grep -oE '/Volumes/.*' | head -1)

if [[ -z "$MOUNT_POINT" || ! -d "$MOUNT_POINT" ]]; then
  echo "Error: failed to mount sparse image" >&2
  echo "$MOUNT_OUTPUT" >&2
  exit 1
fi

echo "[atomicbot] build-dmg-from-app: mounted at $MOUNT_POINT"

# Copy the app bundle
echo "[atomicbot] build-dmg-from-app: copying app bundle..."
cp -a "$APP_PATH" "$MOUNT_POINT/"

# Create /Applications symlink
ln -s /Applications "$MOUNT_POINT/Applications"

# Add background image
if [[ -f "$BG_IMAGE" ]]; then
  mkdir -p "$MOUNT_POINT/.background"
  cp "$BG_IMAGE" "$MOUNT_POINT/.background/background.png"
fi

# Set volume icon
if [[ -f "$ICON_FILE" ]]; then
  cp "$ICON_FILE" "$MOUNT_POINT/.VolumeIcon.icns"
  SetFile -a C "$MOUNT_POINT" 2>/dev/null || true
fi

# Detach
echo "[atomicbot] build-dmg-from-app: finalizing..."
hdiutil detach "$MOUNT_POINT"
MOUNT_POINT=""

# Convert to compressed read-only DMG (ULMO = lzma-compressed, APFS-compatible)
hdiutil convert "${TMP_BASE}.sparseimage" \
  -format ULMO \
  -o "$OUT_DMG"

rm -f "${TMP_BASE}.sparseimage"

echo "[atomicbot] build-dmg-from-app: ready: $OUT_DMG"
