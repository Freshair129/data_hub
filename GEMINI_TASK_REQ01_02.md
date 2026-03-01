# GEMINI TASK — REQ-01 & REQ-02: Admin Responder ID Attribution
> สร้างโดย Claude | วันที่: 2026-03-01
> โปรเจค: V School CRM (`/Users/ideab/Desktop/data_hub/crm-app/`)

---

## บริบท (Context)

ระบบ CRM ของ The V School ใช้ Playwright scraper (`automation/sync_agents_v2.js`) ดึงชื่อแอดมินที่ตอบแต่ละข้อความจาก Facebook Business Suite
ผลลัพธ์ถูกส่งมาที่ API route แล้วเซฟลง `Message.fromName` เป็นแค่ **string ชื่อ** เช่น `"Satabongkot Noinin"`

**ปัญหา:** ไม่มี FK จริงๆ ไปยัง `Employee` record
→ ทุกครั้งที่คำนวณ KPI/ค่าคอม ต้อง fuzzy string match ชื่อ = ช้า, ผิดพลาดได้, แก้ยาก

---

## เป้าหมาย (Goal)

เพิ่ม **2 FK fields** ใหม่ในระบบ:

| Field ใหม่ | Model | ชี้ไปที่ | หมายความว่า |
|---|---|---|---|
| `responderId` | `Message` | `Employee.id` | แอดมินคนที่ **ตอบข้อความนี้จริงๆ** |
| `assignedEmployeeId` | `Conversation` | `Employee.id` | แอดมินคนที่ **ดูแลแชทนี้** |

---

## งานที่ต้องทำ (Tasks)

### Phase 1 — Schema Changes (`prisma/schema.prisma`)

**1a. เพิ่ม field ใน `Message` model:**
```prisma
// เพิ่มหลัง fromId
responderId    String?      @map("responder_id")
responder      Employee?    @relation("MessageResponder", fields: [responderId], references: [id])
```

**1b. เพิ่ม field ใน `Conversation` model:**
```prisma
// เพิ่มหลัง assignedAgent
assignedEmployeeId  String?   @map("assigned_employee_id")
assignedEmployee    Employee? @relation("ConversationAssignee", fields: [assignedEmployeeId], references: [id])
```

**1c. เพิ่ม reverse relations ใน `Employee` model:**
```prisma
// เพิ่มใน Employee model (ใต้ tasks Task[])
respondedMessages     Message[]      @relation("MessageResponder")
assignedConversations Conversation[] @relation("ConversationAssignee")
```

**1d. รัน migration:**
```bash
cd /Users/ideab/Desktop/data_hub/crm-app
npx prisma migrate dev --name add_responder_employee_ids
```

ถ้า migrate ไม่ได้ (production) ให้รัน:
```bash
npx prisma db push
```

---

### Phase 2 — อัปเดต API Route (`src/app/api/marketing/chat/message-sender/route.js`)

ใน POST handler ปัจจุบัน:
- Strategy 1 (message-level): อัปเดต `fromName` แล้ว → **ต้องเพิ่ม** resolve `responderId` ด้วย
- Strategy 2 (conv-level): อัปเดต `assignedAgent` แล้ว → **ต้องเพิ่ม** set `assignedEmployeeId` ด้วย

**ตำแหน่งที่ต้องแก้ใน route.js:**

**ตำแหน่งที่ 1 — หลัง `const prisma = await getPrisma();` บน Strategy 1 (บรรทัดประมาณ 76)**
เพิ่ม helper function ที่ resolve ชื่อ admin → Employee.id:

```javascript
// Helper: resolve agent name → Employee.id
async function resolveEmployeeId(prisma, agentName) {
    if (!agentName) return null;
    try {
        const nameLower = agentName.toLowerCase().trim();
        const employees = await prisma.employee.findMany({
            where: { status: 'Active' },
            select: { id: true, firstName: true, lastName: true, nickName: true, facebookName: true, metadata: true }
        });
        const found = employees.find(e => {
            const candidates = [
                e.facebookName,
                e.nickName,
                e.firstName,
                `${e.firstName} ${e.lastName}`,
                ...(e.metadata?.aliases || [])
            ].filter(Boolean).map(v => v.toLowerCase());
            return candidates.some(c => c === nameLower || nameLower.includes(c) || c.includes(nameLower));
        });
        return found?.id || null;
    } catch (err) {
        console.error('[MsgSender] resolveEmployeeId error:', err.message);
        return null;
    }
}
```

