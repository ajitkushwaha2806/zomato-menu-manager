const fs = require('fs');
const html = fs.readFileSync('../scratch.js', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);
console.log("Forms: ", $('form').length);
console.log("Tables: ", $('table').length);
console.log("Trs: ", $('tr').length);
