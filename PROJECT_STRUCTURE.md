# โครงสร้างโปรเจค Data Hub อาณาจักร V School (Project Structure)

ไฟล์นี้อธิบายโครงสร้างไดเรกทอรี (Directory Structure) ทั้งหมดในโปรเจค `data_hub` แบบละเอียด เพื่อให้ง่ายต่อการดึงข้อมูล การดูแลรักษา และสานต่อระบบในอนาคตครับ

---

## ต้นไม้ไดเรกทอรี (Directory Tree)

```text
data_hub/                      ← [Root] หน้าบ้านหลักของโปรเจค
│
├── .agents/                   # การตั้งค่าสำหรับระบบ AI Assistant ของ IDE (เช่น Workflows อัตโนมัติเวลาเราพิมพ์ /slash-command)
├── .venv/                     # สภาพแวดล้อม (Virtual Environment) ของ Python (ไม่นำขึ้น Git)
├── archive/                   # ไฟล์เก่า/ไม่ได้ใช้งานแล้ว (ซ่อนไว้เพื่อลดความรก เช่น ไฟล์ Excel อุปกรณ์)
├── customer/                  # โฟลเดอร์สำหรับเก็บ Backup หรือ Log ของข้อมูลลูกค้า (อดีต)
├── employee/                  # โฟลเดอร์ Backup ข้อมูลพนักงานเบื้องต้น (ปัจจุบันถูกย้ายเข้าฐานข้อมูลแล้ว)
├── logs/                      # เก็บไฟล์ Logs การทำงานหรือ Error ของระบบต่างๆ
│
├── crm-app/                   # ⭐ [หัวใจหลัก] Web Application และระบบ CRM (Next.js + React)
│   ├── docs/                  # เอกสารเชิงเทคนิคระดับแอปพลิเคชัน (เช่น ADR: Architecture Decision Records)
│   ├── prisma/                # โครงสร้างฐานข้อมูล (Schema) และไฟล์ Migrate สำหรับต่อ SQL DB
│   ├── public/                # ไฟล์ Static สื่อต่างๆ (รูปภาพโฆษณา, assets, ไอคอน) ที่จะใช้แสดงบนหน้าเว็บ
│   ├── src/                   # Source Code ทั้งหมดของเว็บ
│   │   ├── app/               # ระบบ Routing และ API Endpoints (เช่น /api/marketing, /api/webhooks)
│   │   ├── components/        # ชิ้นส่วนหน้าตาของเว็บ (UI) เช่น Analytics.js, FacebookChat.js, CustomerCard.js
│   │   ├── lib/               # ไลบรารีคอร์หลักที่เขียนเอง เช่น chatService.js (บริการแชท)
│   │   ├── utils/             # โค้ดที่ช่วยคำนวณ Business Logic หรือจัด Format ต่างๆ
│   │   └── workers/           # ไฟล์สำหรับทำ Background job หรือสคริปต์ย่อยๆ ที่ทำงานอยู่เบื้องหลัง
│   ├── package.json           # กำหนด Library (Dependencies) ฝั่ง Node.js ที่ Web App ตัวนี้ต้องใช้
│   ├── next.config.js         # ไฟล์ตั้งค่าของ Next.js Framework
│   ├── tailwind.config.js     # ไฟล์ตั้งค่าตกแต่งความสวยงาม (CSS Tailwind)
│   └── .env                   # ตัวแปรความลับสำหรับรันโค้ด (เช่น Database URL, API Keys)
│
├── docs/                      # เอกสารอ้างอิง (Reference) ระดับโปรเจค
│   └── mes/                   # ไฟล์ระเบียบและมาตรฐาน Manufacturing Execution System (MES)
│
├── knowledge/                 # 🧠 ฐานความรู้สำหรับระบบ AI Chatbot (Knowledge Base)
│   ├── vector_index.json      # ฐานข้อมูล Vector DB ที่ AI เอาไว้ใช้ค้นหาด้วยความหมาย (ไม่นำขึ้น Git)
│   └── vschool_faq.json       # ข้อมูลตั้งต้นที่คนใส่เข้าไป ว่ามีคำถาม-ตอบ (FAQ) อะไรบ้าง
│
├── marketing/                 # 📈 ส่วนข้อมูลและ Config สำหรับระบบการตลาด
│   └── config/
│       └── ad_mapping.json    # ไฟล์ตั้งค่าการจับคู่โฆษณา (Ad ID → Campaign) เพื่อการวัดผลแม่นยำ
│
├── products/                  # 🍣 ฐานข้อมูลสินค้า (คอร์สเรียนและแพ็กเกจ)
│   ├── courses/               # ไฟล์ JSON เก็บเนื้อหาคอร์สเรียนแยกตามวิชา
│   ├── packages/              # ไฟล์ JSON เก็บแพ็กเกจที่เกิดจากการรวมหลายๆ คอร์ส
│   ├── packages_picture/      # รูปภาพปกโฆษณา/ปกแพ็กเกจ
│   └── course_summary.md      # ไฟล์สรุปรายการสินค้า ราคา และระยะเวลาเรียนทั้งหมด (Master Sheet)
│
├── scripts/                   # ⚙️ สคริปต์อัตโนมัติ (Automations) แบบ Standalone ไว้รันเดี่ยวๆ
│   ├── backfill_member_id.js  # สคริปต์เติมรหัสสมาชิกย้อนหลัง
│   ├── generate_catalog.js    # สคริปต์รวมและดึงข้อมูล Catalog สินค้า
│   ├── refactor_customer_ids.py # สคริปต์สำหรับเปลี่ยน/จัดการรูปแบบรหัสลูกค้าใหม่
│   ├── update_cats.js         # สคริปต์แก้ไขและอัปเดตข้อมูลหมวดหมู่ (JavaScript)
│   └── update_cats.py         # สคริปต์แก้ไขและอัปเดตข้อมูลหมวดหมู่ (Python)
│
├── .gitignore                 # ระบุบอก Git ว่าไม่ต้องเอาไฟล์ไหนขึ้น Server (เช่น ซ่อนรหัสผ่าน, ซ่อนของหนักๆ)
├── data_hub.code-workspace    # ไฟล์เซฟการตั้งค่า Workspace เพื่อให้เปิดใน VS Code ได้เป็นระเบียบ
└── รันระบบ_NextJS.command      # ไอคอนทางลัดสำหรับคลิกเปิดระบบรัน Server ทันที
```

---

## คำแนะนำเพิ่มเติมในการไล่โค้ด (Navigation Guide)

- **ถ้าต้องการแก้หน้าตาเว็บ:** แวะไปที่ `crm-app/src/components/` และ `crm-app/src/app/page.js`
- **ถ้าต้องการดูระบบดึงข้อมูล Facebook (Webhook & Ads):** อยู่ที่ `crm-app/src/app/api/...`
- **ถ้าต้องการแก้ไขฐานข้อมูล/เพิ่มคอลัมน์:** แวะไปที่ `crm-app/prisma/schema.prisma`
- **ถ้าต้องการแก้ไขราคาสินค้า/รายละเอียดคอร์ส:** แวะไปที่ `products/` (ไฟล์ `course_summary.md` และ JSON ในโฟลเดอร์ย่อย)
- **ถ้า AI ตอบคำถามผิด:** ให้ไปเพิ่มข้อมูลให้ AI เรียนใหม่ใน `knowledge/vschool_faq.json` แล้วสั่ง Ingest ใหม่อีกรอบ
