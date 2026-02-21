import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

async function simulateWebhook(senderId, messageText) {
    console.log(`🚀 Simulating Facebook Webhook for Sender: ${senderId}...`);

    const eventQueue = new Queue('fb-events', { connection });

    const mockPayload = {
        object: 'page',
        entry: [
            {
                id: process.env.FB_PAGE_ID,
                time: Date.now(),
                messaging: [
                    {
                        sender: { id: senderId },
                        recipient: { id: process.env.FB_PAGE_ID },
                        timestamp: Date.now(),
                        message: {
                            mid: `mid.test_${Date.now()}`,
                            text: messageText
                        }
                    }
                ]
            }
        ]
    };

    try {
        await eventQueue.add('process-event', mockPayload, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 }
        });
        console.log('✅ Mock event added to queue.');
        console.log('👉 Make sure to run "npm run worker" to process this event.');
    } catch (error) {
        console.error('❌ Failed to add mock event:', error.message);
    } finally {
        await connection.quit();
    }
}

// Get arguments from command line
const senderId = process.argv[2] || 'TEST_USER_PSID';
const message = process.argv[3] || 'Hello from verification script!';

simulateWebhook(senderId, message).catch(console.error);
