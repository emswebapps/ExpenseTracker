// Check, before the deploy runs, that the project is actually in a state where
// a functions deploy can succeed.
//
// `validate-service-account.mjs` answers "is this credential well-formed?".
// This answers the next question: "is it allowed to do the job, and is the
// project ready for it?" Those are the two ways the deploy fails, and the
// second one is by far the more confusing.
//
// The reason this is worth a script: a deploy that lacks a role or hits a
// disabled API does not fail at the start. It packages the source, uploads it,
// talks to five services, and only then prints something like
//
//     Error: Permissions denied enabling cloudscheduler.googleapis.com.
//
// three hundred lines into a --debug log, after which nothing is deployed. The
// same information is available up front from two cheap API calls, so ask for
// it up front and print it as a list of things to click.
//
// Nothing secret is printed: the key is used to mint a short-lived token, and
// only API names, permission names and the service account's own address (an
// identifier, not a credential) reach the log.

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const [keyPath, project] = process.argv.slice(2);

// The APIs a functions deploy touches, with the console link that turns each
// one on. Order matches the order the deploy needs them, so a partial list of
// failures still reads sensibly.
const REQUIRED_APIS = [
  ['cloudfunctions.googleapis.com', 'Cloud Functions', 'the functions themselves'],
  ['cloudbuild.googleapis.com', 'Cloud Build', 'builds the function source'],
  ['artifactregistry.googleapis.com', 'Artifact Registry', 'stores the built image'],
  ['run.googleapis.com', 'Cloud Run', '2nd-gen functions run on Cloud Run'],
  ['eventarc.googleapis.com', 'Eventarc', 'wires triggers to functions'],
  ['pubsub.googleapis.com', 'Pub/Sub', 'carries scheduled and event triggers'],
  ['cloudscheduler.googleapis.com', 'Cloud Scheduler', 'dailyNotifications and todoReminders are scheduled'],
];

// Project-level permissions the deploy needs, and the role that grants each.
// `serviceusage.services.enable` is listed first because it decides whether a
// disabled API above is a blocker or something the deploy fixes on its own.
const REQUIRED_PERMISSIONS = [
  ['serviceusage.services.enable', 'Service Usage Admin'],
  ['cloudfunctions.functions.create', 'Cloud Functions Admin'],
  ['cloudfunctions.functions.update', 'Cloud Functions Admin'],
  ['iam.serviceAccounts.actAs', 'Service Account User'],
  ['cloudbuild.builds.create', 'Cloud Build Editor'],
  ['artifactregistry.repositories.create', 'Artifact Registry Administrator'],
  ['storage.buckets.create', 'Storage Admin'],
  ['eventarc.triggers.create', 'Eventarc Admin'],
  ['cloudscheduler.jobs.create', 'Cloud Scheduler Admin'],
  ['firebase.projects.get', 'Firebase Admin'],
];

const apiLink = (api) => `https://console.cloud.google.com/apis/library/${api}?project=${project}`;

function error(line) { console.log(`::error::${line}`); }
function warn(line) { console.log(`::warning::${line}`); }

/**
 * A preflight that cannot reach Google should not be the thing that stops a
 * deploy — the deploy itself is the real test. Give up loudly and let it run.
 */
function skip(reason) {
  warn(`Preflight checks skipped: ${reason}`);
  warn('Continuing to the deploy — it will report any problem itself, less clearly.');
  process.exit(0);
}

const base64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Mint an access token from the service account key (JWT bearer grant). */
async function getAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: key.token_uri,
    iat: now,
    exp: now + 3600,
  }));
  const signature = base64url(
    createSign('RSA-SHA256').update(`${header}.${claims}`).sign(key.private_key),
  );

  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // This is the one preflight failure worth stopping for: Google rejected the
    // credential outright, which is exactly the case the CLI reports as the
    // unhelpful "have you run firebase login?".
    error(`Google rejected the service account key (${res.status} ${body.error || ''}).`);
    error(`  ${body.error_description || 'No further detail was given.'}`);
    error('  The key is well-formed but not usable — it was probably deleted or');
    error('  disabled, or its service account was removed. Create a fresh key:');
    error('  Backup/FUNCTIONS_DEPLOY_SETUP.md steps 1-4.');
    process.exit(1);
  }
  return body.access_token;
}

/** Enabled/disabled state for one API, or null when the check itself failed. */
async function apiState(token, api) {
  const res = await fetch(
    `https://serviceusage.googleapis.com/v1/projects/${project}/services/${api}`,
    { headers: { authorization: `Bearer ${token}`, 'x-goog-user-project': project } },
  );
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return body.state || null;
}

