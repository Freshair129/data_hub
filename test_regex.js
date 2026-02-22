
function extractAgentFromMessages(messages) {
    const assignmentPatterns = [
        /(.+) กำหนดการสนทนานี้ให้กับ (.+)/,
        /ระบบมอบหมายแชทนี้ให้กับ (.+) ผ่านระบบอัตโนมัติ/,
    ];

    for (const msg of messages) {
        const text = msg.content || msg.message || '';
        for (let i = 0; i < assignmentPatterns.length; i++) {
            const match = text.match(assignmentPatterns[i]);
            if (match) {
                const rawName = (i === 0 ? match[2] : match[1]).trim();
                return rawName;
            }
        }
    }
    return null;
}

const testMessages = [
    { content: "Jutamat Fah N'Finn Sangprakai กำหนดการสนทนานี้ให้กับ Jutamat Fah N'Finn Sangprakai" },
    { content: "ระบบมอบหมายแชทนี้ให้กับ Preeyaporn NuPhung Kornvathin ผ่านระบบอัตโนมัติ" }
];

console.log('Result 1:', extractAgentFromMessages([testMessages[0]]));
console.log('Result 2:', extractAgentFromMessages([testMessages[1]]));
