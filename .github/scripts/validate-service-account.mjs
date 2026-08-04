// Sanity-check the FIREBASE_SERVICE_ACCOUNT secret before we hand it to the
// Firebase CLI.
//
// This exists because the CLI is uselessly vague about credential problems: a
// truncated paste, a key for the wrong project, a revoked key and a missing
// file all surface as the single line
//
//     Error: Failed to authenticate, have you run firebase login?
//
// which tells you nothing about which of those it was. Everything checkable
// without a network call is checked here instead, and reported as the actual
// problem.
//
// Nothing secret is printed. The private key is only ever tested by handing it
// to crypto; its contents never reach the log. client_email and project_id are
// identifiers, not credentials, and you need to see them to confirm the key
// belongs to the right service account.

import { readFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';

const [keyPath, expectedProject] = process.argv.slice(2);

/** Fail with a GitHub Actions error annotation, plus what to do about it. */
function fail(problem, fix) {
  console.log(`::error::${problem}`);
  for (const line of fix) console.log(`::error::${fix.length > 1 ? '  ' : ''}${line}`);
  process.exit(1);
}

let raw;
try {
  raw = readFileSync(keyPath, 'utf8');
} catch (e) {
  fail(`Could not read the service account key at ${keyPath}: ${e.message}`, [
    'This is a bug in the workflow, not in your secret.',
  ]);
}

// The secret should be the raw JSON, but base64 is a common way to pass these
// around and costs nothing to accept.
let text = raw.trim();
if (text && !text.startsWith('{') && /^[A-Za-z0-9+/=\s]+$/.test(text)) {
  const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
  if (decoded.startsWith('{')) {
    console.log('Secret was base64-encoded; decoded it.');
    text = decoded;
  }
}

if (!text) {
  fail('The FIREBASE_SERVICE_ACCOUNT secret is empty.', [
    'Re-add it: Settings -> Secrets and variables -> Actions.',
  ]);
}

let key;
try {
  key = JSON.parse(text);
} catch (e) {
  fail(`The FIREBASE_SERVICE_ACCOUNT secret is not valid JSON: ${e.message}`, [
    'It is almost always a partial paste. The value must be the entire',
    'downloaded .json file, starting with { and ending with } — no',
    'surrounding quotes, no missing lines.',
    `(Secret is ${text.length} characters; a real key is usually ~2300.)`,
  ]);
}

if (key.type !== 'service_account') {
  fail(`The secret is JSON, but it is not a service account key (its "type" is ${JSON.stringify(key.type ?? null)}).`, [
    'You may have pasted the Firebase *web app* config, or a firebase-tools',
    'CI token, instead of the key downloaded from Google Cloud console ->',
    'IAM & Admin -> Service Accounts -> Keys -> Add key -> Create new key -> JSON.',
  ]);
}

const missing = ['project_id', 'private_key', 'client_email', 'token_uri'].filter((f) => !key[f]);
if (missing.length) {
  fail(`The service account key is missing required field(s): ${missing.join(', ')}.`, [
    'Download a fresh key and paste the whole file.',
  ]);
}

// A key mangled in transit (newlines eaten, characters dropped) still parses as
// JSON and still looks like a PEM. Actually loading it is the only honest test.
try {
  createPrivateKey(key.private_key);
} catch (e) {
  fail(`The key's private_key is not a usable private key: ${e.message}`, [
    'The JSON parsed, but the key inside it is corrupt — usually from editing',
    'the file by hand or from newlines being stripped. Download a fresh key',
    'and paste it without modification.',
  ]);
}

// Deploying with a key from a different project fails later, deep in the
// deploy, with a permissions error that never mentions the mismatch.
if (expectedProject && key.project_id !== expectedProject) {
  fail(`The key belongs to project "${key.project_id}", but this workflow deploys to "${expectedProject}".`, [
    `Create the service account inside "${expectedProject}" and use its key.`,
  ]);
}

console.log('Service account key looks well-formed.');
console.log(`  project:       ${key.project_id}`);
console.log(`  service acct:  ${key.client_email}`);
