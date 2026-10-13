#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org then run this again."
  exit 1
fi
npm run setup
echo
echo "Building and starting the HELIX desktop app..."
npm run desktop
