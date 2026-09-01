#!/bin/sh
set -eu
mkdir -p /loki/chunks /loki/rules /loki/index /loki/index_cache /loki/compactor
exec /usr/bin/loki \
  -config.file=/etc/loki/config.yml \
  -server.http-listen-port="${PORT:-3100}"
