const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'logs', 'sync_data_2026-03-02.json');

if (!fs.existsSync(logFile)) {
    console.log('Log file not found.');
    process.exit(1);
}

const corruptedMessages = [
    " รูปเผือกทอดคะ",
    "😁😁😁",
    "คอร์สนี้ได้แค่ 2 เมนูใช่ไหมคะ"
];

try {
    const data = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    const originalCount = data.length;

    // 100001492181818 is the valid thread that SHOULD have these messages (Awika Beam)
    const validThreadID = "100001492181818";

    const sanitizedData = data.map(thread => {
        if (thread.threadID === validThreadID) return thread;

        // For other threads, filter out the corrupted messages
        const originalSendersCount = thread.senders.length;
        thread.senders = thread.senders.filter(s => {
            if (s.msgText === null) return false; // Also remove the null entries leaked
            return !corruptedMessages.includes(s.msgText);
        });

        if (thread.senders.length !== originalSendersCount) {
            console.log(`Cleaned thread ${thread.threadID}: removed ${originalSendersCount - thread.senders.length} leaked messages.`);
        }
        return thread;
    }).filter(thread => thread.senders.length > 0); // Keep threads only if they still have messages

    fs.writeFileSync(logFile, JSON.stringify(sanitizedData, null, 2), 'utf8');
    console.log(`\n✅ Sanitized ${logFile}`);
    console.log(`Original threads: ${originalCount}, Remaining threads: ${sanitizedData.length}`);

} catch (e) {
    console.error('Error during cleanup:', e.message);
}
