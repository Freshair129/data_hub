# Clean Code & Technical Debt Audit

จากการตรวจสอบ Codebase ปัจจุบัน (โดยเฉพาะไฟล์หลักอย่าง `db.js` และ `cacheSync.js`) พบจุดที่ขัดกับหลักการ Clean Code และอาจก่อให้เกิดปัญหา (Technical Debt) ในระยะยาวดังนี้ครับ:

## 1. การละเมิดหลักการ Single Responsibility (SRP)
ไฟล์ `src/lib/db.js` แบกรับภาระหนักเกินไป (Fat File) แทนที่จะทำหน้าที่เชื่อมต่อ DB อย่างเดียว แต่กลับมี Logic อื่นปนอยู่เต็มไปหมด เช่น:
- มีการรวมเอาวิธีต่อ **Prisma (PostgreSQL)** และวิธีอ่านไฟล์ **JSON** ไว้ในไฟล์เดียวกัน
- มีฟังก์ชัน `resolveAgentFromContent()` ที่ใช้ Regex ตัดคำหาชื่อพนักงานแฝงอยู่ในฟังก์ชันดึงข้อมูลลูกค้า (`getAllCustomers`) ซึ่งถือเป็นการแอบซ่อน Business Logic ไว้ใน Database Layer

## 2. การเขียนโค้ดซ้ำซ้อน (Violating DRY Principle)
เกือบทุกฟังก์ชันใน `db.js` (กว่า 20 ฟังก์ชัน) จะมีการเขียน `If-Else` เช็คเงื่อนไขเดิมซ้ำๆ กันทั้งหมด:
```javascript
if (DB_ADAPTER === 'prisma') {
    // ... logic ...
}
// Cache Fallback logic...
```
**วิธีแก้ที่ถูกต้อง**: ควรใช้ **Strategy Pattern** แยกไฟล์เป็น `PrismaAdapter.js` และ `JsonAdapter.js` แล้วค่อยสลับการใช้งานที่ตัวแปรหลักครั้งเดียว

## 3. การใช้ Synchronous File System (Performance Bottleneck)
ในไฟล์ `cacheSync.js` และ `db.js` มีการใช้คำสั่งอ่าน/เขียนไฟล์แบบ **"รอให้เสร็จก่อนค่อยทำอย่างอื่น" (Synchronous)** เป็นจำนวนมาก:
- `fs.readFileSync(...)`, `fs.writeFileSync(...)`, `fs.readdirSync(...)`
- **ผลเสีย**: เมื่อระบบมีผู้ใช้งานพร้อมกันเยอะๆ (Concurrent requests) คำสั่งเหล่านี้จะไป Block การทำงานหลักของ Node.js ทำให้ทั้งระบบช้าลงหรือค้างได้ชั่วขณะ (ควรใช้ `fs.promises.readFile` แทน)

## 4. การจัดการ Error ที่ซ่อนปัญหา (Error Swallowing)
หลายจุดใน `db.js` มีบล็อก `try-catch` ที่เพียงแค่พิมพ์ `console.warn` แจ้งเตือนแผ่วๆ แล้วทำงานข้ามไปใช้ JSON ทันที:
```javascript
} catch (e) {
    console.warn('[DB] Prisma query failed, falling back to Cache:', e.message);
}
```
- **ผลเสีย**: หาก Database หลักล่มจริงๆ ระบบจะทำงานต่อด้วยไฟล์เก่าๆ โดยที่ทีมพัฒนาอาจไม่รู้ตัวเลยว่าคนกำลังใช้งานระบบแบบ Fallback อยู่

## 5. ความไม่สม่ำเสมอของตัวแปร (Inconsistent Naming)
ใน `db.js` เราจะเห็นการดักจับตัวแปรที่มีชื่อปะปนกันระหว่าง `snake_case` (จาก Python/API เก่า) และ `camelCase` (จาก JS/Prisma ใหม่):
- `customerId: data.customer_id || data.customerId`
- สิ่งนี้ทำให้การส่งต่อตัวแปรระหว่างฟังก์ชันทำได้ยาก และเสี่ยงต่อการเกิด Bug พิมพ์ชื่อผิดได้ง่าย

## 6. Scripts Folder ซับซ้อนและไม่มีการจัดระเบียบ (Cluttered Scripts)
โฟลเดอร์ `scripts/` มีไฟล์มากถึง 39 ไฟล์ ทั้ง Python, TypeScript และ JavaScript 
- มีทั้งไฟล์ที่ใช้จริงใน Cron Job (`sync_sales.ts`), ไฟล์ที่ใช้ Migrate ข้อมูลครั้งเดียวทิ้ง (`migrate_employee.ts`), และไฟล์เทส 
- **ผลเสีย**: นักพัฒนาคนใหม่เข้ามาจะไม่รู้เลยว่าไฟล์ไหนห้ามลบ ไฟล์ไหนลบได้ ควรแยกหมวดหมู่เป็น `/cron`, `/migrations`, `/tools` ให้ชัดเจนครับ
