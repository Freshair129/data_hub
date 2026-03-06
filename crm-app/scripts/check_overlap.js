
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { Pool } = require('pg');

const SYNC_CACHE_PATH = '/Users/ideab/Desktop/data_hub/crm-app/cache/synced_threads.json';

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        const syncCache = JSON.parse(fs.readFileSync(SYNC_CACHE_PATH, 'utf8'));
        const cacheIds = Object.keys(syncCache);

        console.log(`Cache IDs: ${cacheIds.length}`);

        const dbRes = await pool.query("SELECT id, conversation_id, participant_id FROM conversations");
        const dbRows = dbRes.rows;

        let matches = 0;
        for (const cacheId of cacheIds) {
            const dbMatch = dbRows.find(row =>
                row.conversation_id === cacheId ||
                row.conversation_id === `t_${cacheId}` ||
                row.participant_id === cacheId
            );
            if (dbMatch) {
                matches++;
                if (matches < 10) console.log(`Match: ${cacheId} -> DB Conv ${dbMatch.conversation_id}`);
            }
        }
        console.log(`Total Matches found between cache and DB: ${matches}`);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
main();
