export async function proofSignature(
  secret: string,
  request: Request,
  purchaseId: string,
  intent: string,
  timestamp: string,
  bodyHash: string,
) {
  const tokenHash = await hashBytes(
    new TextEncoder().encode(request.headers.get('Authorization') ?? ''),
  );
  const payload = JSON.stringify([
    timestamp,
    purchaseId,
    intent,
    request.headers.get('Content-Type'),
    bodyHash,
    tokenHash,
  ]);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return [
    ...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))),
  ]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export async function hashBytes(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export function equalSignature(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/.test(a) || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
