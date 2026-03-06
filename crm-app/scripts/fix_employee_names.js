
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        const pAliases = JSON.stringify(['Preeyaporn', 'NuPhung', 'พี่ผึ้ง']);
        const sAliases = JSON.stringify(['Satabongkot', 'Noinin', 'พี่อ้อย']);

        await pool.query("UPDATE employees SET nick_name = 'พี่ผึ้ง', metadata = jsonb_set(COALESCE(metadata, '{}'), '{aliases}', $1::jsonb) WHERE first_name = 'Preeyaporn'", [pAliases]);
        await pool.query("UPDATE employees SET nick_name = 'พี่อ้อย', metadata = jsonb_set(COALESCE(metadata, '{}'), '{aliases}', $1::jsonb) WHERE last_name = 'Noinin'", [sAliases]);

        console.log('Successfully updated nicknames and aliases.');
    } finally {
        await pool.end();
    }
}
main().catch(console.error);
