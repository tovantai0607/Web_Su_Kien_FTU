import type { ApplicationInput } from '@ftu/shared';

const draftKey = 'ftucharm-registration-draft-v1';
const returnKey = 'ftucharm-registration-return-v1';
const textFields = [
  'full_name',
  'email',
  'phone',
  'faculty',
  'cohort',
  'class_name',
  'bio',
  'talents',
] as const;
type TextValues = Pick<ApplicationInput, (typeof textFields)[number] | 'height_cm' | 'gender'>;
type Draft = { version: 1; ownerId: string | null; step: number; values: Partial<TextValues> };
type StorageProvider = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** User-approved tab-only draft. Never includes passwords, tokens, consent or media. */
export function createRegistrationDraftStore(storage: StorageProvider) {
  let memory: Draft | null = null;
  let returning = false;
  const remove = (key: string) => {
    try {
      storage().removeItem(key);
    } catch {
      /* Memory fallback when storage is blocked. */
    }
  };
  const clear = () => {
    memory = null;
    returning = false;
    remove(draftKey);
    remove(returnKey);
  };
  function load(ownerId?: string): Draft | null {
    let raw: string | null;
    try {
      raw = storage().getItem(draftKey);
    } catch {
      raw = null;
    }
    try {
      if (raw) {
        if (raw.length > 50000) throw new Error('Oversized draft');
        const parsed = JSON.parse(raw) as Draft;
        if (
          parsed.version !== 1 ||
          !parsed.values ||
          typeof parsed.values !== 'object' ||
          Array.isArray(parsed.values) ||
          !Number.isInteger(parsed.step) ||
          parsed.step < 0 ||
          parsed.step > 2 ||
          (parsed.ownerId !== null && typeof parsed.ownerId !== 'string')
        )
          throw new Error('Invalid draft');
        memory = { ...parsed, values: selectValues(parsed.values) };
      }
    } catch {
      memory = null;
      remove(draftKey);
    }
    if (memory?.ownerId && ownerId && memory.ownerId !== ownerId) clear();
    return memory;
  }
  function save(values: Partial<ApplicationInput>, step: number, ownerId?: string) {
    memory = {
      version: 1,
      ownerId: ownerId ?? null,
      step: Math.max(0, Math.min(2, step)),
      values: selectValues(values),
    };
    try {
      storage().setItem(draftKey, JSON.stringify(memory));
    } catch {
      /* RAM fallback. */
    }
  }
  function beginLogin() {
    returning = true;
    try {
      storage().setItem(returnKey, '/dang-ky');
    } catch {
      /* RAM fallback. */
    }
  }
  function hasLoginReturn() {
    try {
      return storage().getItem(returnKey) === '/dang-ky' || returning;
    } catch {
      return returning;
    }
  }
  function consumeLoginReturn() {
    const destination = hasLoginReturn() ? '/dang-ky' : null;
    returning = false;
    remove(returnKey);
    return destination;
  }
  return { load, save, clear, beginLogin, hasLoginReturn, consumeLoginReturn };
}

function selectValues(input: Partial<ApplicationInput>): Partial<TextValues> {
  const values: Partial<TextValues> = {};
  for (const key of textFields) {
    const value = input[key];
    if (typeof value === 'string') values[key] = value.slice(0, 5000);
  }
  if (typeof input.height_cm === 'number' && Number.isFinite(input.height_cm))
    values.height_cm = input.height_cm;
  if (input.gender === 'male' || input.gender === 'female') values.gender = input.gender;
  return values;
}

export const registrationDrafts = createRegistrationDraftStore(() => window.sessionStorage);
