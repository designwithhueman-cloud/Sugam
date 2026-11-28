#!/bin/sh
# After a deploy: checks the site answers over HTTPS and that one real scan runs to the end on this server (browser, database, storage).
# Usage: sh deploy/smoke.sh https://example.com [page-to-scan]
set -eu
SITE=${1:?usage: smoke.sh https://your-domain [url-to-scan]}; PAGE=${2:-https://example.com/}
code() { curl -s -o /dev/null -w '%{http_code}' "$1"; }
for p in / /login /privacy /website-accessibility-checker; do c=$(code "$SITE$p"); echo "GET $p -> $c"; [ "$c" = 200 ] || { echo "FAIL: $p"; exit 1; }; done
J=$(mktemp); trap 'rm -f "$J"' EXIT
ID=$(curl -s -c "$J" -H "origin: $SITE" -H 'content-type: application/json' -d "{\"url\":\"$PAGE\"}" "$SITE/api/scans" | sed -n 's/.*"id":"\([0-9a-f-]*\)".*/\1/p')
[ -n "$ID" ] || { echo "FAIL: the scan was not accepted"; exit 1; }
echo "scan $ID started"
i=0; while [ $i -lt 60 ]; do
  S=$(curl -s -b "$J" "$SITE/api/scans/$ID" | sed -n 's/.*"status":"\([a-z]*\)".*/\1/p')
  echo "  $S"; [ "$S" = completed ] && { echo "OK: the scan finished. Open $SITE/scans/$ID in a browser to check the report."; exit 0; }
  [ "$S" = failed ] && { echo "FAIL: the scan failed; see: docker compose -f deploy/docker-compose.yml logs app"; exit 1; }
  i=$((i+1)); sleep 5
done
echo "FAIL: the scan did not finish in 5 minutes"; exit 1
