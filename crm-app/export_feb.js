const fs = require('fs');
const path = require('path');

async function exportFebThreads() {
    console.log('Building target queue from JSON customer __index__.json cache...');

    const indexFile = path.join(__dirname, 'cache', 'customer', '__index__.json');
    if (!fs.existsSync(indexFile)) {
        console.error("No __index__.json cache found at", indexFile);
        process.exit(1);
    }

    const indexContent = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    const allCustomers = indexContent.data || [];

    // Load existing sync cache to try and find UID mappings (15 digits)
    const syncCachePath = path.join(__dirname, 'cache', 'synced_threads.json');
    let syncCache = {};
    if (fs.existsSync(syncCachePath)) {
        try {
            syncCache = JSON.parse(fs.readFileSync(syncCachePath, 'utf8'));
        } catch (e) { }
    }

    console.log(`Discovered ${allCustomers.length} total customer mappings in Cache Index.`);

    // We cannot reliably filter by date in the index, so we will generate a target list of ALL valid FB_CHAT targets
    // The scraper sync cache will skip those already processed.
    const conversations = allCustomers.filter(c => c.id && String(c.id).includes('FB_CHAT_'));

    // Format them for the scraper
    const exportList = conversations.map(c => {
        const rawId = String(c.id).replace('FB_CHAT_', '');

        // Find if we have a UID (15 digits) for this customer
        // Strategy 1: The ID itself is 15 digits
        let uidCandidate = rawId.length === 15 ? rawId : null;

        // Strategy 2: Check if this PSID is mapped to a UID in our sync cache
        if (!uidCandidate) {
            // Check mapping by PSID (rawId)
            const cached = syncCache[rawId];
            if (cached && cached.mapping && String(cached.mapping).length === 15) {
                uidCandidate = cached.mapping;
            } else {
                // Also check if prefix version is the key
                const cachedWithPrefix = syncCache[c.id];
                if (cachedWithPrefix && cachedWithPrefix.mapping && String(cachedWithPrefix.mapping).length === 15) {
                    uidCandidate = cachedWithPrefix.mapping;
                }
            }
        }

        return {
            id: uidCandidate || rawId, // Use UID if found, otherwise PSID
            convId: c.id,
            psid: rawId,
            uid: uidCandidate,
            customerName: c.name || 'Unknown'
        };
    });

    const outputPath = path.join(__dirname, 'feb_threads.json');
    fs.writeFileSync(outputPath, JSON.stringify(exportList, null, 2));

    console.log(`Exported to ${outputPath}`);
}

exportFebThreads().catch(e => {
    console.error(e);
    process.exit(1);
});
