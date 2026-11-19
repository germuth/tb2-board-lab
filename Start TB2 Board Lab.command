#!/usr/bin/env bash
cd "$(dirname "$0")"

if ! python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >/dev/null 2>&1; then
  echo ""
  echo "=============================================================="
  echo "  Python 3.8+ is required to run TB2 Board Lab from source."
  echo "=============================================================="
  echo ""
  echo "Download the official macOS installer from:"
  echo "  https://www.python.org/downloads/"
  echo ""
  echo "Or if you use Homebrew:  brew install python"
  echo ""
  read -r -p "Open python.org/downloads in your browser now? [Y/n]: " OPEN_DL
  if [[ ! "$OPEN_DL" =~ ^[Nn]$ ]]; then
    open "https://www.python.org/downloads/"
  fi
  echo ""
  read -r -p "After installing Python, double-click this file again. Press Enter to close..."
  exit 1
fi

echo ""
echo "=============================================================="
echo "  Starting TB2 Board Lab..."
echo "  Your browser will open automatically."
echo "  Keep this window open while using the app (Ctrl+C to stop)."
echo "=============================================================="
echo ""

python3 server.py --open-browser "$@"
EXIT_CODE=$?
if [ "$EXIT_CODE" -ne 0 ]; then
  echo ""
  echo "TB2 Board Lab exited with code $EXIT_CODE."
  read -r -p "Press Enter to close..."
fi
