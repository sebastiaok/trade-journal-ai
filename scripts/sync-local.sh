#!/bin/bash
# scripts/sync-local.sh
# crontab용 래퍼 — 로컬 PC에서 증권사 데이터를 Supabase로 동기화
#
# crontab 예시:
#   30 16 * * 1-5  /Users/a05034/project/trade-journal-ai/scripts/sync-local.sh
#   0 9-15 * * 1-5 /Users/a05034/project/trade-journal-ai/scripts/sync-local.sh --balance-only

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/scripts/logs"
LOG_FILE="$LOG_DIR/sync-$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"

echo "" >> "$LOG_FILE"
echo "========== $(date '+%Y-%m-%d %H:%M:%S') ==========" >> "$LOG_FILE"

cd "$PROJECT_DIR" && npx tsx scripts/sync-local.ts "$@" >> "$LOG_FILE" 2>&1

EXIT_CODE=$?
echo "EXIT_CODE=$EXIT_CODE" >> "$LOG_FILE"

exit $EXIT_CODE
