#!/usr/bin/env bash
set -euo pipefail

if [ ! -d node_modules ]; then
  npm install
fi

printf '\nOpen the Vite URL shown below in your browser.\n'
exec npm run dev
