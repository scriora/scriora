import crypto from 'node:crypto';

export function getMasterKey(): Buffer {
  const key = process.env.MASTER_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('MASTER_ENCRYPTION_KEY is required and was not provided in environment');
  }
  const trimmedKey = key.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmedKey)) {
    throw new Error(
      `Invalid MASTER_ENCRYPTION_KEY: must be a 64-character hexadecimal string (32 bytes). Received length: ${trimmedKey.length}`
    );
  }
  return Buffer.from(trimmedKey, 'hex');
}

/**
 * Encrypts arbitrary token data into AES-256-GCM envelope format:
 * [12-byte IV][16-byte TAG][Encrypted Data]
 */
export function encryptEnvelopePayload(data: Record<string, unknown>): {
  ciphertext: Uint8Array;
  keyId: string;
} {
  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);

  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelopeData = Buffer.concat([iv, tag, encrypted]);
  return { ciphertext: new Uint8Array(envelopeData), keyId: 'master-v1' };
}

/**
 * Decrypts AES-256-GCM envelope data:
 * [12-byte IV][16-byte TAG][Encrypted Data]
 */
export function decryptEnvelopePayload(
  envelopeData: Buffer | Uint8Array | Record<string, number> | { type?: string; data?: number[] }
): Record<string, unknown> {
  let buffer: Buffer;
  if (Buffer.isBuffer(envelopeData)) {
    buffer = envelopeData;
  } else if (envelopeData instanceof Uint8Array) {
    buffer = Buffer.from(envelopeData);
  } else if ('data' in envelopeData && Array.isArray(envelopeData.data)) {
    buffer = Buffer.from(envelopeData.data);
  } else if (typeof envelopeData === 'object' && envelopeData !== null) {
    buffer = Buffer.from(Object.values(envelopeData));
  } else {
    buffer = Buffer.from(envelopeData as unknown as Uint8Array);
  }

  if (buffer.length < 28) {
    throw new Error('Invalid SecretEnvelope: payload too short to contain IV and Tag');
  }

  const masterKey = getMasterKey();
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}
