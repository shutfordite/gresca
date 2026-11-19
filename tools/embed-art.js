#!/usr/bin/env node
'use strict';
// Copies the art modules into index.html, each as its own <script id="..."> block before the game script.
// Run after changing anything in art/:   node tools/embed-art.js
// test/art-sync.test.js fails if index.html and art/ have drifted apart.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BLOCKS = [
  { id: 'hanga-spec', file: 'art/gresca-hanga-spec.js' },
  { id: 'rider-anim', file: 'art/gresca-rider-anim.js' },
];

function embed(html) {
  for (const b of BLOCKS) {
    const src = fs.readFileSync(path.join(ROOT, b.file), 'utf8');
    if (src.includes('</script')) throw new Error(b.file + ' contains </script');
    const block = `<script id="${b.id}">\n${src}</script>\n`;
    const re = new RegExp(`<script id="${b.id}">\\n[\\s\\S]*?</script>\\n`);
    if (re.test(html)) html = html.replace(re, () => block);
    else {
      const at = html.indexOf('<script>');
      if (at < 0) throw new Error('No game <script> block in index.html');
      html = html.slice(0, at) + block + html.slice(at);
    }
  }
  return html;
}

if (require.main === module) {
  const f = path.join(ROOT, 'index.html');
  fs.writeFileSync(f, embed(fs.readFileSync(f, 'utf8')));
  console.log('Embedded ' + BLOCKS.map((b) => b.file).join(', ') + ' into index.html');
}
module.exports = { BLOCKS, embed };
