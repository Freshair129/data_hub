
const fs = require('fs');
const path = require('path');

const customerDir = '/Users/ideab/Desktop/data_hub/customer';
const currentYear = '2024'; // Backfilling as 2024 members since they are existing

async function backfill() {
    console.log('Starting Member ID Backfill...');

    // Get all customer folders
    if (!fs.existsSync(customerDir)) {
        console.error('Customer directory not found!');
        return;
    }

    const folders = fs.readdirSync(customerDir).filter(f => f.startsWith('c'));
    console.log(`Found ${folders.length} customer folders.`);

    let count = 1;

    for (const folder of folders) {
        const profilePath = path.join(customerDir, folder, `profile_${folder}.json`);

        if (fs.existsSync(profilePath)) {
            const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

            // Check if member_id already exists
            if (!data.profile.member_id) {
                const memberId = `MEM-${currentYear}-${String(count).padStart(4, '0')}`;
                data.profile.member_id = memberId;

                fs.writeFileSync(profilePath, JSON.stringify(data, null, 4));
                console.log(`Updated ${folder}: ${memberId}`);
            } else {
                console.log(`Skipped ${folder}: Already has ${data.profile.member_id}`);
            }
            count++;
        }
    }
    console.log('Backfill Complete.');
}

backfill();
