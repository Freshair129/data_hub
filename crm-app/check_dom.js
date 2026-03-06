const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('/Users/ideab/Desktop/data_hub/Meta Business Suite (2).html', 'utf8');
const $ = cheerio.load(html);

console.log('--- Looking for "ส่งโดย" ---');
const senderSpans = $('span:contains("ส่งโดย")').length
    ? $('span:contains("ส่งโดย")')
    : $('div:contains("ส่งโดย")');

console.log('Found "ส่งโดย" elements:', senderSpans.length);

if (senderSpans.length > 0) {
    let el = senderSpans.eq(0);
    // Print the first 10 ancestors' tag names and classes/roles
    for (let i = 0; i < 15; i++) {
        el = el.parent();
        if (!el.length) break;
        console.log(`Ancestor ${i + 1}: ${el.get(0).tagName} class="${el.attr('class') || ''}" role="${el.attr('role') || ''}" aria-label="${el.attr('aria-label') || ''}"`);

        // Check if any ancestor looks like a scroll container
        if (el.attr('role') === 'log' || el.attr('role') === 'presentation' || (el.attr('class') && el.attr('class').includes('scroll'))) {
            // Found a potential container
        }
    }
}

console.log('\n--- Looking for possible main chat areas ---');
$('[role="log"]').each((i, el) => console.log('Found role="log" with classes:', $(el).attr('class')));
$('[aria-label*="สนทนา"]').each((i, el) => console.log('Found aria-label="สนทนา" with classes:', $(el).attr('class')));
$('[aria-label*="Message list"]').each((i, el) => console.log('Found aria-label="...Message list..." with classes:', $(el).attr('class')));

// How about looking for something that contains both "ส่งโดย" and the user's messages?
console.log('\n--- Checking large divs ---');
$('div').each((i, el) => {
    const role = $(el).attr('role');
    const label = $(el).attr('aria-label');
    if (role === 'region' || role === 'dialog') {
        // console.log(`Found ${role} with aria-label: ${label}`);
    }
});
