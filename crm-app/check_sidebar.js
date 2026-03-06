const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('/Users/ideab/Desktop/data_hub/Meta Business Suite (2).html', 'utf8');
const $ = cheerio.load(html);

const links = $('a[href*="selected_item_id"]');
console.log(`Found ${links.length} threads in sidebar`);

if (links.length > 0) {
    let parent = links.eq(0);
    console.log('--- Ancestors of first thread link ---');
    for (let i = 0; i < 15; i++) {
        parent = parent.parent();
        if (!parent.length) break;
        console.log(`[Level ${i + 1}] Tag: ${parent.get(0).tagName}, Classes: ${parent.attr('class') || ''}, Role: ${parent.attr('role') || ''}, Aria-Label: ${parent.attr('aria-label') || ''}`);
    }
}

console.log('\n--- Searching for specific roles ---');
$('[role="navigation"]').each((i, el) => console.log('role="navigation" classes:', $(el).attr('class')));
$('.f98l6msc').each((i, el) => console.log('.f98l6msc found!'));
$('[data-testid="mw_chat_scroller"]').each((i, el) => console.log('mw_chat_scroller found!'));
