#!/bin/sh
set -eu
mkdir -p /prometheus
exec /bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=15d \
  --web.listen-address=":${PORT:-9090}" \
  --web.enable-lifecycle
