import fetch from 'node-fetch';

async function testLogin() {
    const url = 'http://localhost:3000/api/auth/login';
    const credentials = {
        email: 'suanranger129@gmail.com',
        password: 'Suanranger1295'
    };

    console.log(`Testing Login for ${credentials.email}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
        });

        const result = await response.json();
        console.log('Status:', response.status);
        console.log('Result:', JSON.stringify(result, null, 2));

        if (result.success) {
            console.log('✅ LOGIN SUCCESSFUL');
        } else {
            console.log('❌ LOGIN FAILED:', result.error);
        }
    } catch (e) {
        console.error('Error during fetch (Is server running?):', e.message);
    }
}

testLogin();
