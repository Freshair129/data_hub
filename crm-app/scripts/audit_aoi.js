const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const aoiId = 'cmlwnuhfa0001bzm6c2tr5ic0';

    // 1. Basic stats
    const totalMsgs = (await pool.query('SELECT COUNT(*) as c FROM messages WHERE responder_id = $1', [aoiId])).rows[0].c;
    const totalConvs = (await pool.query('SELECT COUNT(DISTINCT conversation_id) as c FROM messages WHERE responder_id = $1', [aoiId])).rows[0].c;
    const activeDays = (await pool.query("SELECT COUNT(DISTINCT DATE(created_at)) as c FROM messages WHERE responder_id = $1", [aoiId])).rows[0].c;

    console.log('=== AOI BASIC STATS ===');
    console.log('Total Messages:', totalMsgs);
    console.log('Total Conversations:', totalConvs);
    console.log('Active Days:', activeDays);

    // 2. Hourly distribution
    const hourly = await pool.query("SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count FROM messages WHERE responder_id = $1 GROUP BY hour ORDER BY hour", [aoiId]);
    console.log('\n=== HOURLY DISTRIBUTION ===');
    console.log(JSON.stringify(hourly.rows));

    // 3. Top conversations by message count
    const topConvs = await pool.query(`
        SELECT m.conversation_id, COUNT(*) as msg_count
        FROM messages m
        WHERE m.conversation_id IN (SELECT DISTINCT conversation_id FROM messages WHERE responder_id = $1)
        GROUP BY m.conversation_id ORDER BY msg_count DESC LIMIT 8
    `, [aoiId]);

    // 4. Fetch full text of top 6 conversations
    for (const conv of topConvs.rows.slice(0, 6)) {
        const msgs = await pool.query(`
            SELECT from_name, content, created_at, responder_id,
                   EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at))) / 60.0 as gap_minutes
            FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC
        `, [conv.conversation_id]);
        console.log('\n=== CONV: ' + conv.conversation_id + ' | MSGS: ' + conv.msg_count + ' ===');
        msgs.rows.forEach(m => {
            const gap = m.gap_minutes ? `[+${Math.round(m.gap_minutes)}m]` : '[START]';
            const isAoi = m.responder_id === aoiId ? ' 🟣AOI' : '';
            const content = (m.content || '').substring(0, 140).replace(/\n/g, ' ');
            console.log(`${gap} [${m.from_name}]${isAoi}: ${content}`);
        });
    }

    // 5. Response time buckets
    const responseGaps = await pool.query(`
        WITH ordered AS (
            SELECT from_name, created_at, responder_id, conversation_id,
                   LAG(from_name) OVER (PARTITION BY conversation_id ORDER BY created_at) as prev_sender,
                   LAG(created_at) OVER (PARTITION BY conversation_id ORDER BY created_at) as prev_time
            FROM messages
            WHERE conversation_id IN (SELECT DISTINCT conversation_id FROM messages WHERE responder_id = $1)
        )
        SELECT
            CASE
                WHEN EXTRACT(EPOCH FROM (created_at - prev_time)) / 60 < 5 THEN 'under_5min'
                WHEN EXTRACT(EPOCH FROM (created_at - prev_time)) / 60 < 30 THEN '5_to_30min'
                WHEN EXTRACT(EPOCH FROM (created_at - prev_time)) / 60 < 60 THEN '30_to_60min'
                WHEN EXTRACT(EPOCH FROM (created_at - prev_time)) / 60 < 240 THEN '1_to_4hr'
                ELSE 'over_4hr'
            END as response_bucket, COUNT(*) as count
        FROM ordered
        WHERE responder_id = $1
          AND prev_sender != 'The V School'
          AND prev_sender NOT LIKE '%Satabongkot%'
          AND prev_sender NOT LIKE '%Noinin%'
        GROUP BY response_bucket ORDER BY count DESC
    `, [aoiId]);
    console.log('\n=== AOI RESPONSE TIME BUCKETS ===');
    console.log(JSON.stringify(responseGaps.rows));

    // 6. Who sends last message
    const lastMsgs = await pool.query(`
        WITH last_msgs AS (
            SELECT DISTINCT ON (conversation_id) conversation_id, from_name
            FROM messages
            WHERE conversation_id IN (SELECT DISTINCT conversation_id FROM messages WHERE responder_id = $1)
            ORDER BY conversation_id, created_at DESC
        )
        SELECT
            CASE WHEN from_name LIKE '%Satabongkot%' OR from_name LIKE '%Noinin%' OR from_name = 'The V School' THEN 'admin_last' ELSE 'customer_last' END as who_ended,
            COUNT(*) as count
        FROM last_msgs GROUP BY who_ended
    `, [aoiId]);
    console.log('\n=== WHO SENDS LAST MESSAGE ===');
    console.log(JSON.stringify(lastMsgs.rows));

    // 7. Price-related conversations
    const priceConvs = await pool.query(`
        SELECT DISTINCT m.conversation_id FROM messages m
        WHERE m.conversation_id IN (SELECT DISTINCT conversation_id FROM messages WHERE responder_id = $1)
        AND (m.content ILIKE '%ราคา%' OR m.content ILIKE '%เท่าไหร่%' OR m.content ILIKE '%บาท%' OR m.content ILIKE '%กี่บาท%')
        LIMIT 3
    `, [aoiId]);
    console.log('\n=== PRICE CONVOS ===');
    for (const conv of priceConvs.rows) {
        const msgs = await pool.query(`
            SELECT from_name, content, created_at, responder_id,
                   EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at))) / 60.0 as gap_minutes
            FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC
        `, [conv.conversation_id]);
        console.log('\n--- PRICE: ' + conv.conversation_id + ' ---');
        msgs.rows.forEach(m => {
            const gap = m.gap_minutes ? `[+${Math.round(m.gap_minutes)}m]` : '[START]';
            const isAoi = m.responder_id === aoiId ? ' 🟣AOI' : '';
            const content = (m.content || '').substring(0, 150).replace(/\n/g, ' ');
            console.log(`${gap} [${m.from_name}]${isAoi}: ${content}`);
        });
    }

    await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
