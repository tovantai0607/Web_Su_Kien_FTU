import { describe, it, expect } from 'vitest';
import { createRegistrationDraftStore } from '../../apps/web/src/lib/registration-draft';

function tab() {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  };
  return { entries, storage };
}
describe('tab-only registration draft', () => {
  it('survives a page replacement but excludes CAPTCHA, consent, media and unrelated secrets', () => {
    const { entries, storage } = tab();
    const first = createRegistrationDraftStore(() => storage);
    first.save(
      {
        full_name: 'QA ONLY',
        phone: '0000000000',
        bio: 'Partial text',
        height_cm: 170,
        turnstile_token: 'do-not-store',
        media_ids: ['private-media'],
        student_card_media_id: 'private-card',
        consent: true,
      },
      1,
    );
    first.beginLogin();
    const callback = createRegistrationDraftStore(() => storage);
    expect(callback.load()?.values).toEqual({
      full_name: 'QA ONLY',
      phone: '0000000000',
      bio: 'Partial text',
      height_cm: 170,
    });
    expect(callback.load()?.step).toBe(1);
    expect(callback.consumeLoginReturn()).toBe('/dang-ky');
    expect(callback.consumeLoginReturn()).toBeNull();
    expect([...entries.values()].join('')).not.toMatch(
      /do-not-store|private-media|private-card|consent/,
    );
  });
  it('does not leak one account draft into another and clears both draft and login return on logout/completion', () => {
    const { storage, entries } = tab();
    const store = createRegistrationDraftStore(() => storage);
    store.save({ full_name: 'QA A' }, 0, 'owner-a');
    store.beginLogin();
    expect(store.load('owner-b')).toBeNull();
    expect(entries.size).toBe(0);
    store.save({ full_name: 'QA B' }, 1, 'owner-b');
    store.beginLogin();
    store.clear();
    expect(store.load()).toBeNull();
    expect(store.hasLoginReturn()).toBe(false);
    expect(entries.size).toBe(0);
  });
  it('discards corrupt/versioned data and only accepts the fixed internal return destination', () => {
    const { storage, entries } = tab();
    const store = createRegistrationDraftStore(() => storage);
    entries.set('ftucharm-registration-draft-v1', '{broken');
    entries.set('ftucharm-registration-return-v1', 'https://attacker.example');
    expect(store.load()).toBeNull();
    expect(store.consumeLoginReturn()).toBeNull();
    entries.set(
      'ftucharm-registration-draft-v1',
      JSON.stringify({ version: 2, step: 0, ownerId: null, values: {} }),
    );
    expect(store.load()).toBeNull();
  });
  it('falls back to memory when tab storage is blocked and cannot restore from a different tab store', () => {
    const store = createRegistrationDraftStore(() => {
      throw new Error('blocked');
    });
    store.save({ full_name: 'QA ONLY' }, 0);
    store.beginLogin();
    expect(store.load()?.values.full_name).toBe('QA ONLY');
    expect(store.consumeLoginReturn()).toBe('/dang-ky');
    store.clear();
    expect(store.load()).toBeNull();
    const other = tab();
    expect(createRegistrationDraftStore(() => other.storage).load()).toBeNull();
  });
});
