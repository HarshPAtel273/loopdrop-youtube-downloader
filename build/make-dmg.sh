#!/bin/bash
# Builds a shareable drag-to-install DMG from the packaged app.
# Run `npm run package` first.
set -euo pipefail
cd "$(dirname "$0")/.."

APP="dist/Loopdrop-darwin-arm64/Loopdrop.app"
STAGING="dist/dmg-staging"
OUT="dist/Loopdrop.dmg"

[ -d "$APP" ] || { echo "Run npm run package first."; exit 1; }

# Ad-hoc signature keeps macOS from flagging the app as damaged on other Macs.
codesign --force --deep --sign - "$APP"

rm -rf "$STAGING" "$OUT"
mkdir -p "$STAGING"
ditto "$APP" "$STAGING/Loopdrop.app"
ln -s /Applications "$STAGING/Applications"

hdiutil create -volname "Loopdrop" -srcfolder "$STAGING" -ov -format UDZO "$OUT"
rm -rf "$STAGING"
echo "Created $OUT"
