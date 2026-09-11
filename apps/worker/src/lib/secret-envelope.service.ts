import crypto from 'node:crypto';
import { z } from 'zod';

export const DecryptedTokensSchema = z
  .object({
    accessToken: z.string().min(1, 'accessToken is required and cannot be empty'),
    refreshToken: z.string().optional(),
    expiresIn: z.number().optional(),
    accountName: z.string().optional(),
  })
  .passthrough();

export type DecryptedTokens = z.infer<typeof DecryptedTokensSchema>;

export class SecretEnvelopeService {
  private readonly masterKey: Buffer;

  constructor(masterKeyHex?: string) {
    const key = masterKeyHex ?? process.env.MASTER_ENCRYPTION_KEY;
    if (!key) {
      throw new Error(
        'MASTER_ENCRYPTION_KEY is required and was not provided in environment or constructor'
      );
    }

    const trimmedKey = key.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(trimmedKey)) {
      throw new Error(
        `Invalid MASTER_ENCRYPTION_KEY: must be a 64-character hexadecimal string (32 bytes). Received length: ${trimmedKey.length}`
      );
    }

    this.masterKey = Buffer.from(trimmedKey, 'hex');
  }

  public decrypt(
    envelopeData: Buffer | Uint8Array | Record<string, number> | { type?: string; data?: number[] }
  ): DecryptedTokens {
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

    // Format: [12-byte IV][16-byte TAG][Encrypted Data]
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const ciphertext = buffer.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    let parsed: unknown;
    try {
      parsed = JSON.parse(decrypted.toString('utf8'));
    } catch {
      throw new Error('Invalid SecretEnvelope: decrypted content is not valid JSON');
    }

    return DecryptedTokensSchema.parse(parsed);
  }
}
