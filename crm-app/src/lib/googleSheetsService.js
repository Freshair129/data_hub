
const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

/**
 * Sends data to a Google Sheet via Apps Script Web App
 */
export async function sendToGoogleSheet(data) {
    if (!GOOGLE_SHEETS_WEBHOOK_URL) {
        console.warn('[GoogleSheet] Skip sending: GOOGLE_SHEETS_WEBHOOK_URL not found.');
        return { success: false };
    }

    try {
        const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...data,
                timestamp: new Date().toISOString()
            })
        });

        return { success: response.ok };
    } catch (e) {
        console.error('[GoogleSheet] Error sending data:', e.message);
        return { success: false };
    }
}

/**
 * Fetches data from a Google Sheet via Apps Script Web App
 * The Apps Script should handle the GET request and return JSON
 */
export async function fetchFromGoogleSheet() {
    if (!GOOGLE_SHEETS_WEBHOOK_URL) {
        console.warn('[GoogleSheet] Skip fetching: GOOGLE_SHEETS_WEBHOOK_URL not found.');
        return [];
    }

    try {
        const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
            method: 'GET'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return Array.isArray(data) ? data : (data.data || []);
    } catch (e) {
        console.error('[GoogleSheet] Error fetching data:', e.message);
        return [];
    }
}
