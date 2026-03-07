import { NextResponse } from 'next/server';
import VectorStore from '@/lib/vectorStore.js';

/**
 * API Route: Semantic Search for Similar Chats
 * GET /api/ai/similar-chats?q=queryText&limit=5
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');
        const limit = parseInt(searchParams.get('limit') || '5');

        if (!query) {
            return NextResponse.json({ success: false, error: 'Missing query parameter "q"' }, { status: 400 });
        }

        const vectorStore = new VectorStore();
        const results = await vectorStore.searchSimilar(query, limit);

        return NextResponse.json({
            success: true,
            results: results
        });

    } catch (error) {
        console.error('Semantic Search Failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
