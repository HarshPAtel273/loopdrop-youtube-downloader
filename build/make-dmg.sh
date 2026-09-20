#!/bin/bash
# Builds a shareable drag-to-install DMG from the packaged app.
# Run `npm run package` first.
set -euo pipefail
cd "$(dirname "$0")/.."

APP="${LOOPDROP_APP_PATH:-dist/Loopdrop-darwin-arm64/Loopdrop.app}"
VERSION="$(node -p "require('./package.json').version")"
OUT="dist/Loopdrop-$VERSION.dmg"

[ -d "$APP" ] || { echo "Run npm run package first."; exit 1; }

# Seal the local build; distribution to other Macs still requires notarization.
codesign --force --deep --sign - "$APP"

STAGING="$(mktemp -d "${TMPDIR:-/tmp}/loopdrop-dmg.XXXXXX")"
trap 'rm -r "$STAGING"' EXIT
ditto "$APP" "$STAGING/Loopdrop.app"
ln -s /Applications "$STAGING/Applications"

hdiutil create -volname "Loopdrop" -srcfolder "$STAGING" -ov -format UDZO "$OUT"
echo "Created $OUT"
