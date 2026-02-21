/**
 * ID Utility
 * Implements custom formatting for various system identifiers.
 */

/**
 * Sanitizes a name to English characters only, removing spaces and special characters.
 * @param {string} name 
 * @returns {string}
 */
export function sanitizeName(name) {
    if (!name) return 'Unknown';
    // Remove non-English characters and common symbols, keep alphanumeric
    return name.replace(/[^\x00-\x7F]/g, '')
        .replace(/\s+/g, '')
        .replace(/[^a-zA-Z0-9]/g, '') || 'User';
}

/**
 * Maps channel name to abbreviation.
 * @param {string} channel 
 * @returns {string}
 */
export function mapChannel(channel) {
    const c = (channel || '').toLowerCase();
    if (c.includes('facebook') || c === 'fb') return 'FB';
    if (c.includes('line') || c === 'loa') return 'LOA';
    return 'XX';
}

/**
 * Determines origin based on presence of ad data.
 * @param {object} metadata 
 * @returns {string}
 */
export function getOrigin(metadata) {
    if (metadata && (metadata.ad_id || metadata.campaign_id || metadata.ad_set_id)) {
        return 'AD';
    }
    return 'OG';
}

/**
 * Generates formatted Customer ID.
 * @param {string} channel 
 * @param {string} origin 
 * @param {string} name 
 * @param {string} extId 
 * @returns {string}
 */
export function generateCustomerId(channel, origin, name, extId) {
    const ch = mapChannel(channel);
    const sn = sanitizeName(name);
    return `TVS_${ch}_${origin}_${sn}_${extId}`;
}

/**
 * Generates formatted Conversation ID.
 * @param {string} channel 
 * @param {string} origin 
 * @param {string} extId 
 * @returns {string}
 */
export function generateConversationId(channel, origin, extId) {
    const ch = mapChannel(channel);
    const ts = Date.now().toString().slice(-6); // Last 6 digits for entropy
    return `${ch}_TVS_${origin}_${ts}_${extId}`;
}

/**
 * Generates Session ID based on a starting timestamp.
 * @param {string} extId 
 * @param {string|Date} timestamp 
 * @returns {string}
 */
export function generateSessionId(extId, timestamp) {
    const date = new Date(timestamp || Date.now());
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    const timeStr = date.toISOString().split('T')[1].split('.')[0].replace(/:/g, ''); // HHMMSS
    return `session_${dateStr}_${timeStr}_${extId}`;
}

/**
 * Generates formatted Message ID.
 * @param {string} channel 
 * @param {string} sessionId 
 * @returns {string}
 */
export function generateMessageId(channel, sessionId) {
    const ch = mapChannel(channel).toLowerCase();
    return `msg_${ch}_${sessionId}`;
}
