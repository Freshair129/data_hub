const fs = require('fs');
const readline = require('readline');

// Let's check the offline HTML to see if there's any GraphQL endpoints or 
// initial state blobs we can scrape instead of using the UI
const html = fs.readFileSync('/Users/ideab/Desktop/data_hub/Meta Business Suite (2).html', 'utf8');

// Search for 'thread_id' or similar in script tags
const scriptJsonMatches = [...html.matchAll(/"thread_key":\{"thread_fbid":"(\d+)"/g)];
const altMatches = [...html.matchAll(/"thread_id":"(\d+)"/g)];

console.log("Found Thread FBIDs:", scriptJsonMatches.length);
if (scriptJsonMatches.length) {
    console.log("First 5 FBIDs:", scriptJsonMatches.slice(0, 5).map(m => m[1]));
}

console.log("Found Thread IDs:", altMatches.length);
if (altMatches.length) {
    console.log("First 5 IDs:", altMatches.slice(0, 5).map(m => m[1]));
}

// Let's also check if there's a big Relay state blob we can parse
const relayRegex = /"require":\[\["RelayPrefetchedStreamCache"/;
console.log("Has Relay Cache?", relayRegex.test(html));
