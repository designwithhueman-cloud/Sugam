#!/bin/sh
# Nightly backup of the database and the stored screenshots, kept for 14 days. Run from the repository root, e.g. from cron:
#   15 3 * * * cd /opt/avara && sh deploy/backup.sh >> /var/log/avara-backup.log 2>&1
# Copy /opt/avara-backups to another machine or object storage as well: a backup on the same disk does not survive losing the server.
set -eu
DIR=${BACKUP_DIR:-/opt/avara-backups}; STAMP=$(date +%Y%m%d-%H%M); C="docker compose -f deploy/docker-compose.yml --env-file deploy/production.env"
mkdir -p "$DIR"
$C exec -T db pg_dump -U avara -d avara --format=custom > "$DIR/db-$STAMP.dump"
$C exec -T app tar -C /data -czf - objects > "$DIR/objects-$STAMP.tgz"
find "$DIR" -type f -mtime +14 -delete
echo "backup $STAMP done"
