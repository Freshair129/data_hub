
const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const ids = ['cmm3raas8000kmwm69xum34k2', 'cmm3raaf4000amwm6it4r9mu1', 'cmm3rac6o001nmwm67ewz450t', 'cmm3raaur000qmwm6suy38uif', 'cmm7jpm1g08n09xm6sp1rgbcq'];
    try {
        for (const id of ids) {
            const res = await pool.query('SELECT from_name, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [id]);
            console.log('\n--- CONV: ' + id + ' ---');
            res.rows.forEach(m => {
                console.log(`[${m.from_name}]: ${m.content}`);
            });
        }
    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        await pool.end();
    }
}
main();
