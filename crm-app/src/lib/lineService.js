
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN;

/**
 * Sends a notification to LINE Notify
 */
export async function sendLineNotify(message) {
    if (!LINE_NOTIFY_TOKEN) {
        console.warn('[LINE] Skip sending: LINE_NOTIFY_TOKEN not found.');
        return { success: false };
    }

    try {
        const response = await fetch('https://notify-api.line.me/api/notify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${LINE_NOTIFY_TOKEN}`
            },
            body: new URLSearchParams({ message: message })
        });

        const data = await response.json();
        return { success: data.status === 200 };
    } catch (e) {
        console.error('[LINE] Error sending notify:', e.message);
        return { success: false };
    }
}
