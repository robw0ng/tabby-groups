// node share/pack.mjs <out folder>: lays out the share zip's content — INSTALL.md (for an agent), README.md (for the person)
// and tabby-groups/ (the Tabby plugin only). package.json keeps only what Tabby needs: no repository link.
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) {
  console.error('usage: node share/pack.mjs <out folder>');
  process.exit(1);
}
const repo = path.join(import.meta.dirname, '..');
const plugin = path.join(out, 'tabby-groups');
fs.mkdirSync(plugin, { recursive: true });
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
// The plugin's runtime files are exactly package.json's "files".
for (const f of pkg.files) fs.copyFileSync(path.join(repo, f), path.join(plugin, f));
const keep = ['name', 'version', 'description', 'keywords', 'author', 'license', 'main', 'files'];
fs.writeFileSync(path.join(plugin, 'package.json'), JSON.stringify(Object.fromEntries(keep.filter(k => k in pkg).map(k => [k, pkg[k]])), null, 2) + '\n');
for (const f of ['INSTALL.md', 'README.md']) fs.copyFileSync(path.join(repo, 'share', f), path.join(out, f));
console.log(pkg.version);
