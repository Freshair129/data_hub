import { GoogleGenerativeAI } from "@google/generative-ai";
import { getPrisma } from "./db.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-004";

export default class VectorStore {
    constructor() {
        if (!GEMINI_API_KEY) {
            console.error("GEMINI_API_KEY is missing in environment variables.");
        }
        this.genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        this.embeddingModel = this.genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    }

    /**
     * Generates a 768-dimensional vector embedding for the given text.
     */
    async generateEmbedding(text) {
        try {
            const result = await this.embeddingModel.embedContent(text);
            return result.embedding.values; // Returns array of floats
        } catch (error) {
            console.error("Failed to generate embedding:", error);
            return null;
        }
    }

    /**
     * Saves or updates a chat embedding in the database.
     * Uses raw SQL because Prisma 'Unsupported' fields are not available in standard CRUD.
     */
    async upsertEmbedding(conversationId, content) {
        const prisma = await getPrisma();
        if (!prisma) return false;

        const embedding = await this.generateEmbedding(content);
        if (!embedding) return false;

        // Convert array to pgvector string format: '[0.1, 0.2, ...]'
        const vectorStr = `[${embedding.join(',')}]`;

        try {
            await prisma.$executeRaw`
                INSERT INTO chat_embeddings (id, conversation_id, content, embedding, created_at)
                VALUES (gen_random_uuid()::text, ${conversationId}, ${content}, ${vectorStr}::vector, NOW())
                ON CONFLICT (conversation_id)
                DO UPDATE SET 
                    content = EXCLUDED.content,
                    embedding = EXCLUDED.embedding,
                    created_at = NOW();
            `;
            return true;
        } catch (error) {
            console.error("Failed to upsert embedding:", error);
            return false;
        }
    }

    /**
     * Performs a semantic search to find similar conversations.
     * Uses Cosine Similarity (<=>) for distance calculation in pgvector.
     */
    async searchSimilar(queryText, limit = 5) {
        const prisma = await getPrisma();
        if (!prisma) return [];

        const queryEmbedding = await this.generateEmbedding(queryText);
        if (!queryEmbedding) return [];

        const vectorStr = `[${queryEmbedding.join(',')}]`;

        try {
            // Lower distance means higher similarity
            const results = await prisma.$queryRaw`
                SELECT 
                    conversation_id as "conversationId", 
                    content,
                    (embedding <=> ${vectorStr}::vector) as distance
                FROM chat_embeddings
                ORDER BY distance ASC
                LIMIT ${limit};
            `;
            return results;
        } catch (error) {
            console.error("Failed to search similar conversations:", error);
            return [];
        }
    }
}
