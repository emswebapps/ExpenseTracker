import { test } from 'node:test';
import assert from 'node:assert';
import { isPartnerOnly, withoutPartner } from './helpers.js';

test('records tagged to a partner are hidden, in every spelling the app has used', () => {
  for (const r of [{ owner: 'cameron' }, { owner: 'partner' }, { person: 'spouse' }, { person: 'Cameron' }, { person: 'partner' }]) {
    assert.strictEqual(isPartnerOnly(r), true, JSON.stringify(r));
  }
});

test('your own, joint, and untagged records are kept', () => {
  for (const r of [{ owner: 'aaron' }, { owner: 'mine' }, { owner: 'joint' }, { person: 'both' }, { person: 'me' }, {}, null]) {
    assert.strictEqual(isPartnerOnly(r), false, JSON.stringify(r));
  }
});

test('withoutPartner filters an array and passes anything else through', () => {
  const rows = [{ id: 1, owner: 'aaron' }, { id: 2, owner: 'cameron' }, { id: 3 }];
  assert.deepStrictEqual(withoutPartner(rows).map((r) => r.id), [1, 3]);
  assert.strictEqual(withoutPartner(undefined), undefined);
});
