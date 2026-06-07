import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getPresignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';

/** Base URL app (liens publics, redirections) — prioritaire sur NEXTAUTH_URL */
export function getAppBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
    '';
  return fromEnv || 'http://localhost:3000';
}

const isDigitalOceanSpaces = process.env.S3_ENDPOINT?.includes(
  'digitaloceanspaces.com'
);
const doRegion =
  process.env.DO_SPACES_REGION ||
  process.env.S3_ENDPOINT?.match(/\.([a-z0-9]+)\.digitaloceanspaces\.com/)?.[1] ||
  'fra1';

export const BUCKET_NAME =
  process.env.S3_BUCKET_NAME ||
  process.env.MINIO_BUCKET_NAME ||
  process.env.AWS_S3_BUCKET ||
  '';

const s3EndpointFromEnv =
  process.env.S3_ENDPOINT?.trim().replace(/\/$/, '') ?? '';

const normalizedEndpoint = isDigitalOceanSpaces
  ? `https://${doRegion}.digitaloceanspaces.com`
  : s3EndpointFromEnv || undefined;

const region = isDigitalOceanSpaces
  ? doRegion
  : process.env.AWS_REGION || 'us-east-1';

const credentials = {
  accessKeyId:
    process.env.S3_ACCESS_KEY ||
    process.env.MINIO_ACCESS_KEY ||
    process.env.AWS_ACCESS_KEY_ID ||
    '',
  secretAccessKey:
    process.env.S3_SECRET_ACCESS ||
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.MINIO_SECRET_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    '',
};

const envForcePath =
  process.env.S3_FORCE_PATH_STYLE ?? process.env.forcePathStyle;
let forcePathStyle = !isDigitalOceanSpaces;
if (envForcePath === 'true' || envForcePath === '1') {
  forcePathStyle = true;
}
if (envForcePath === 'false' || envForcePath === '0') {
  forcePathStyle = false;
}

const clientConfig: {
  region: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  forcePathStyle: boolean;
  endpoint?: string;
} = {
  region,
  credentials,
  forcePathStyle,
};

if (normalizedEndpoint) {
  clientConfig.endpoint = normalizedEndpoint;
} else if (process.env.MINIO_ENDPOINT) {
  const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
  const port = process.env.MINIO_PORT || '9000';
  clientConfig.endpoint = `${protocol}://${process.env.MINIO_ENDPOINT}:${port}`;
}

export const s3 = new S3Client(clientConfig);

export function isObjectStorageConfigured(): boolean {
  return Boolean(
    BUCKET_NAME &&
      credentials.accessKeyId &&
      credentials.secretAccessKey
  );
}

export async function uploadFile(
  file: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  const input: PutObjectCommandInput = {
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: file,
    ContentType: contentType,
  };
  if (isDigitalOceanSpaces) {
    input.ACL = 'public-read';
  }
  await s3.send(new PutObjectCommand(input));
  return fileName;
}

export async function uploadFileFromStream(
  stream: Readable,
  fileName: string,
  contentType: string,
  contentLength: number
): Promise<string> {
  const input: PutObjectCommandInput = {
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: stream,
    ContentType: contentType,
    ContentLength: contentLength,
  };
  if (isDigitalOceanSpaces) {
    input.ACL = 'public-read';
  }
  await s3.send(new PutObjectCommand(input));
  return fileName;
}

export function getFileUrl(fileName: string): string {
  if (isDigitalOceanSpaces) {
    return `https://${BUCKET_NAME}.${doRegion}.digitaloceanspaces.com/${fileName}`;
  }
  if (normalizedEndpoint) {
    const endpoint = normalizedEndpoint.replace(/\/$/, '');
    return `${endpoint}/${BUCKET_NAME}/${fileName}`;
  }
  if (process.env.MINIO_ENDPOINT) {
    const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
    const port = process.env.MINIO_PORT || '9000';
    return `${protocol}://${process.env.MINIO_ENDPOINT}:${port}/${BUCKET_NAME}/${fileName}`;
  }
  return `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${fileName}`;
}

export async function deleteFile(fileName: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
    })
  );
}

export async function getSignedUrl(
  fileName: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
  });
  return getPresignedUrl(s3, command, { expiresIn });
}

export async function getUploadSignedUrl(
  fileName: string,
  contentType: string,
  expiresIn: number = 3600,
  options: { acl?: 'public-read' | 'private' } = {}
): Promise<{
  uploadUrl: string;
  fileUrl: string;
  key: string;
  headers: Record<string, string>;
}> {
  const key = fileName;
  const resolvedContentType = contentType || 'application/octet-stream';

  // L'ACL est OPT-IN — par défaut, on ne demande pas `public-read` car ce
  // header oblige le navigateur à inclure `x-amz-acl` dans le PUT, ce qui :
  //  1) fait échouer le PUT si la CORS du bucket ne whitelist pas ce header,
  //  2) ajoute un round-trip preflight CORS.
  // Les documents (factures, justificatifs) sont accédés via URL présignée
  // GET — pas besoin d'ACL public.
  const wantPublicRead = options.acl === 'public-read';

  const putInput: PutObjectCommandInput = {
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: resolvedContentType,
  };
  if (isDigitalOceanSpaces && wantPublicRead) {
    putInput.ACL = 'public-read';
  }

  const command = new PutObjectCommand(putInput);
  const uploadUrl = await getPresignedUrl(s3, command, { expiresIn });
  const fileUrl = getFileUrl(key);

  const headers: Record<string, string> = {
    'Content-Type': resolvedContentType,
  };
  if (isDigitalOceanSpaces && wantPublicRead) {
    headers['x-amz-acl'] = 'public-read';
  }

  return {
    uploadUrl,
    fileUrl,
    key,
    headers,
  };
}

export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array,
  contentType = 'application/pdf'
): Promise<string> {
  return uploadFile(Buffer.from(body), key, contentType);
}

export async function getSignedDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  return getSignedUrl(key, expiresIn);
}
