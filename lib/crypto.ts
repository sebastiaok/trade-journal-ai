// lib/crypto.ts
// AES-256-GCM 암/복호화 유틸 — 서버 전용 (Node.js crypto)
// 키: BROKER_ENCRYPTION_KEY 환경변수 (32바이트 = 64자 hex)

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const hex = process.env.BROKER_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('BROKER_ENCRYPTION_KEY 환경변수가 없거나 길이가 올바르지 않습니다 (64자 hex 필요).');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * 평문을 AES-256-GCM으로 암호화.
 * 반환: iv(12) + authTag(16) + ciphertext를 hex로 인코딩한 문자열.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('hex');
}

/**
 * encrypt()로 암호화된 hex 문자열을 복호화.
 */
export function decrypt(encrypted: string): string {
  const key = getKey();
  const buf = Buffer.from(encrypted, 'hex');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}
