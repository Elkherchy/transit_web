import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url, 'http://local').pathname;
    const m = pathname.match(/\.([a-z0-9]+)$/i);
    return (m?.[1] ?? '').toLowerCase();
  } catch {
    const clean = url.split('?')[0] ?? '';
    const m = clean.match(/\.([a-z0-9]+)$/i);
    return (m?.[1] ?? '').toLowerCase();
  }
}

export interface PDFViewProps {
  /** URL absolue (ex. lien présigné S3) */
  src: string;
  title?: string;
  className?: string;
}

/**
 * Affiche un PDF (iframe) ou une image (img) pour un reçu / document inline.
 */
export function PDFView({ src, title = 'Document', className }: PDFViewProps) {
  const ext = extFromUrl(src);
  const isPdf = ext === 'pdf';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <a href={src} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Ouvrir dans un nouvel onglet
          </a>
        </Button>
      </div>
      <div
        className={cn(
          'overflow-hidden rounded-md border bg-muted/30',
          isPdf ? 'min-h-[70vh]' : 'inline-block max-w-full'
        )}
      >
        {isPdf ? (
          <iframe
            title={title}
            src={src}
            className="h-[70vh] w-full border-0"
          />
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- reçu utilisateur, URL dynamique
          <img
            src={src}
            alt={title}
            className="max-h-[70vh] w-auto max-w-full object-contain"
          />
        ) : (
          <iframe
            title={title}
            src={src}
            className="h-[70vh] w-full border-0"
          />
        )}
      </div>
    </div>
  );
}
