const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('/Users/ideab/Desktop/data_hub/Meta Business Suite (2).html', 'utf8');
const $ = cheerio.load(html);

console.log('--- Finding Overflow scroll elements ---');
let found = 0;
$('*').each((i, el) => {
    const style = $(el).attr('style') || '';
    const classes = $(el).attr('class') || '';
    if (style.includes('overflow-y') || style.includes('overflow: auto') || style.includes('overflow: scroll') || classes.includes('scroll')) {
        // Exclude the main chat area by checking if it contains 'Message list'
        if ($(el).find('[aria-label*="Message list"]').length === 0) {
            // Check if it contains the thread links
            if ($(el).find('a[href*="selected_item_id"]').length > 0) {
                console.log(`[Bingo] Found Sidebar Scroller: Tag: ${el.tagName}, Classes: ${classes}, Role: $(el).attr('role')`);
                found++;
                if (found > 3) return false;
            }
        }
    }
});

// If that fails, let's just use the classes we found at level 10/11 which look like Facebook's utility classes
console.log('\n--- Checking Level 10 Classes ---');
const level10ClassStr = "x78zum5 xdt5ytf x5yr21d xedcshv x1t2pt76 xh8yej3";
console.log(`Elements with those classes exactly: $('.x78zum5.xdt5ytf.x5yr21d.xedcshv.x1t2pt76.xh8yej3').length = ${$('.x78zum5.xdt5ytf.x5yr21d.xedcshv.x1t2pt76.xh8yej3').length}`);

// We can probably just fallback to document.querySelector('a[href*="selected_item_id"]').parentElement x 10 or whatever.
