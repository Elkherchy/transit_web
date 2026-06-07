import type { IFacture, IFacturePayeur } from '@/types';

type LeanPayeur = { _id: unknown; nom: string; email: string };

/** Normalise une facture lean avec payeurId populé vers IFacture + payeur. */
export function serializeFacture(f: Record<string, unknown>): IFacture {
  const out = { ...f } as Record<string, unknown>;
  const raw = out.payeurId;

  if (raw && typeof raw === 'object' && raw !== null && '_id' in raw) {
    const p = raw as LeanPayeur;
    out.payeur = {
      _id: String(p._id),
      nom: p.nom,
      email: p.email,
    } satisfies IFacturePayeur;
    out.payeurId = String(p._id);
  } else if (raw != null && raw !== '') {
    out.payeurId = String(raw);
  } else {
    delete out.payeurId;
    delete out.payeur;
  }

  if (out._id != null) out._id = String(out._id);
  if (out.transitId != null) out.transitId = String(out.transitId);

  return out as unknown as IFacture;
}