**ตำแหน่งที่ 2 — บน Strategy 1 ใน for loop หลัง `if (match)`**

แก้ block `if (match)` จาก:
```javascript
if (match) {
    await prisma.message.update({
        where: { id: match.id },
        data: { fromName: sender.name }
    });
    updated++;
    ...
}
```

เป็น:
```javascript
if (match) {
    const employeeId = await resolveEmployeeId(prisma, sender.name);
    await prisma.message.update({
        where: { id: match.id },
        data: {
            fromName: sender.name,
            ...(employeeId ? { responderId: employeeId } : {})
        }
    });
    if (employeeId) {
        console.log(`[MsgSender] ✅ Resolved ${sender.name} → Employee.id: ${employeeId}`);
    } else {
        console.log(`[MsgSender] ⚠️ Could not resolve Employee for: ${sender.name}`);
    }
    updated++;
    ...
}
```

**ตำแหน่งที่ 3 — Strategy 2 บล็อก `if (convLevelAgent && conv)`**

แก้จาก:
```javascript
await prisma.conversation.update({
    where: { id: conv.id },
    data: { assignedAgent: convLevelAgent }
});
```

เป็น:
```javascript
const convEmployeeId = await resolveEmployeeId(prisma, convLevelAgent);
await prisma.conversation.update({
    where: { id: conv.id },
    data: {
        assignedAgent: convLevelAgent,
        ...(convEmployeeId ? { assignedEmployeeId: convEmployeeId } : {})
    }
});
```

**ข้อสำคัญ:** ฟังก์ชัน `resolveEmployeeId` ต้องอยู่นอก `POST` handler (define ที่ระดับ module) เพื่อให้ทั้ง Strategy 1 และ 2 เรียกใช้ได้

---

### Phase 3 — Backfill Script (สร้างไฟล์ใหม่)

สร้างไฟล์: `crm-app/scripts/backfill_responder_ids.js`

Script นี้ทำงานครั้งเดียว เพื่อ backfill `responderId` และ `assignedEmployeeId` ให้กับ records ที่มีอยู่แล้ว

```javascript
/**
 * backfill_responder_ids.js
 *
 * One-time script: backfill Message.responderId and Conversation.assignedEmployeeId
 * จาก fromName / assignedAgent (string) → Employee.id (FK)
 *
 * Usage: node crm-app/scripts/backfill_responder_ids.js
 */

import { PrismaClient } from '../src/generated/prisma-client/index.js';

const prisma = new PrismaClient();

async function resolveEmployeeId(employees, name) {
    if (!name) return null;
    const nameLower = name.toLowerCase().trim();
    const found = employees.find(e => {
        const candidates = [
            e.facebookName,
            e.nickName,
            e.firstName,
            `${e.firstName} ${e.lastName}`,
            ...(e.metadata?.aliases || [])
        ].filter(Boolean).map(v => v.toLowerCase());
        return candidates.some(c => c === nameLower || nameLower.includes(c) || c.includes(nameLower));
    });
    return found?.id || null;
}

async function main() {
    console.log('[Backfill] Starting REQ-01/02 backfill...\n');

    // Load all active employees once
    const employees = await prisma.employee.findMany({
        where: { status: 'Active' },
        select: { id: true, firstName: true, lastName: true, nickName: true, facebookName: true, metadata: true }
    });
    console.log(`[Backfill] Loaded ${employees.length} active employees`);

    // ─── REQ-01: Backfill Message.responderId ─────────────────────────────
    console.log('\n[Backfill] Phase 1: Messages...');

    const messages = await prisma.message.findMany({
        where: {
            fromName: { not: null },
            responderId: null
        },
        select: { id: true, fromName: true }
    });

    console.log(`[Backfill] Found ${messages.length} messages with fromName but no responderId`);

    let msgSuccess = 0;
    let msgFailed = 0;

    for (const msg of messages) {
        const employeeId = await resolveEmployeeId(employees, msg.fromName);
        if (employeeId) {
            await prisma.message.update({
                where: { id: msg.id },
                data: { responderId: employeeId }
            });
            msgSuccess++;
        } else {
            msgFailed++;
            if (msgFailed <= 10) {
                console.log(`  ⚠️ No match for: "${msg.fromName}"`);
            }
        }
    }

    console.log(`[Backfill] Messages: ✅ ${msgSuccess} linked, ❌ ${msgFailed} unresolved`);

    // ─── REQ-02: Backfill Conversation.assignedEmployeeId ─────────────────
    console.log('\n[Backfill] Phase 2: Conversations...');

    const conversations = await prisma.conversation.findMany({
        where: {
            assignedAgent: { not: null },
            assignedEmployeeId: null
        },
        select: { id: true, assignedAgent: true }
    });

    console.log(`[Backfill] Found ${conversations.length} conversations with assignedAgent but no assignedEmployeeId`);

    let convSuccess = 0;
    let convFailed = 0;

    for (const conv of conversations) {
        const employeeId = await resolveEmployeeId(employees, conv.assignedAgent);
        if (employeeId) {
            await prisma.conversation.update({
                where: { id: conv.id },
                data: { assignedEmployeeId: employeeId }
            });
            convSuccess++;
        } else {
            convFailed++;
        }
    }

    console.log(`[Backfill] Conversations: ✅ ${convSuccess} linked, ❌ ${convFailed} unresolved`);

    // ─── Summary ──────────────────────────────────────────────────────────
    console.log('\n========================================');
    console.log('[Backfill] DONE');
    console.log(`  Messages linked:      ${msgSuccess}/${messages.length}`);
    console.log(`  Conversations linked: ${convSuccess}/${conversations.length}`);
    console.log('========================================');

    await prisma.$disconnect();
}

main().catch(e => {
    console.error('[Backfill] Fatal error:', e);
    prisma.$disconnect();
    process.exit(1);
});
```

