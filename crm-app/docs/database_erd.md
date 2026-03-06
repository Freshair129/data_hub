# V School CRM - Entity Relationship Diagram (ERD)

**วันที่อัปเดต:** 2026-03-03  
**อ้างอิง:** `prisma/schema.prisma` และ `docs/id-mapping.yaml`

นี่คือแผนภาพแสดงความสัมพันธ์ของข้อมูล (ERD) ฉบับล่าสุดในระบบ CRM ซึ่งรวมเอาการเชื่อมโยง (Mapping) ที่แม่นยำที่สุดผ่าน Primary Key (`cuid`) และ Foreign Keys (FK) แบบ 100%

```mermaid
erDiagram
    %% ความสัมพันธ์กับลูกค้า (Customer)
    Customer ||--o{ Conversation : "ทักแชท (customerId)"
    Customer ||--o{ Order : "สั่งซื้อ (customerId)"
    Customer ||--o{ Task : "มีงานที่ต้องดูแล (customerId)"

    %% ความสัมพันธ์กับพนักงาน/แอดมิน (Employee) - จุดสำคัญของ REQ 01-03
    Employee ||--o{ Message : "ตอบแชท (responderId)"
    Employee ||--o{ Conversation : "รับผิดชอบ (assignedEmployeeId)"
    Employee ||--o{ Order : "ปิดการขาย (closedById)"
    Employee ||--o{ Task : "ได้รับมอบหมาย (assigneeId)"

    %% ความสัมพันธ์ของแชทและการขาย
    Conversation ||--o{ Message : "มีข้อความ (conversationId)"
    Conversation ||--o{ Order : "นำไปสู่คำสั่งซื้อ (conversationId)"
    
    Order ||--o{ Transaction : "มีการชำระเงิน (orderId)"

    %% ฝั่งโฆษณาและการตลาด
    Campaign ||--o{ AdSet : "มีชุดโฆษณา"
    AdSet ||--o{ Ad : "มีโฆษณา"

    Customer {
        String id PK "cuid (Primary)"
        String customerId UK "TVS-CUS-..."
        String facebookId "Customer PSID (ชัวร์ 100%)"
        String facebookName
    }

    Employee {
        String id PK "cuid (Primary)"
        String employeeId UK "TVS-EMP-..."
        String facebookId "Admin PSID (ชัวร์ 100%)"
        String facebookName 
        String nickName
    }

    Conversation {
        String id PK "cuid (Primary)"
        String conversationId UK "t_XXXXXX (Thread ID)"
        String customerId FK "เชื่อม Customer.id"
        String assignedEmployeeId FK "เชื่อม Employee.id"
    }

    Message {
        String id PK "cuid (Primary)"
        String messageId UK "msg_{psid}_{time}_{seq}"
        String conversationId FK "เชื่อม Conversation.id"
        String responderId FK "ใครตอบ: เชื่อม Employee.id"
        String fromName "ชื่อแอดมินส่งโชว์หน้า UI"
    }

    Order {
        String id PK "cuid (Primary)"
        String orderId UK 
        String customerId FK "เชื่อม Customer.id"
        String closedById FK "ใครปิดการขาย: เชื่อม Employee.id"
        String conversationId FK "แชทไหน: เชื่อม Conversation.id"
        Float totalAmount
    }

    Transaction {
        String id PK "cuid (Primary)"
        String transactionId UK
        String orderId FK "เชื่อม Order.id"
        Float amount
    }

    Task {
        String id PK "cuid (Primary)"
        String taskId UK
        String customerId FK "เชื่อม Customer.id"
        String assigneeId FK "ใครทำ: เชื่อม Employee.id"
    }

    Campaign {
        String id PK "cuid (Primary)"
        String campaignId UK "จาก FB Ads"
    }

    Ad {
        String id PK "cuid (Primary)"
        String adId UK "จาก FB Ads"
    }
```

## สรุปจุดสำคัญของโครงสร้าง (Key Architectural Changes)

1. **`Employee` เป็นศูนย์กลางของการปฏิบัติงานทั้งหมด:**
   - การกระทำทั้งหมด ไม่ว่าจะเป็น **"ใครตอบแชท" (`Message.responderId`)**, **"ใครดูแลลูกค้าคนนี้" (`Conversation.assignedEmployeeId`)** หรือ **"ใครปิดการขาย" (`Order.closedById`)** ล้วนชี้ตรงกลับมาที่ `Employee.id` (cuid) ของตาราง Employee การวัดผล KPI และค่าคอมมิชชันจึงถูกต้องที่สุด 100%
2. **เลิกใช้การยึดโยงด้วยชื่อ (String Match):**
   - แม้ Field อย่าง `fromName` หรือ `assignedAgent` จะยังเก็บอยู่ แต่ออกแบบมาเพื่อแสดงผลบนหน้าจอให้มนุษย์อ่านง่ายๆ เท่านั้น (Human-readable) ในขณะที่ฐานข้อมูลหลังบ้านและการคำนวณเงินอ้างอิงจาก FK ทั้งหมด
3. **`facebookId` (PSID) แบบเจาะจง:**
   - ทั้ง `Customer` และ `Employee` มี `facebookId` ซึ่งเป็น Page-Scoped ID (PSID) ป้องกันปัญหากรณีลูกค้าหรือแอดมินเปลี่ยนชื่อเฟสบุ๊ก
4. **Attribution Chain ที่สมบูรณ์:**
   - สายเชื่อมโยง `Conversation` -> `Order` -> `Transaction` ทำให้ระบบตอบได้ชัดเจนว่า "สลิปโอนเงินใบนี้ มาจากออเดอร์ไหน และออเดอร์นี้เกิดจากการปิดการขายในห้องแชทไหน และใครเป็นผู้ตอบในเวลานั้น"
