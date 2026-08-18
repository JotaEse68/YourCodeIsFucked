#!/bin/sh
# Run this on a real Mac. Not executed or verified by this plan's implementer --
# no Mac machine was available. Iterate on it there; this is a documented starting
# point, not a guaranteed-working script.
set -e

mkdir -p release
node --experimental-sea-config sea-config.json
cp "$(command -v node)" release/YCF-Launcher-Mac
codesign --remove-signature release/YCF-Launcher-Mac
npx postject release/YCF-Launcher-Mac NODE_SEA_BLOB dist/main.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA

# Wrap the bare executable in a minimal .app bundle so double-clicking in Finder
# behaves like a real app, not a loose Unix binary.
mkdir -p "release/YCF Launcher.app/Contents/MacOS"
mv release/YCF-Launcher-Mac "release/YCF Launcher.app/Contents/MacOS/YCF Launcher"
cat > "release/YCF Launcher.app/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>YCF Launcher</string>
  <key>CFBundleIdentifier</key><string>com.jsantos.ycf.launcher</string>
  <key>CFBundleName</key><string>YCF Launcher</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict>
</plist>
EOF

echo "Built release/YCF Launcher.app -- unsigned. First launch needs: right-click > Open > Open."