รัน script ด้วย:
```bash
cd /Users/ideab/Desktop/data_hub/crm-app
node scripts/backfill_responder_ids.js
```

---

## ไฟล์ที่ต้องแก้/สร้าง (Summary)

| ไฟล์ | Action | สิ่งที่ทำ |
|---|---|---|
| `prisma/schema.prisma` | แก้ไข | เพิ่ม responderId, assignedEmployeeId, และ reverse relations |
| `src/app/api/marketing/chat/message-sender/route.js` | แก้ไข | เพิ่ม resolveEmployeeId helper + set FK ทั้ง 2 ที่ |
| `scripts/backfill_responder_ids.js` | สร้างใหม่ | Backfill FK ให้ records เดิม |

---

## ข้อกำหนดสำคัญ (Constraints)

1. **FK ต้อง nullable** (`String?`) — เพราะไม่ทุก message จะ resolve ได้ 100%
2. **`fromName` ต้องเก็บไว้** — อย่าลบ field เดิม ใช้คู่กันได้ (string = human readable, FK = machine linkable)
3. **`assignedAgent` ต้องเก็บไว้** — เช่นเดียวกัน
4. **ห้ามใช้ fs.readFileSync** — ถ้าต้องอ่านไฟล์เพิ่มเติมในสคริปต์ ให้ใช้ `fs.promises.readFile`
5. **Error handling** — ทุก DB operation ต้อง `try/catch` และ log ด้วย `console.error('[Module]', error.message)`
6. **Convention** — ตัวแปร JS/TS ใช้ `camelCase` เสมอ

---

## Output ที่ต้องการ

เมื่องานเสร็จ โปรดสรุปผลในรูปแบบ:

```
## ผลการทำงาน

### Schema
- [ ] responderId เพิ่มใน Message ✅/❌
- [ ] assignedEmployeeId เพิ่มใน Conversation ✅/❌
- [ ] reverse relations ใน Employee ✅/❌
- [ ] Migration รันสำเร็จ ✅/❌ (error message ถ้ามี)

### Route.js
- [ ] resolveEmployeeId function เพิ่มแล้ว ✅/❌
- [ ] Strategy 1: set responderId ✅/❌
- [ ] Strategy 2: set assignedEmployeeId ✅/❌

### Backfill Script
- [ ] ไฟล์สร้างแล้ว ✅/❌
- [ ] รันแล้ว: Messages linked X/Y, Conversations linked X/Y
- [ ] Unresolved names ที่ไม่ match: [list ชื่อ]

### ปัญหาที่พบ (ถ้ามี)
- ...
```
