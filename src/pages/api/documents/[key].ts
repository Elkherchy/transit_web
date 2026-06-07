import type { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { getTransitDocumentDownloadUrl } from '@/lib/transitDocumentStorage';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key } = req.query;

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Invalid key' });
  }

  const decoded = decodeURIComponent(key);
  const result = await getTransitDocumentDownloadUrl(decoded);
  if (!result) {
    return res.status(404).json({ error: 'File not found' });
  }

  return res.status(200).json({
    success: true,
    url: result.url,
    kind: result.kind,
  });
}

export default withAuth(handler);
