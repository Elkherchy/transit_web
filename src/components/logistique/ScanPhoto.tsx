import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Affiche une photo de scan départ/retour stockée sur S3.
 * Récupère une URL signée via /api/documents/[storageKey].
 */
export function ScanPhoto({
  label,
  storageKey,
  filename,
}: {
  label: string;
  storageKey: string;
  filename?: string;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/documents/${encodeURIComponent(storageKey)}`,
          { credentials: 'include' }
        ).then((x) => x.json());
        if (cancelled) return;
        if (r.success && r.url) setUrl(String(r.url));
        else setError(t('dashboard.logistique.mesVoyages.photoUnavailable'));
      } catch {
        if (!cancelled) setError(t('common.errorNetwork'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey, t]);

  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !url ? (
        <div className="h-32 rounded-md border bg-muted animate-pulse" />
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-md border bg-muted hover:opacity-90 transition-opacity"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={filename || label}
            className="w-full max-h-72 object-contain bg-white"
          />
        </a>
      )}
      {filename && (
        <p className="text-xs text-muted-foreground truncate">{filename}</p>
      )}
    </div>
  );
}

export default ScanPhoto;
