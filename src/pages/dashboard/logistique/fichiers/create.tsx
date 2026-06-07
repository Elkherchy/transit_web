import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CardHeader } from '@/components/ui/card';
import { ILogistiqueClient, UserRole } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';

interface VoyageRow {
  id: string;
  date: string;
  client: string;
  /** ID LogistiqueClient sélectionné. Si vide, le champ "client" libre est utilisé en fallback. */
  clientId: string;
  bl: string;
  /** Liste des NTC associés au BL — chaque NTC sera explosé en voyage séparé. */
  ntcs: string[];
  telephone: string;
  societe: string;
  tp: string;
  magasinage: string;
  surestaries: string;
  note: string;
}

function emptyRow(date: string): VoyageRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    client: '',
    clientId: '',
    bl: '',
    ntcs: [''],
    telephone: '',
    societe: '',
    tp: '',
    magasinage: '',
    surestaries: '',
    note: '',
  };
}

export default function CreateFichierLogistique() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_LOGISTIQUE ||
    user?.role === UserRole.AGENT_RECEPTION_LOGISTIQUE;

  const todayIso = () => new Date().toISOString().slice(0, 10);
  const [fichierDate, setFichierDate] = useState<string>(todayIso());
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<VoyageRow[]>([emptyRow(todayIso())]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Liste des clients logistique pour le combobox des voyages.
  const [clients, setClients] = useState<ILogistiqueClient[]>([]);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  useEffect(() => {
    if (!isAllowed) return;
    void (async () => {
      try {
        const r = await fetch('/api/logistique/customers', {
          credentials: 'include',
        });
        const data = await r.json();
        if (data.success) setClients((data.data || []) as ILogistiqueClient[]);
      } catch {
        // silencieux : si la liste ne charge pas, le formulaire reste utilisable
      }
    })();
  }, [isAllowed]);

  const updateRow = (
    id: string,
    field: Exclude<keyof VoyageRow, 'id' | 'ntcs'>,
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  /** Sélection d'un client logistique → pré-remplit les champs descriptifs. */
  const pickClient = (rowId: string, clientId: string) => {
    const client = clients.find((c) => c._id === clientId);
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              clientId,
              client: client?.nom || r.client,
              telephone: client?.numero || r.telephone,
              societe: client?.societe || r.societe,
            }
          : r
      )
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(fichierDate)]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fichierDate) return setError(t('dashboard.logistique.fichier.errDateRequired'));
    if (rows.length === 0) return setError(t('dashboard.logistique.fichier.errAddVoyage'));

    // Pré-validation : chaque ligne doit avoir au moins client / BL / NTC.
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const hasNtc = (r.ntcs || []).some((n) => n.trim());
      if (!r.client.trim() && !r.bl.trim() && !hasNtc) {
        return setError(
          t('dashboard.logistique.fichier.errVoyageMissingFields', { index: i + 1 })
        );
      }
    }

    setSubmitting(true);
    try {
      // Explosion : chaque NTC d'une ligne devient un voyage séparé (même BL).
      // Si une ligne n'a aucun NTC saisi, on crée tout de même un voyage sans NTC.
      interface VoyagePayload {
        date?: string;
        client?: string;
        clientId?: string;
        bl?: string;
        telephone?: string;
        societe?: string;
        tp?: string;
        magasinage: string | null;
        surestaries: string | null;
        note?: string;
        ntc?: string;
        ntcs: string[];
      }
      const voyages: VoyagePayload[] = rows.flatMap((r): VoyagePayload[] => {
        const cleanNtcs = (r.ntcs || [])
          .map((n) => n.trim().toUpperCase())
          .filter((n) => n.length > 0);
        const base = {
          date: r.date ? new Date(r.date).toISOString() : undefined,
          client: r.client.trim() || undefined,
          clientId: r.clientId || undefined,
          bl: r.bl.trim() || undefined,
          telephone: r.telephone.trim() || undefined,
          societe: r.societe.trim() || undefined,
          tp: r.tp.trim() || undefined,
          magasinage: r.magasinage ? new Date(r.magasinage).toISOString() : null,
          surestaries: r.surestaries ? new Date(r.surestaries).toISOString() : null,
          note: r.note.trim() || undefined,
        };
        if (cleanNtcs.length === 0) {
          return [{ ...base, ntcs: [] }];
        }
        return cleanNtcs.map((n) => ({
          ...base,
          ntc: n,
          ntcs: [n],
        }));
      });

      const body = {
        date: new Date(fichierDate).toISOString(),
        note: note.trim() || undefined,
        voyages,
      };
      const res = await fetch('/api/logistique/fichiers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.success) {
        void router.push('/dashboard/logistique/fichiers');
      } else {
        setError(d.error || t('dashboard.logistique.fichier.errCreate'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.fichiers.newTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  // Total NTCs = nombre de voyages qui seront effectivement créés (1 par NTC).
  const totalVoyages = rows.reduce((s, r) => {
    const n = (r.ntcs || []).filter((x) => x.trim()).length;
    return s + (n > 0 ? n : 1);
  }, 0);

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.fichiers.newTitle')}
        subtitle={t('dashboard.fichiers.newSubtitle')}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/logistique/fichiers">
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('dashboard.logistique.actions.back')}
            </Link>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <form onSubmit={submit} className="space-y-6 max-w-7xl mx-auto">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Entête fichier */}
          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm space-y-4">
            <CardHeader className="text-base font-semibold text-primary p-0">
              {t('dashboard.logistique.fichier.editInfoCard')}
            </CardHeader>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fdate">
                  {t('dashboard.logistique.fichier.fieldDate')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fdate"
                  type="date"
                  value={fichierDate}
                  onChange={(e) => setFichierDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fnote">{t('dashboard.logistique.fichier.fieldNote')}</Label>
                <Input
                  id="fnote"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('dashboard.logistique.fichier.editNotePlaceholder')}
                />
              </div>
            </div>
          </div>

          {/* Voyages */}
          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardHeader className="text-base font-semibold text-primary p-0">
                {t('dashboard.logistique.fichier.voyagesCardTitle', { count: rows.length })}
              </CardHeader>
              <Button type="button" size="sm" variant="outline" onClick={addRow}>
                <Plus className="mr-2 h-4 w-4 rtl:rotate-180" />
                {t('dashboard.logistique.fichier.voyagesAddBtn')}
              </Button>
            </div>

            <div className="space-y-4">
              {rows.map((r, i) => (
                <VoyageRowCard
                  key={r.id}
                  index={i}
                  row={r}
                  clients={clients}
                  onChange={(field, value) => updateRow(r.id, field, value)}
                  onNtcsChange={(ntcs) =>
                    setRows((prev) =>
                      prev.map((row) =>
                        row.id === r.id ? { ...row, ntcs } : row
                      )
                    )
                  }
                  onPickClient={(clientId) => pickClient(r.id, clientId)}
                  onRemove={() => removeRow(r.id)}
                  canRemove={rows.length > 1}
                />
              ))}
            </div>
          </div>

          {/* Footer actions */}
          <div className="rounded-lg bg-background border p-3 shadow-sm flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {t(
                'dashboard.logistique.fichier.totalVoyagesLabel',
                'Total voyages :'
              )}{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {totalVoyages}
              </span>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button
                variant="outline"
                asChild
                type="button"
                className="w-full sm:w-auto"
              >
                <Link href="/dashboard/logistique/fichiers">{t('actions.cancel')}</Link>
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                <Save className="mr-2 h-4 w-4" />
                {submitting ? t('dashboard.logistique.fichier.creating') : t('dashboard.logistique.fichier.createBtn')}
              </Button>
            </div>
          </div>
        </form>
      </PageContent>
    </DashboardLayout>
  );
}

