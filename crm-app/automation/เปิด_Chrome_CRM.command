#!/bin/bash
# ──────────────────────────────────────────────────────────
# เปิด Chrome พร้อม Remote Debug Mode สำหรับ V School CRM
# ดับเบิ้ลคลิกไฟล์นี้เพื่อเปิด Chrome
# ──────────────────────────────────────────────────────────

PROFILE_DIR="$HOME/.chrome-vschool-crm"
DEBUG_PORT=9222

echo "🚀 เปิด Chrome สำหรับ V School CRM..."
echo "   Profile: $PROFILE_DIR"
echo "   Debug port: $DEBUG_PORT"
echo ""
echo "📌 ขั้นตอน:"
echo "   1. Login Facebook ในหน้าต่างที่เปิด"
echo "   2. เข้า Business Suite → Inbox"
echo "   3. รัน: node /Users/ideab/Desktop/data_hub/crm-app/automation/sync_agents_v2.js --attach"
echo ""

# เปิด Chrome พร้อม remote debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=$DEBUG_PORT \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "https://business.facebook.com/latest/inbox/all" 2>/dev/null

echo "Chrome ปิดแล้ว"
