const fs = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, 'cache/customer');
const customers = fs.readdirSync(cacheDir).filter(f => !f.startsWith('.'));

let totalSpendSum = 0;
let customersWithSpend = 0;
let highestSpender = null;
let highestSpend = 0;

for (const c of customers) {
    const profilePath = path.join(cacheDir, c, 'profile.json');
    if (fs.existsSync(profilePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
            const spend = data.intelligence?.metrics?.total_spend || 0;

            totalSpendSum += spend;
            if (spend > 0) {
                customersWithSpend++;
                if (spend > highestSpend) {
                    highestSpend = spend;
                    highestSpender = data;
                }
            }
        } catch (e) { }
    }
}

console.log('--- KPI DATA CHECK ---');
console.log('Total Customers:', customers.length);
console.log('Customers with Spend > 0:', customersWithSpend);
console.log('Total Revenue (Sum):', totalSpendSum);
if (highestSpender) {
    console.log('Highest Spender:', highestSpender.firstName || highestSpender.profile?.first_name, 'with spend:', highestSpend);
}
