#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  data_dir="${DATA_DIR:-/data}"
  mkdir -p "$data_dir"
  chmod 700 "$data_dir" 2>/dev/null || true
  chown -R node:node "$data_dir" 2>/dev/null || true
  exec su-exec node "$@"
fi

exec "$@"
