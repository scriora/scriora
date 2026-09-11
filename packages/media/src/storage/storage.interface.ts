// Object Storage Interface — provider-neutral abstraction
// Implemented by: S3Adapter, R2Adapter, MinIOAdapter
// Reference: scriora-docs/architecture/SCRIORA_MEDIA_FRAMEWORK.md

export interface StorageProvider {
  /** Generate a presigned URL for direct client upload */
  getPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string>;

  /** Generate a presigned URL for secure read access */
  getPresignedReadUrl(params: { key: string; expiresInSeconds: number }): Promise<string>;

  /** Delete an object from storage */
  deleteObject(key: string): Promise<void>;

  /** Check if an object exists */
  objectExists(key: string): Promise<boolean>;
}
