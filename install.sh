#!/bin/sh
# YCF one-line installer for macOS/Linux.
#   curl -fsSL https://raw.githubusercontent.com/JotaEse68/YourCodeIsFucked/main/install.sh | sh
set -e

MIN_NODE_MAJOR=22

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "YCF needs Node.js $MIN_NODE_MAJOR or newer, and it's not installed on this machine."
  echo "Install it from https://nodejs.org (the LTS button is fine), then run this again:"
  echo ""
  echo "  curl -fsSL https://raw.githubusercontent.com/JotaEse68/YourCodeIsFucked/main/install.sh | sh"
  echo ""
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ]; then
  echo ""
  echo "YCF needs Node.js $MIN_NODE_MAJOR or newer. You have $(node -v)."
  echo "Update it from https://nodejs.org, then run this again."
  echo ""
  exit 1
fi

echo "Installing YCF..."
npm install -g @jotaese68/ycf

echo ""
echo "YCF is installed. Now:"
echo "  1. Open a terminal in your project folder (cd into it, or right-click it and choose"
echo "     'New Terminal at Folder' / similar, depending on your OS)."
echo "  2. Run: ycf cockpit"
echo ""
echo "That opens a visual dashboard in your browser -- no config needed."
echo ""
