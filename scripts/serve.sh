#!/usr/bin/env bash
# ---------------------------------------------------------------
#  ONE DROP PINBALL  --  launcher
#  Run this from the "Games" folder:      ./serve.sh
#  Everything after the script name is passed through, e.g.
#      ./serve.sh --port 9000 --no-browser
#  Uses Python when available, otherwise the PowerShell server.
# ---------------------------------------------------------------
set -u

cd "$(dirname "$0")" || exit 1

PY=""
for candidate in python3 python py; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PY="$candidate"
    break
  fi
done

if [ -n "$PY" ]; then
  exec "$PY" serve.py "$@"
fi

PS=""
for candidate in powershell.exe powershell pwsh; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PS="$candidate"
    break
  fi
done

if [ -z "$PS" ]; then
  echo "Neither Python 3 nor PowerShell could be found on your PATH."
  echo "Install Python from https://www.python.org/downloads/ and try again."
  exit 1
fi

echo "Python not found - starting the PowerShell server instead."

# translate the unix-style flags into PowerShell parameter names
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --port)      ARGS+=("-Port" "$2"); shift 2 ;;
    --port=*)    ARGS+=("-Port" "${1#*=}"); shift ;;
    --root)      ARGS+=("-Root" "$2"); shift 2 ;;
    --root=*)    ARGS+=("-Root" "${1#*=}"); shift ;;
    --no-browser) ARGS+=("-NoBrowser"); shift ;;
    *)           ARGS+=("$1"); shift ;;
  esac
done

exec "$PS" -NoProfile -ExecutionPolicy Bypass -File "./serve.ps1" ${ARGS[@]+"${ARGS[@]}"}
