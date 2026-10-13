import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const failures = [];
for (const path of files) {
  if (/\.(png|webp|woff2?|ico)$/.test(path)) continue;
  const text = await readFile(path, 'utf8');
  if (
    /sb_secret_[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:sk_live_|re_)[A-Za-z0-9]{25,}/.test(
      text,
    )
  )
    failures.push(path);
  if (/(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/.test(path) && !path.endsWith('.example'))
    failures.push(path);
}
console.log(
  failures.length
    ? 'Potential secret files: ' + failures.join(', ')
    : 'Secret scan passed: no real server key/private credentials in tracked or publishable files.',
);
if (failures.length) process.exitCode = 1;
