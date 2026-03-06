#!/bin/bash
# ──────────────────────────────────────────────────────────
# รัน Agent Sync — ดึงชื่อแอดมินจาก Business Suite
# ดับเบิ้ลคลิกไฟล์นี้หลังจากเปิด Chrome และเข้า Inbox แล้ว
# ──────────────────────────────────────────────────────────

# ไปที่โฟลเดอร์ crm-app (ไม่ว่าจะรันจากที่ไหน)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CRM_DIR="$( dirname "$SCRIPT_DIR" )"

echo ""
echo "🔄 V School — Agent Sync"
echo "   โฟลเดอร์: $CRM_DIR"
echo ""

# ตรวจว่า Chrome debug พร้อมหรือยัง
if ! curl -s http://localhost:9222/json > /dev/null 2>&1; then
    echo "❌ ไม่พบ Chrome ที่เปิดด้วย debug mode"
    echo ""
    echo "   กรุณาดับเบิ้ลคลิก 'เปิด_Chrome_CRM.command' ก่อน"
    echo "   แล้ว login และเข้า Inbox ให้เรียบร้อย"
    echo ""
    read -p "กด Enter เพื่อปิด..."
    exit 1
fi

echo "✅ Chrome พร้อม — เริ่ม sync..."
echo "🔄 รันซิงก์ Agent V2 (จากล่าสุดไปเก่าสุด) ด้วย --file=feb_threads.json"

# รัน script
node "$SCRIPT_DIR/sync_agents_v2.js" --file="$CRM_DIR/feb_threads.json" --attach --limit=9999 --loop --delay=45

echo ""
echo "✅ เสร็จแล้ว!"
read -p "กด Enter เพื่อปิด..."
