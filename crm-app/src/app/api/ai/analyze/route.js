import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import BusinessAnalyst from '@/utils/BusinessAnalyst.js';
import { getPrisma, getAllProducts } from '@/lib/db.js';

// Helper to read JSON files safely
const readJsonFile = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        }
    } catch (e) {
        console.error(`Error reading ${filePath}:`, e);
    }
    return null;
};

// Helper to read all files in a directory
const readDirectoryFiles = (dirPath) => {
    try {
        if (fs.existsSync(dirPath)) {
            return fs.readdirSync(dirPath)
                .filter(file => file.endsWith('.json'))
                .map(file => readJsonFile(path.join(dirPath, file)))
                .filter(Boolean);
        }
    } catch (e) {
        console.error(`Error reading directory ${dirPath}:`, e);
    }
    return [];
};

export async function GET() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ success: false, error: 'Gemini API Key missing' }, { status: 500 });
        }

        const publicDir = path.join(process.cwd(), 'public');

        // 1. Fetch Data from DB
        const prisma = await getPrisma();

        let customers = [];
        let campaigns = [];

        if (prisma) {
            customers = await prisma.customer.findMany({
                include: { inventory: true, intelligence: true }
            });
            campaigns = await prisma.campaign.findMany();
        } else {
            // Fallback for customers if prisma unavailable
            const customerDir = path.join(process.cwd(), 'cache', 'customer');
            customers = fs.existsSync(customerDir) ? readDirectoryFiles(customerDir) : [];
        }

        // 2. Fetch Products from DB
        const allProducts = await getAllProducts();

        // 2. Initialize Business Analyst AI
        const analyst = new BusinessAnalyst(apiKey);

        // 3. Prepare Context
        const context = analyst.prepareContext(customers, campaigns, null, allProducts);

        // 4. Generate Analysis
        const aiAnalysis = await analyst.generateExecutiveReport(context);

        if (!aiAnalysis) {
            throw new Error("AI Generation failed");
        }

        return NextResponse.json({ success: true, data: { ...aiAnalysis, marketContext: { totalCustomers: customers.length } } });

    } catch (error) {
        console.error('AI Analysis Failed:', error);
        // Fallback to basic structure if AI fails heavily
        return NextResponse.json({
            success: false,
            error: 'Analysis failed',
            data: {
                executiveSummary: { healthScore: 0, sentiment: 'Neutral', keyMetric: 'Error' },
                risks: [],
                opportunities: [],
                insights: []
            }
        }, { status: 500 });
    }
}
