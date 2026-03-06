const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('/Users/ideab/Desktop/data_hub/Meta Business Suite (2).html', 'utf8');
const $ = cheerio.load(html);

console.log('--- Searching for thread rows ---');

// In Meta, often the rows are role="row" or role="gridcell" or role="listitem"
const rows = $('[role="row"]');
console.log('Total role="row" elements:', rows.length);

if (rows.length) {
    let el = rows.eq(0);
    console.log('Classes on role=row:', el.attr('class'));
    console.log('Tag:', el.get(0).tagName);
    console.log('Has href?', el.attr('href') ? 'Yes' : 'No');
}

const listitems = $('[role="listitem"]');
console.log('\nTotal role="listitem" elements:', listitems.length);

// What's inside the tablist?
const tablist = $('[role="tablist"]');
if (tablist.length) {
    console.log('\nInside role="tablist":');
    // Find all links inside
    console.log('Links inside tablist:', tablist.find('a').length);
    // Find generic divs that might be rows
    const genericRows = tablist.find('[role="row"]');
    console.log('role="row" inside tablist:', genericRows.length);

    if (genericRows.length) {
        console.log('First generic row inside tablist tags:', genericRows.eq(0).get(0).tagName);
        console.log('First generic row HTML snippet:', genericRows.eq(0).html().slice(0, 500));
    }
}
