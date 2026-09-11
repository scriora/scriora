import crypto from 'node:crypto';

export interface DecryptedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  accountName?: string;
  [key: string]: unknown;
}

export class SecretEnvelopeService {
  private readonly masterKey: Buffer;

  constructor(masterKeyHex?: string) {
    const key =
      masterKeyHex ||
      process.env.MASTER_ENCRYPTION_KEY ||
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
    this.masterKey = Buffer.from(key, 'hex');
  }

  public decrypt(envelopeData: Buffer | Uint8Array): DecryptedTokens {
    const buffer = Buffer.isBuffer(envelopeData) ? envelopeData : Buffer.from(envelopeData);

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
    return JSON.parse(decrypted.toString('utf8')) as DecryptedTokens;
  }
}