interface VoyageRowCardProps {
  index: number;
  row: VoyageRow;
  clients: ILogistiqueClient[];
  onChange: (
    field: Exclude<keyof VoyageRow, 'id' | 'ntcs'>,
    value: string
  ) => void;
  /** Mutation du tableau `ntcs` (un BL = 1+ NTC). */
  onNtcsChange: (ntcs: string[]) => void;
  onPickClient: (clientId: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function VoyageRowCard({
  index,
  row,
  clients,
  onChange,
  onNtcsChange,
  onPickClient,
  onRemove,
  canRemove,
}: VoyageRowCardProps) {
  const { t } = useTranslation();
  const selectedClient = clients.find((c) => c._id === row.clientId);
  const ntcCount = (row.ntcs || []).filter((n) => n.trim()).length;
  return (
    <div className="rounded-md border bg-muted/30 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          {t('dashboard.logistique.fichier.voyageRowTitle', { index: index + 1 })}
          {ntcCount > 1 && (
            <span className="ms-2 text-xs font-normal text-muted-foreground">
              {t(
                'dashboard.logistique.fichier.voyageNtcExplodeHint',
                '→ {{count}} voyages seront créés (1 par NTC)',
                { count: ntcCount }
              )}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={t('dashboard.logistique.fichier.voyageRemoveAria')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`date-${row.id}`}>{t('dashboard.logistique.fichier.voyageDate')}</Label>
          <Input
            id={`date-${row.id}`}
            type="date"
            value={row.date}
            onChange={(e) => onChange('date', e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor={`client-${row.id}`}>
            {t('dashboard.logistique.fichier.voyageClient')}
          </Label>
          <Select
            value={row.clientId || undefined}
            onValueChange={(v) => onPickClient(v)}
          >
            <SelectTrigger id={`client-${row.id}`}>
              <SelectValue
                placeholder={t(
                  'dashboard.logistique.fichier.voyageClientSelectPlaceholder',
                  'Sélectionner un client logistique…'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.nom}
                  {c.societe ? ` — ${c.societe}` : ''}
                  {c.numero ? ` (${c.numero})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Saisie libre en complément/fallback (édition manuelle si client non en base). */}
          <Input
            value={row.client}
            onChange={(e) => onChange('client', e.target.value)}
            placeholder={t('dashboard.logistique.fichier.voyageClientPlaceholder')}
            className="mt-1.5"
          />
          {selectedClient && (
            <div className="mt-1.5 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {selectedClient.nom}
              </span>
              {selectedClient.societe && ` · ${selectedClient.societe}`}
              {selectedClient.numero && ` · ${selectedClient.numero}`}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`bl-${row.id}`}>{t('dashboard.logistique.fichier.voyageBl')}</Label>
          <Input
            id={`bl-${row.id}`}
            value={row.bl}
            onChange={(e) => onChange('bl', e.target.value.toUpperCase())}
            placeholder={t('dashboard.logistique.fichier.voyageBlPlaceholder')}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <div className="flex items-center justify-between">
            <Label>{t('dashboard.logistique.fichier.voyageNtc')}</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onNtcsChange([...(row.ntcs || []), ''])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('dashboard.logistique.fichier.addNtcBtn', 'Ajouter NTC')}
            </Button>
          </div>
          <div className="space-y-1.5">
            {(row.ntcs.length > 0 ? row.ntcs : ['']).map((n, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <Input
                  value={n}
                  onChange={(e) => {
                    const next = [...row.ntcs];
                    next[idx] = e.target.value.toUpperCase();
                    onNtcsChange(next);
                  }}
                  placeholder={t('dashboard.logistique.fichier.voyageNtcPlaceholder')}
                  className="flex-1"
                />
                {row.ntcs.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0 text-destructive"
                    onClick={() => {
                      const next = row.ntcs.filter((_, i) => i !== idx);
                      onNtcsChange(next.length ? next : ['']);
                    }}
                    aria-label={t(
                      'dashboard.logistique.fichier.removeNtcAria',
                      'Supprimer NTC'
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`tel-${row.id}`}>{t('dashboard.logistique.fichier.voyageTel')}</Label>
          <Input
            id={`tel-${row.id}`}
            value={row.telephone}
            onChange={(e) => onChange('telephone', e.target.value)}
            placeholder={t('dashboard.logistique.fichier.voyageTelPlaceholder')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`soc-${row.id}`}>{t('dashboard.logistique.fichier.voyageSociete')}</Label>
          <Input
            id={`soc-${row.id}`}
            value={row.societe}
            onChange={(e) => onChange('societe', e.target.value)}
            placeholder={t('dashboard.logistique.fichier.voyageSocietePlaceholder')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`tp-${row.id}`}>{t('dashboard.logistique.fichier.voyageTp')}</Label>
          <Input
            id={`tp-${row.id}`}
            value={row.tp}
            onChange={(e) => onChange('tp', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`mag-${row.id}`}>{t('dashboard.logistique.fichier.voyageMagasinage')}</Label>
          <Input
            id={`mag-${row.id}`}
            type="date"
            value={row.magasinage}
            onChange={(e) => onChange('magasinage', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`sur-${row.id}`}>{t('dashboard.logistique.fichier.voyageSurestaries')}</Label>
          <Input
            id={`sur-${row.id}`}
            type="date"
            value={row.surestaries}
            onChange={(e) => onChange('surestaries', e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor={`note-${row.id}`}>{t('dashboard.logistique.fichier.voyageNote')}</Label>
          <Textarea
            id={`note-${row.id}`}
            value={row.note}
            onChange={(e) => onChange('note', e.target.value)}
            rows={2}
            placeholder={t('dashboard.logistique.fichier.voyageNotePlaceholder')}
          />
        </div>
      </div>
    </div>
  );
}
