const key = 'ftu-evidence-login';
const lifetime = 30 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let memory: { id: string; expires: number } | null = null;
export function evidenceId(value: string | null | undefined) {
  return typeof value === 'string' && uuid.test(value) ? value.toLowerCase() : null;
}
export function beginEvidenceLogin(value: string | null) {
  const id = evidenceId(value);
  if (!id) {
    evidenceLoginReturn(true);
    return;
  }
  memory = { id, expires: Date.now() + lifetime };
  try {
    sessionStorage.setItem(key, JSON.stringify(memory));
  } catch {
    /* Keep password login usable without storage. */
  }
}
export function evidenceLoginReturn(consume = false) {
  let saved = memory;
  try {
    saved = JSON.parse(sessionStorage.getItem(key) || 'null') ?? saved;
  } catch {
    /* Ignore corrupt/unavailable storage. */
  }
  const id = evidenceId(saved?.id);
  const valid =
    id &&
    Number.isFinite(saved?.expires) &&
    saved!.expires > Date.now() &&
    saved!.expires <= Date.now() + lifetime;
  if (consume || !valid) {
    memory = null;
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* No persisted intent. */
    }
  }
  return valid ? '/minh-chung/' + id : null;
}
