import { GoogleGenerativeAI } from "@google/generative-ai";

export default class BusinessAnalyst {
    constructor(apiKey) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
    }

    /**
     * Formats raw system data into a concise context for the AI
     */
    prepareContext(customers, campaigns, inventory, products) {
        // 1. Financial Overview
        const totalRevenue = customers.reduce((sum, c) => sum + (c.intelligence?.metrics?.total_spend || 0), 0);
        const totalAdSpend = campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);
        const roas = totalAdSpend > 0 ? (totalRevenue / totalAdSpend).toFixed(2) : 0;

        // 2. Identify Top Sellers & Dead Stock
        const productSales = {};
        customers.forEach(c => {
            (c.inventory?.learning_courses || []).forEach(item => {
                productSales[item.name] = (productSales[item.name] || 0) + 1;
            });
        });
        const bestSellers = Object.entries(productSales)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => `${name} (${count} units)`);

        // 3. Campaign Performance
        const activeCampaigns = campaigns
            .filter(c => c.status === 'ACTIVE')
            .map(c => ({
                name: c.name,
                spend: c.spend,
                roas: c.spend > 0 ? (c.revenue / c.spend).toFixed(2) : 0
            }));

        return `
        BUSINESS CONTEXT (The V School - Culinary School):
        - Total Revenue: ${totalRevenue.toLocaleString()} THB
        - Total Ad Spend: ${totalAdSpend.toLocaleString()} THB
        - Overall ROAS: ${roas}x
        - Best Selling Courses: ${bestSellers.join(', ') || 'None'}
        - Active Campaigns: ${JSON.stringify(activeCampaigns)}
        - Total Customers: ${customers.length}
        `;
    }

    /**
     * Generates the "Executive Summary" analysis
     */
    async generateExecutiveReport(context) {
        const prompt = `
        Role: access the role of a Senior Business Strategist for "The V School".
        Task: Analyze the provided business data and generate a structured JSON report.
        Language: Thai (Subject/Object) + English (Technical Terms). Use professional yet accessible business language.

        Data:
        ${context}

        Requirements:
        1. "healthScore": Score 0-100 based on ROAS (Target > 4.0) and Revenue.
        2. "sentiment": "Positive", "Neutral", "Concerned".
        3. "executiveSummary": A 2-sentence summary of the current business status.
        4. "risks": Identify 2 critical risks (e.g., Low ROAS campaigns, Inventory stagnation).
        5. "opportunities": Identify 2 growth opportunities (e.g., Scale high ROAS ads).
        6. "insights": 1 key unique insight about customer behavior or product fit.

        Output Format (JSON Only):
        {
            "healthScore": 85,
            "sentiment": "Positive",
            "keyMetric": "ROAS 5.2x",
            "executiveSummary": "...",
            "risks": [{ "type": "...", "message": "...", "action": "..." }],
            "opportunities": [{ "type": "...", "message": "...", "action": "..." }],
            "insights": [{ "category": "...", "title": "...", "value": "...", "detail": "..." }]
        }
        `;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Clean markdown code blocks if present
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error("Gemini Analysis Failed:", error);
            // Fallback to heuristic if AI fails
            return null;
        }
    }

    /**
     * Handles free-form chat questions
     */
    async chat(history, question, context) {
        const chat = this.model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: `System Context: ${context}. You are V-Insight, a helpful business analyst.` }],
                },
                {
                    role: "model",
                    parts: [{ text: "Acknowledged. I am ready to analyze The V School's data." }],
                },
                ...history
            ],
        });

        const result = await chat.sendMessage(question);
        return result.response.text();
    }

    /**
     * Extracts potential products and prices from chat history
     */
    async extractProductsFromChat(messages) {
        const chatContext = messages.map(m => `${m.sender}: ${m.text}`).join('\n');

        const prompt = `
        Role: Product Discovery AI for "The V School" culinary school.
        Task: Analyze the following chat history and extract any products (courses, bundles, or kitchen equipment) that the customer is interested in or has purchased.
        
        Chat History:
        ${chatContext}
        
        Requirements:
        1. Extract the "product_name" (be specific).
        2. Extract "price" as a number (THB).
        3. Identify "category" (e.g., Japan, Business, Hobby, Equipment).
        4. Provide a "justification" quoting the chat.
        5. Return a list of objects. If none found, return an empty array [].
        
        Output Format (JSON Only):
        [
            {
                "product_name": "...",
                "price": 5000,
                "category": "...",
                "justification": "..."
            }
        ]
        `;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error("Product Extraction Failed:", error);
            return [];
        }
    }

    /**
     * Detects if an agent should be assigned based on chat content
     */
    async detectAgentFromChat(messages, staffList = []) {
        const chatContext = messages.map(m => `${m.from?.name || m.sender}: ${m.message || m.text}`).join('\n');

        const staffNames = staffList.length > 0
            ? staffList.join(', ')
            : 'Boss (Developer/Admin), Sales A, Sales B, Jutamat, Pornpon';

        const prompt = `
        Role: Staff Assignment AI for "The V School".
        Task: Analyze the chat history and determine if a specific staff member/agent should be assigned to this conversation.
        
        Context:
        Available Staff: ${staffNames}.
        
        Chat History:
        ${chatContext}
        
        Logic:
        1. Look for phrases like "ฝากคุณ...ดูต่อที", "ส่งให้...", "ให้...จัดการ", "Requesting Boss", etc.
        2. If a staff name is mentioned as someone who should handle the case, return their name matching EXACTLY one of the names in the "Available Staff" list.
        3. Only return a name if there's a clear instruction to assign or consult them.
        
        Output Format (JSON Only):
        {
            "suggested_agent": "NameFromList" | null,
            "justification": "Why this agent was suggested."
        }
        `;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error("Agent Detection Failed:", error);
            return { suggested_agent: null };
        }
    }
}

