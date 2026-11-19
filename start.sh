#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 was not found in PATH."
  echo "Please install Python 3.8+ (e.g. 'sudo apt install python3') and try again."
  exit 1
fi

echo "Starting TB2 Board Lab..."
exec python3 server.py --open-browser "$@"
