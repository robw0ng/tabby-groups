// node share/leak-check.mjs <folder>: fails (exit 1) when the share folder holds anything personal or Claude-related.
// Used by .github/workflows/share.yml on the unzipped share, and locally before a release.
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root || !fs.existsSync(root)) {
  console.error('usage: node share/leak-check.mjs <folder>');
  process.exit(1);
}
const allowedFiles = ['INSTALL.md', 'README.md', 'tabby-groups/index.js', 'tabby-groups/icons.js', 'tabby-groups/package.json'];
const rules = [
  ['Claude Code skill cog name', /claude-sessions/i],
  ['the personal workflow', /\bworkflow\b/i],
  ['a robw0ng GitHub path', /robw0ng\//i],
  ['a personal Windows path', /[A-Za-z]:\\+(Users|tabby-|webapp|core|dev-tools|worktrees|claude|vetty)/i],
  ['a tabby-remote link', /(github\.com\/[^\s'"`)]*tabby-remote|tabby-remote\.git)/i],
  // The plugin needs no DevTools port; only the Claude tools (not shared) use it, and closed is safer.
  ['the DevTools port', /remote-debugging/i],
];
const problems = [];
const files = [];
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
  const full = path.join(dir, e.name);
  e.isDirectory() ? walk(full) : files.push(path.relative(root, full).split(path.sep).join('/'));
});
walk(root);
for (const f of files) {
  if (!allowedFiles.includes(f)) problems.push(`${f}: not part of the share`);
}
for (const f of files.filter(f => allowedFiles.includes(f))) {
  fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((line, i) => {
    for (const [what, re] of rules) {
      // package.json may name the repo it came from (author and repository fields).
      if (f.endsWith('package.json') && what === 'a robw0ng GitHub path' && /"url"\s*:/.test(line)) continue;
      if (re.test(line)) problems.push(`${f}:${i + 1}: ${what}: ${line.trim().slice(0, 120)}`);
    }
  });
}
for (const f of allowedFiles) {
  if (!files.includes(f)) problems.push(`${f}: missing`);
}
if (problems.length) {
  console.error(`leak check failed (${problems.length}):\n` + problems.join('\n'));
  process.exit(1);
}
console.log(`leak check passed: ${files.length} files`);
