
import fs from 'fs';
import path from 'path';

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const CACHE_FILE = path.join(process.cwd(), 'cache', 'personas.json');

/**
 * Creates or retrieves a Persona ID from Facebook
 */
export async function getOrCreatePersona(name, profilePictureUrl) {
    if (!PAGE_ACCESS_TOKEN) return null;

    // 1. Check local cache first
    if (fs.existsSync(CACHE_FILE)) {
        const personas = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (personas[name]) return personas[name];
    }

    try {
        console.log(`[Persona] Registering new persona: ${name}...`);
        
        // 2. Create Persona on Facebook
        const res = await fetch(`https://graph.facebook.com/v19.0/me/personas?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                profile_picture_url: profilePictureUrl
            })
        });

        const data = await res.json();
        
        if (data.id) {
            // 3. Save to cache
            const personas = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
            personas[name] = data.id;
            if (!fs.existsSync(path.dirname(CACHE_FILE))) fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
            fs.writeFileSync(CACHE_FILE, JSON.stringify(personas, null, 4));
            
            console.log(`[Persona] Registered successfully: ${data.id}`);
            return data.id;
        } else {
            console.error('[Persona] Registration failed:', data.error);
        }
    } catch (e) {
        console.error('[Persona] Error:', e.message);
    }
    return null;
}
