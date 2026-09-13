#!/bin/sh
# Local dev server. Everything the page needs comes from api.sleeper.app over
# CORS, so any static server will do; this one is whatever python3 ships with.
set -eu
cd "$(dirname "$0")"
PORT="${1:-${PORT:-8151}}"
echo "D Time matchup on http://localhost:$PORT/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
