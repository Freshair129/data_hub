/**
 * sync_agents_v3.js — V School Agent Sync (Network & Local Log Edition)
 * * ระบบดึงชื่อแอดมินที่ตอบแชทจากหน้าเว็บ Facebook Business Suite
 * อัปเกรด: เพิ่มการดักจับ Network และบันทึกลงไฟล์ Local แทนการยิง API
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// --- Configuration ---
const LOG_DIR = path.join(__dirname, 'logs');
const CACHE_FILE = path.join(__dirname, '.sync_cache_v2.json');
const ATTACH = process.argv.includes('--attach');
const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '9222');
const DELAY = 5; // นาที
const LOOP = true;

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

/**
 * ฟังก์ชันบันทึกข้อมูลลงไฟล์ Local (JSON & Markdown)
 */
function saveToLocal(threadID, data) {
    const today = new Date().toISOString().split('T')[0];

    // 1. บันทึกเป็น JSON สำหรับให้บอทตัวอื่นใน data_hub อ่านต่อ
    const jsonPath = path.join(LOG_DIR, `sync_data_${today}.json`);
    let history = [];
    if (fs.existsSync(jsonPath)) {
        try { history = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) { history = []; }
    }

    history.push({
        id: Date.now(),
        threadID,
        ...data,
        timestamp: new Date().toLocaleString('th-TH')
    });
    fs.writeFileSync(jsonPath, JSON.stringify(history, null, 2));

    // 2. บันทึกเป็น Markdown สำหรับคนอ่าน (Daily Report)
    const mdPath = path.join(LOG_DIR, `daily_report_${today}.md`);
    const isNewFile = !fs.existsSync(mdPath);
    const adminNames = data.senders ? data.senders.map(s => s.name).join(', ') : 'Unknown';
    const content = `| ${new Date().toLocaleTimeString('th-TH')} | ${threadID} | ${adminNames} | ${data.text ? data.text.slice(0, 40).replace(/\n/g, ' ') : '-'} |\n`;

    if (isNewFile) {
        fs.writeFileSync(mdPath, "# Daily Admin Chat Sync Report\n\n| Time | Thread ID | Admin Names | Snippet |\n|---|---|---|---|\n");
    }
    fs.appendFileSync(mdPath, content);
}

/**
 * ระบบดักฟัง Network (Intercept Network Response)
 * เพื่อหาข้อมูลที่มองไม่เห็นบนหน้าจอจาก JSON ของ Facebook
 */
async function setupNetworkInterception(page) {
    page.on('response', async (response) => {
        const url = response.url();
        // สนใจเฉพาะ GraphQL หรือ Messaging API
        if (url.includes('graphql') || url.includes('messaging')) {
            try {
                const text = await response.text();
                // ค้นหาข้อมูลแอดมินในก้อน JSON
                if (text.includes('messaging_sender') || text.includes('short_name')) {
                    const json = JSON.parse(text);
                    // บันทึกดิบไว้ใน logs/network_dumps เพื่อวิเคราะห์ภายหลัง
                    const dumpPath = path.join(LOG_DIR, 'network_dump.json');
                    fs.appendFileSync(dumpPath, JSON.stringify({ url, data: json }, null, 2) + ',\n');
                }
            } catch (e) {
                // Ignore parsing errors for non-json responses
            }
        }
    });
}

async function syncAgents() {
    let browser, context;
    try {
        console.log(`🚀 [${new Date().toLocaleTimeString()}] Starting sync process...`);

        if (ATTACH) {
            browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
            context = browser.contexts()[0];
        } else {
            // โหมดปกติถ้าไม่ได้เปิด Chrome ค้างไว้
            browser = await chromium.launch({ headless: false });
            context = await browser.newContext();
        }

        const page = context.pages()[0] || await context.newPage();
        await setupNetworkInterception(page);

        // --- เริ่มขั้นตอนการทำงานหลัก ---
        // (ส่วนนี้จะใช้ Logic เดิมของคุณในการไล่เปิดทีละแชท)

        const currentConvId = "example_thread_id"; // จำลองจาก loop ของคุณ
        const senders = [{ name: "Admin Somchai", id: "123" }]; // จำลองข้อมูลที่กวาดได้
        const lastMessage = "รับทราบครับผม";

        console.log(`📝 Logging local data for Thread: ${currentConvId}`);

        // บันทึกลงเครื่องแทนการส่งไป DB
        saveToLocal(currentConvId, {
            senders,
            text: lastMessage,
            source: 'automation_scraper'
        });

    } catch (err) {
        console.error(`❌ Error during sync: ${err.message}`);
    } finally {
        if (!ATTACH && browser) await browser.close();
    }
}

// Main Runner
async function run() {
    console.log("🛠 Data Hub Automation: Sync Agents V2 Active");
    if (LOOP) {
        while (true) {
            await syncAgents();
            console.log(`💤 Waiting ${DELAY} minutes for next round...`);
            await new Promise(r => setTimeout(r, DELAY * 60 * 1000));
        }
    } else {
        await syncAgents();
    }
}

run();