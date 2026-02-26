
import { NextResponse } from 'next/server';
import IORedis from 'ioredis';

export const dynamic = 'force-dynamic';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export async function GET(request) {
    const redis = new IORedis(REDIS_URL);
    redis.on('error', () => { /* Silence connection errors */ });
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            console.log('[SSE] Client connected to event stream');

            // 1. Subscribe to Redis channels
            redis.subscribe('chat-updates', 'slip-updates', 'task-updates', (err, count) => {
                if (err) console.error('[SSE] Redis subscribe error:', err);
                else console.log(`[SSE] Subscribed to ${count} channels`);
            });

            // 2. Listen for messages from Worker
            redis.on('message', (channel, message) => {
                console.log(`[SSE] Received event from ${channel}: ${message}`);
                const data = JSON.stringify({ channel, data: JSON.parse(message) });
                controller.enqueue(encoder.encode(`data: ${data}

`));
            });

            // Keep-alive heartbeat every 15 seconds
            const heartbeat = setInterval(() => {
                controller.enqueue(encoder.encode(`: heartbeat

`));
            }, 15000);

            // 3. Cleanup on disconnect
            request.signal.onabort = () => {
                console.log('[SSE] Client disconnected');
                clearInterval(heartbeat);
                redis.quit();
            };
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
}
