/**
 * Deterministic non-cryptographic hashing for prefix fingerprints and IDs.
 * Never use Math.random in simulation code.
 */

export function fnv1a32(input: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function hashString(input: string): string {
  const a = fnv1a32(input, 0x811c9dc5).toString(16).padStart(8, '0');
  const b = fnv1a32(input, 0x9e3779b9).toString(16).padStart(8, '0');
  return `${a}${b}`;
}

/** Stable hash chain: a child block hash depends on its parent hash and content. */
export function chainHash(parentHash: string | null, contentFingerprint: string): string {
  return hashString(`${parentHash ?? 'root'}|${contentFingerprint}`);
}

/**
 * Deterministic token fingerprint for a request block. Real token IDs are not
 * needed by the simulator; only stable identity for cache matching.
 */
export function blockContentFingerprint(
  requestId: string,
  blockIndex: number,
  tokenStart: number,
  tokenCount: number,
  sharedPrefixId?: string,
): string {
  if (sharedPrefixId) return `sp:${sharedPrefixId}:${blockIndex}:${tokenCount}`;
  return `req:${requestId}:${blockIndex}:${tokenStart}:${tokenCount}`;
}
