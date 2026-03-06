const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('/Users/ideab/Desktop/data_hub/Meta Business Suite (2).html', 'utf8');
const $ = cheerio.load(html);

// Find the text "Jan 2026" or "ม.ค. 2026" or somewhere that contains messages
const messageListArea = $('[aria-label*="Message list"]').parent().parent();
if (messageListArea.length) {
    console.log('Found message list area. Classes:', messageListArea.attr('class'));
    console.log('Role:', messageListArea.attr('role'));
}

// Find a good selector for the entire chat panel
const senders = $('span:contains("ส่งโดย")');
if (senders.length) {
    let parent = senders.eq(0);
    // Walk up 10 levels
    for (let i = 0; i < 8; i++) parent = parent.parent();
    console.log('\nAncestor of "ส่งโดย" (8 levels up):');
    console.log('Role:', parent.attr('role'));
    console.log('Class:', parent.attr('class'));
}

// Check if we can just use the scroll container parent for innerText extraction
const scroller = $('[aria-label*="Message list"]');
if (scroller.length) {
    console.log('\nScroller length of text:', scroller.text().length);
    if (scroller.text().includes('ส่งโดย')) {
        console.log('Scroller CONTAINS the chat history!');
    }
}
