// Converts dist/index.html (single-file build) into an artifact page body:
// title + style + markup + module script, without document wrapper tags.
// usage: node tools/make-artifact.mjs <out.html>
import fs from 'fs';

const out = process.argv[2] || 'dist/artifact.html';
const html = fs.readFileSync('dist/index.html', 'utf8');
const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, 'The Backrooms'])[1];
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const scripts = [...html.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
const page = `<title>${title}</title>
<style>
${styles}
:root { color-scheme: dark; }
</style>
${body}
${scripts.map((s) => `<script type="module">${s}</script>`).join('\n')}
`;
fs.writeFileSync(out, page);
console.log('wrote', out, (page.length / 1024).toFixed(0) + ' KB', 'scripts:', scripts.length);
