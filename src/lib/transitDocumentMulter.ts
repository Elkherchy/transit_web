import multer from 'multer';

/** Upload transit documents en mémoire (MinIO ou écriture disque). */
export const transitDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
