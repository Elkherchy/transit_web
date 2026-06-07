import path from 'path';
import {
  uploadFile,
  deleteFile,
  getSignedDownloadUrl,
  isObjectStorageConfigured,
} from '@/lib/s3';

export interface StoreTransitFileInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

function assertStorageConfigured(): void {
  if (!isObjectStorageConfigured()) {
    throw new Error(
      'Stockage S3 : définissez S3_ENDPOINT (sauf AWS par défaut), S3_BUCKET_NAME, S3_ACCESS_KEY, S3_SECRET_ACCESS ou S3_SECRET_ACCESS_KEY, et NEXT_PUBLIC_APP_URL pour les liens applicatifs.'
    );
  }
}

/** @deprecated Utiliser {@link isObjectStorageConfigured} */
export function isTransitMinioEnabled(): boolean {
  return isObjectStorageConfigured();
}

/**
 * Supprime l’objet dans le bucket S3 (clé telle qu’enregistrée en base, ex. transit_snts/…/doc-….pdf).
 */
export async function removeTransitStoredFile(key: string): Promise<void> {
  if (!key || key.includes('..')) {
    return;
  }
  if (!isObjectStorageConfigured()) {
    return;
  }
  try {
    await deleteFile(key);
  } catch (err) {
    console.error('S3 DeleteObject:', key, err);
  }
}

export async function removeTransitStoredFiles(keys: string[]): Promise<void> {
  await Promise.all(keys.filter(Boolean).map((k) => removeTransitStoredFile(k)));
}

/**
 * Enregistre un document (transit, manutention, etc.) dans S3.
 * @param transitId segment dossier (ex. id Mongo ou `manutention/{id}`)
 */
export async function storeTransitDocument(
  transitId: string,
  file: StoreTransitFileInput
): Promise<{ key: string; name: string; size: number }> {
  assertStorageConfigured();
  const ext = path.extname(file.originalname) || '';
  const base =
    'doc-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
  const objectKey = `transit_snts/${transitId}/${base}`;
  await uploadFile(
    Buffer.from(file.buffer),
    objectKey,
    file.mimetype || 'application/octet-stream'
  );
  return {
    key: objectKey,
    name: file.originalname,
    size: file.size,
  };
}

/**
 * Enregistre un reçu de paiement dans S3. `recuUrl` en base = clé objet (ex. recus_snts/recu-….pdf).
 */
export async function storeRecuDocument(
  file: StoreTransitFileInput
): Promise<{ recuUrl: string; name: string; size: number }> {
  assertStorageConfigured();
  const ext = path.extname(file.originalname) || '';
  const base =
    'recu-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
  const objectKey = `recus_snts/${base}`;
  await uploadFile(
    Buffer.from(file.buffer),
    objectKey,
    file.mimetype || 'application/octet-stream'
  );
  return {
    recuUrl: objectKey,
    name: file.originalname,
    size: file.size,
  };
}

/**
 * URL de téléchargement : toujours une URL présignée GET S3.
 */
export async function getTransitDocumentDownloadUrl(
  key: string
): Promise<{ url: string; kind: 'presigned' } | null> {
  if (!key || key.includes('..')) {
    return null;
  }
  if (!isObjectStorageConfigured()) {
    return null;
  }
  try {
    const url = await getSignedDownloadUrl(key, 3600);
    return { url, kind: 'presigned' };
  } catch (e) {
    console.error('S3 presigned GET:', key, e);
    return null;
  }
}
