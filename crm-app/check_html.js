const fs = require('fs');
const html = fs.readFileSync('/Users/ideab/Desktop/data_hub/Meta Business Suite (2).html', 'utf8');

console.log('HTML size:', html.length);
console.log('Contains _4bl9:', html.includes('_4bl9'));
console.log('Contains mw_chat_scroller:', html.includes('mw_chat_scroller'));
console.log('Contains ส่งโดย:', html.includes('ส่งโดย'));
console.log('Contains role="main":', html.includes('role="main"'));

const iframes = html.match(/<iframe[^>]+>/g);
console.log('Iframes:', iframes ? iframes.length : 0);

const idx = html.indexOf('mw_chat_scroller');
if (idx !== -1) {
    console.log('Snippet around mw_chat_scroller:\n', html.slice(Math.max(0, idx - 150), idx + 250));
}

const idx2 = html.indexOf('ส่งโดย');
if (idx2 !== -1) {
    console.log('Snippet around ส่งโดย:\n', html.slice(Math.max(0, idx2 - 150), idx2 + 250));
}