/**
 * Which of `permissions` the caller actually holds.
 *
 * testIamPermissions rejects the whole request if any single permission name is
 * not valid for a project, so a rejected batch is retried one at a time rather
 * than reported as "you have none of these".
 */
async function heldPermissions(token, permissions) {
  const ask = async (batch) => {
    const res = await fetch(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${project}:testIamPermissions`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-goog-user-project': project,
        },
        body: JSON.stringify({ permissions: batch }),
      },
    );
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return new Set(body.permissions || []);
  };

  const all = await ask(permissions);
  if (all) return all;

  const held = new Set();
  let checked = false;
  for (const p of permissions) {
    const one = await ask([p]);
    if (one === null) continue; // not a valid project permission — ignore it
    checked = true;
    for (const granted of one) held.add(granted);
  }
  return checked ? held : null;
}

// ── Run the checks ──────────────────────────────────────────────────────────

let key;
try {
  key = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch (e) {
  skip(`could not read the key (${e.message})`);
}

const token = await getAccessToken(key).catch((e) => skip(`could not reach Google (${e.message})`));
if (!token) skip('no access token was returned');

console.log(`Checking project ${project} as ${key.client_email}`);
console.log('');

const apiStates = [];
for (const [api, label] of REQUIRED_APIS) {
  const state = await apiState(token, api).catch(() => null);
  apiStates.push([api, label, state]);
}

const held = await heldPermissions(token, REQUIRED_PERMISSIONS.map(([p]) => p)).catch(() => null);

if (apiStates.every(([, , s]) => s === null) && held === null) {
  skip('the project could not be inspected — the key may lack even read access');
}

// ── APIs ──
console.log('APIs:');
const disabled = [];
for (const [api, label, state] of apiStates) {
  if (state === null) {
    console.log(`  ?  ${label} (${api}) — could not check`);
  } else if (state === 'ENABLED') {
    console.log(`  ok ${label}`);
  } else {
    console.log(`  X  ${label} (${api}) — ${state}`);
    disabled.push([api, label]);
  }
}
console.log('');

// ── Permissions ──
const canEnableApis = held === null ? null : held.has('serviceusage.services.enable');
const missingRoles = new Map();
console.log('Permissions:');
if (held === null) {
  console.log('  ?  could not check (the account may lack firebase.projects.get)');
} else {
  for (const [permission, role] of REQUIRED_PERMISSIONS) {
    if (held.has(permission)) {
      console.log(`  ok ${permission}`);
    } else {
      console.log(`  X  ${permission} — needs "${role}"`);
      if (!missingRoles.has(role)) missingRoles.set(role, []);
      missingRoles.get(role).push(permission);
    }
  }
}
console.log('');

// ── Verdict ─────────────────────────────────────────────────────────────────
// A disabled API is only fatal when the account also can't switch it on; with
// Service Usage Admin the deploy enables it and carries on. Reporting those
// two cases the same way is what makes the raw CLI output so hard to act on.

let fatal = false;

if (disabled.length > 0 && canEnableApis !== true) {
  fatal = true;
  const names = disabled.map(([, label]) => label).join(', ');
  error(`${disabled.length} required API(s) are not enabled: ${names}`);
  if (canEnableApis === false) {
    error('  The service account cannot enable them itself — it is missing');
    error('  serviceusage.services.enable ("Service Usage Admin").');
  }
  error('  Enable each one here (a project owner can do this in a browser):');
  for (const [api, label] of disabled) error(`    ${label}: ${apiLink(api)}`);
  error('  Or grant "Service Usage Admin" and let the deploy turn them on.');
}

// Missing serviceusage.services.enable on its own is not fatal — if every API
// is already on, the deploy never needs to enable anything.
const blockingRoles = [...missingRoles].filter(([role]) => role !== 'Service Usage Admin');
if (blockingRoles.length > 0) {
  fatal = true;
  error(`The service account is missing ${blockingRoles.length} role(s) the deploy needs:`);
  for (const [role, permissions] of blockingRoles) {
    error(`    ${role} — for ${permissions.join(', ')}`);
  }
  error(`  Grant them: https://console.cloud.google.com/iam-admin/iam?project=${project}`);
  error(`  Find ${key.client_email}, click the pencil, add each role.`);
  error('  Full list: Backup/FUNCTIONS_DEPLOY_SETUP.md step 2.');
}

if (fatal) {
  error('Stopping before the deploy — it would fail part-way through with a');
  error('less specific version of the above, leaving nothing deployed.');
  process.exit(1);
}

if (disabled.length > 0) {
  warn(`${disabled.length} API(s) are off; the deploy will enable them (this makes it slower).`);
}
if (missingRoles.has('Service Usage Admin')) {
  warn('No Service Usage Admin, but every required API is already on — proceeding.');
}

console.log('Preflight passed — the project is ready for a functions deploy.');
