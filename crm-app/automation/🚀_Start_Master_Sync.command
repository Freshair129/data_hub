#!/bin/bash
# ──────────────────────────────────────────────────────────
# 🚀 V School Master Sync - One Click Automation
# เปิด Chrome + รัน Sync Agent ในคำสั่งเดียว
# ──────────────────────────────────────────────────────────

PROFILE_DIR="$HOME/.chrome-vschool-crm"
DEBUG_PORT=9222
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "============================================"
echo "🚀 V School Master Sync Automation"
echo "============================================"

# 1. ตรวจสอบและเปิด Chrome
if ! curl -s http://localhost:$DEBUG_PORT/json > /dev/null 2>&1; then
    echo "🌐 กำลังเปิด Chrome (Debug Mode)..."
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --remote-debugging-port=$DEBUG_PORT \
      --user-data-dir="$PROFILE_DIR" \
      --no-first-run \
      --no-default-browser-check \
      "https://business.facebook.com/latest/inbox/all" > /dev/null 2>&1 &
    
    echo "⏳ รอ Chrome เริ่มสร้างกระบวนการ..."
    for i in {1..30}; do
        if curl -s http://localhost:$DEBUG_PORT/json > /dev/null 2>&1; then
            echo "✅ Chrome พร้อมใช้งานแล้ว!"
            break
        fi
        sleep 1
        if [ $i -eq 30 ]; then
            echo "❌ Chrome ใช้เวลานานเกินไปในการตอบสนอง"
            exit 1
        fi
    done
else
    echo "✅ Chrome เปิดอยู่แล้วที่พอร์ต $DEBUG_PORT"
fi

echo ""
echo "🔄 เริ่มต้นการทำงานของ Sync Agent..."
echo "📌 หากยังไม่ได้ Login Facebook กรุณาทำให้เรียบร้อยในเบราว์เซอร์"
echo ""

# 2. รัน Script Sync (ใช้ --force เพื่อให้มั่นใจว่าดึงข้อมูลย้อนหลังครบถ้วน)
node "$SCRIPT_DIR/sync_agents_v4_unified.js" --attach --limit=9999 --loop --delay=45 --force

echo ""
echo "เสร็จสิ้นการทำงาน"
read -p "กด Enter เพื่อปิดหน้าต่างนี้..."
