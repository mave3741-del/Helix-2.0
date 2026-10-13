#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org then run this again."
  exit 1
fi
npm run setup
echo
echo "Starting Helix. Open http://localhost:8080 in your browser."
echo "Press Ctrl+C to stop."
echo "(Want it as a desktop app instead of a browser tab? Run ./desktop.sh)"
echo
npm run dev
