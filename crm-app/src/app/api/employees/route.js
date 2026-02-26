import { NextResponse } from 'next/server';
import { getAllEmployees, getAllCustomers } from '@/lib/db';

export async function GET() {
    try {
        const employees = await getAllEmployees();
        const customers = await getAllCustomers();

        // 1. Create a performance map (Agent Name -> Metrics)
        // This is much faster than looping through all customers for each employee
        const performanceMap = {};
        
        customers.forEach(c => {
            const agent = c.agent || 'Unassigned';
            if (!performanceMap[agent]) {
                performanceMap[agent] = { count: 0, revenue: 0 };
            }
            performanceMap[agent].count++;
            performanceMap[agent].revenue += (c.intelligence?.metrics?.total_spend || 0);
        });

        // Security: Strip credentials and enrich with metrics
        const safeEmployees = employees.map(emp => {
            const { credentials, passwordHash, ...safeData } = emp;

            const nick = emp.nickName || emp.firstName;
            const full = `${emp.firstName} ${emp.lastName}`;
            const aliases = emp.metadata?.aliases || [];

            // 2. Find metrics using various name formats from the map
            let stats = { count: 0, revenue: 0 };
            const nameKeys = [nick, full, emp.firstName, emp.facebookName, ...aliases];
            
            nameKeys.forEach(key => {
                if (key && performanceMap[key]) {
                    stats.count += performanceMap[key].count;
                    stats.revenue += performanceMap[key].revenue;
                    // Delete from map to avoid double-counting if multiple formats match
                    delete performanceMap[key]; 
                }
            });

            return {
                ...safeData,
                performance: {
                    ...safeData.performance,
                    metrics: {
                        ...(safeData.performance?.metrics || {}),
                        total_customers_registered: stats.count,
                        total_revenue_generated: stats.revenue
                    }
                }
            };
        });

        return NextResponse.json(safeEmployees);
    } catch (error) {
        console.error('GET /api/employees error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
