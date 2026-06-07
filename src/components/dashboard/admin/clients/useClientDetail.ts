import { useEffect, useState, useCallback } from 'react';
import type { IFacture, ITransaction } from '@/types';

export interface ClientDetailData {
  client: {
    _id: string;
    nom: string;
    telephone?: string;
    email?: string;
    caisseId?: string;
    actif: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  };
  caisse?: { _id: string; nom: string; solde: number };
  factures: IFacture[];
  transactions: ITransaction[];
}

export function useClientDetail(id: string, enabled: boolean) {
  const [data, setData] = useState<ClientDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/clients/${id}`, {
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) setData(r.data);
      else setError(r.error || 'Erreur');
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (enabled && id) void reload();
  }, [enabled, id, reload]);

  return { data, loading, error, reload };
}
