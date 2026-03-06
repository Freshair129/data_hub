const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('/Users/ideab/Desktop/data_hub/Meta Business Suite (2).html', 'utf8');
const $ = cheerio.load(html);

console.log('--- Finding ARIA labels around threads ---');
const links = $('a[href*="selected_item_id"]');
if (links.length) {
    let parent = links.eq(0);
    for (let i = 0; i < 20; i++) {
        parent = parent.parent();
        if (!parent.length) break;
        const ariaLabel = parent.attr('aria-label');
        if (ariaLabel) {
            console.log(`[Level ${i + 1}] ARIA Label: "${ariaLabel}" on Tag: ${parent.get(0).tagName}`);
        }
    }
}
