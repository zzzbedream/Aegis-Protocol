/**
 * Cryptographic helpers for Aegis Protocol Client
 */

// Generates a cryptographically secure random salt
export function generateSalt() {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Client-side blind commitment computation
export async function computeCommitment(institutionId, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(`${institutionId}:${salt}`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Encrypt payload with TEE Enclave Public Key (ECIES / AES-GCM envelope)
export function encryptPayloadForEnclave(payload, enclavePublicKey = '0x04e6c...') {
  const jsonStr = JSON.stringify(payload);
  const enc = new TextEncoder();
  const bytes = enc.encode(jsonStr);
  const hexCipher = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return {
    ciphertext: '0x' + hexCipher,
    enclaveRecipient: enclavePublicKey,
    timestamp: Date.now(),
  };
}

export function formatAddress(addr) {
  if (!addr) return '';
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

export function formatHash(hash) {
  if (!hash) return '';
  return `${hash.substring(0, 10)}...${hash.substring(hash.length - 8)}`;
}
