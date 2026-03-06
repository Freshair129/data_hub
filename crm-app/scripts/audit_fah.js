const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const fahId = (await pool.query("SELECT id FROM employees WHERE employee_id = 'e004'")).rows[0].id;

    // 1. Get top 10 longest conversations Fah handled
    const topConvs = await pool.query(`
        SELECT m.conversation_id, COUNT(*) as msg_count,
               MIN(m.created_at) as first_msg, MAX(m.created_at) as last_msg
        FROM messages m
        WHERE m.conversation_id IN (
            SELECT DISTINCT conversation_id FROM messages WHERE responder_id = $1
        )
        GROUP BY m.conversation_id
        ORDER BY msg_count DESC LIMIT 10
    `, [fahId]);

    console.log('=== TOP 10 CONVERSATIONS ===');
    console.log(JSON.stringify(topConvs.rows));

    // 2. For each top conversation, get ALL messages with timestamps
    for (const conv of topConvs.rows.slice(0, 8)) {
        const msgs = await pool.query(`
            SELECT from_name, content, created_at, responder_id,
                   EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at))) / 60.0 as gap_minutes
            FROM messages
            WHERE conversation_id = $1
            ORDER BY created_at ASC
        `, [conv.conversation_id]);

        console.log('\n=== CONV: ' + conv.conversation_id + ' | MSGS: ' + conv.msg_count + ' ===');
        msgs.rows.forEach((m, i) => {
            const gap = m.gap_minutes ? `[+${Math.round(m.gap_minutes)}m]` : '[START]';
            const isFah = m.responder_id === fahId ? ' 🟢FAH' : '';
            const content = (m.content || '').substring(0, 120).replace(/\n/g, ' ');
            console.log(`${gap} [${m.from_name}]${isFah}: ${content}`);
        });
    }

    // 3. Response time gaps for Fah specifically (customer msg -> Fah reply)
    const responseGaps = await pool.query(`
        WITH ordered AS (
            SELECT from_name, content, created_at, responder_id, conversation_id,
                   LAG(from_name) OVER (PARTITION BY conversation_id ORDER BY created_at) as prev_sender,
                   LAG(created_at) OVER (PARTITION BY conversation_id ORDER BY created_at) as prev_time
            FROM messages
            WHERE conversation_id IN (
                SELECT DISTINCT conversation_id FROM messages WHERE responder_id = $1
            )
        )
        SELECT
            CASE
                WHEN EXTRACT(EPOCH FROM (created_at - prev_time)) / 60 < 5 THEN 'under_5min'
                WHEN EXTRACT(EPOCH FROM (created_at - prev_time)) / 60 < 30 THEN '5_to_30min'
                WHEN EXTRACT(EPOCH FROM (created_at - prev_time)) / 60 < 60 THEN '30_to_60min'
                WHEN EXTRACT(EPOCH FROM (created_at - prev_time)) / 60 < 240 THEN '1_to_4hr'
                ELSE 'over_4hr'
            END as response_bucket,
            COUNT(*) as count
        FROM ordered
        WHERE responder_id = $1
          AND prev_sender != 'The V School'
          AND prev_sender NOT LIKE '%Fafah%'
          AND prev_sender NOT LIKE '%Fasai%'
        GROUP BY response_bucket
        ORDER BY count DESC
    `, [fahId]);

    console.log('\n=== FAH RESPONSE TIME BUCKETS ===');
    console.log(JSON.stringify(responseGaps.rows));

    // 4. Find "last message" patterns - who sends the last message in conversations?
    const lastMsgs = await pool.query(`
        WITH last_msgs AS (
            SELECT DISTINCT ON (conversation_id)
                conversation_id, from_name, content, created_at
            FROM messages
            WHERE conversation_id IN (
                SELECT DISTINCT conversation_id FROM messages WHERE responder_id = $1
            )
            ORDER BY conversation_id, created_at DESC
        )
        SELECT
            CASE
                WHEN from_name LIKE '%Fafah%' OR from_name LIKE '%Fasai%' OR from_name = 'The V School' THEN 'admin_last'
                ELSE 'customer_last'
            END as who_ended,
            COUNT(*) as count
        FROM last_msgs
        GROUP BY who_ended
    `, [fahId]);

    console.log('\n=== WHO SENDS LAST MESSAGE ===');
    console.log(JSON.stringify(lastMsgs.rows));

    // 5. Find conversations where customer mentioned price/ราคา
    const priceConvs = await pool.query(`
        SELECT DISTINCT m.conversation_id
        FROM messages m
        WHERE m.conversation_id IN (
            SELECT DISTINCT conversation_id FROM messages WHERE responder_id = $1
        )
        AND (m.content ILIKE '%ราคา%' OR m.content ILIKE '%เท่าไหร่%' OR m.content ILIKE '%บาท%' OR m.content ILIKE '%price%' OR m.content ILIKE '%กี่บาท%')
        LIMIT 5
    `, [fahId]);

    console.log('\n=== PRICE-RELATED CONVOS ===');
    console.log(JSON.stringify(priceConvs.rows));

    // 6. Fetch those price conversations
    for (const conv of priceConvs.rows.slice(0, 3)) {
        const msgs = await pool.query(`
            SELECT from_name, content, created_at, responder_id,
                   EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at))) / 60.0 as gap_minutes
            FROM messages
            WHERE conversation_id = $1
            ORDER BY created_at ASC
        `, [conv.conversation_id]);

        console.log('\n=== PRICE CONV: ' + conv.conversation_id + ' ===');
        msgs.rows.forEach(m => {
            const gap = m.gap_minutes ? `[+${Math.round(m.gap_minutes)}m]` : '[START]';
            const isFah = m.responder_id === fahId ? ' 🟢FAH' : '';
            const content = (m.content || '').substring(0, 150).replace(/\n/g, ' ');
            console.log(`${gap} [${m.from_name}]${isFah}: ${content}`);
        });
    }

    await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
