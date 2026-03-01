const fs = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, 'cache/customer');
const customers = fs.readdirSync(cacheDir).filter(f => !f.startsWith('.'));

console.log('Total customers found:', customers.length);
if (customers.length > 0) {
    const firstCustomer = customers[0];
    const profilePath = path.join(cacheDir, firstCustomer, `profile_${firstCustomer}.json`);

    if (fs.existsSync(profilePath)) {
        const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        console.log('--- SAMPLE CUSTOMER PROFILE ---');
        console.log('ID:', data.customer_id);
        console.log('Name:', data.profile?.first_name);
        console.log('Intelligence:', JSON.stringify(data.intelligence, null, 2));
    } else {
        console.log('Profile file not found for', firstCustomer);
    }
}
