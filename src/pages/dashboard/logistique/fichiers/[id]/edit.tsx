import { FormEvent, useEffect, useState, useCallback } from 'react';
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
import {
  UserRole,
  VoyageStatus,
  type IVoyage,
  type IFichierLogistique,
} from '@/types';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';

interface VoyageRow {
  id: string;
  date: string;
  client: string;
  bl: string;
  ntc: string;
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
    bl: '',
    ntc: '',
    telephone: '',
    societe: '',
    tp: '',
    magasinage: '',
    surestaries: '',
    note: '',
  };
}

function voyageToRow(v: IVoyage): VoyageRow {
  return {
    id: String(v._id),
    date: v.date ? new Date(v.date).toISOString().slice(0, 10) : '',
    client: v.clientSource || '',
    bl: v.bl || '',
    ntc: v.ntc || '',
    telephone: v.telephone || '',
    societe: v.societe || '',
    tp: v.tp || '',
    magasinage: v.magasinage
      ? new Date(v.magasinage).toISOString().slice(0, 10)
      : '',
    surestaries: v.surestaries
      ? new Date(v.surestaries).toISOString().slice(0, 10)
      : '',
    note: v.note || '',
  };
}

export default function EditFichierLogistique() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const id = String(router.query.id || '');
  const isAllowed =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_LOGISTIQUE ||
    user?.role === UserRole.AGENT_RECEPTION_LOGISTIQUE;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [reference, setReference] = useState<string>('');

  const todayIso = () => new Date().toISOString().slice(0, 10);
  const [fichierDate, setFichierDate] = useState<string>(todayIso());
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<VoyageRow[]>([]);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/logistique/fichiers/${id}`, {
        credentials: 'include',
      }).then((x) => x.json());
      if (!r.success) {
        setError(r.error || t('dashboard.logistique.fichier.loadFailed'));
        return;
      }
      const fichier = r.data.fichier as IFichierLogistique;
      const voyages = (r.data.voyages || []) as IVoyage[];

      const isEngaged = voyages.some(
        (v) =>
          v.chauffeurId || (v.statutVoyage && v.statutVoyage !== VoyageStatus.CREE)
      );
      if (isEngaged) {
        setLocked(true);
        setError(
          t('dashboard.logistique.fichier.engagedLockedAlert')
        );
      }

      setReference(fichier.reference);
      setFichierDate(
        fichier.date
          ? new Date(fichier.date).toISOString().slice(0, 10)
          : todayIso()
      );
      setNote(fichier.note || '');
      setRows(
        voyages.length > 0
          ? voyages.map(voyageToRow)
          : [emptyRow(todayIso())]
      );
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isAllowed && id) void load();
  }, [isAllowed, id, load]);

  const updateRow = (rowId: string, field: keyof VoyageRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(fichierDate)]);
  };

  const removeRow = (rowId: string) => {
    setRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r.id !== rowId) : prev
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (locked) return;
    if (!fichierDate) return setError(t('dashboard.logistique.fichier.errDateRequired'));
    if (rows.length === 0) return setError(t('dashboard.logistique.fichier.errAddVoyage'));

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.client.trim() && !r.bl.trim() && !r.ntc.trim()) {
        return setError(
          t('dashboard.logistique.fichier.errVoyageMissingFields', { index: i + 1 })
        );
      }
    }

    setSubmitting(true);
    try {
      const body = {
        date: new Date(fichierDate).toISOString(),
        note: note.trim() || undefined,
        voyages: rows.map((r) => ({
          date: r.date ? new Date(r.date).toISOString() : undefined,
          client: r.client.trim() || undefined,
          bl: r.bl.trim() || undefined,
          ntc: r.ntc.trim() || undefined,
          telephone: r.telephone.trim() || undefined,
          societe: r.societe.trim() || undefined,
          tp: r.tp.trim() || undefined,
          magasinage: r.magasinage ? new Date(r.magasinage).toISOString() : null,
          surestaries: r.surestaries ? new Date(r.surestaries).toISOString() : null,
          note: r.note.trim() || undefined,
          // prixTransport / commissionChauffeur sont saisis par le user TRANSIT
          // au moment de la validation — backend applique défaut sinon.
        })),
      };
      const res = await fetch(`/api/logistique/fichiers/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.success) {
        void router.push(`/dashboard/logistique/fichiers/${id}`);
      } else {
        setError(d.error || t('dashboard.logistique.fichier.errUpdate'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.fichiers.editTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.logistique.fichier.editTitle', { reference: reference || t('dashboard.logistique.fichier.editTitleFallback') })}
        subtitle={t('dashboard.fichiers.editSubtitle')}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/logistique/fichiers/${id}`}>
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
                  disabled={locked}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fnote">{t('dashboard.logistique.fichier.fieldNote')}</Label>
                <Input
                  id="fnote"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('dashboard.logistique.fichier.editNotePlaceholder')}
                  disabled={locked}
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
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addRow}
                disabled={locked}
              >
                <Plus className="mr-2 h-4 w-4 rtl:rotate-180 rtl:mr-0 rtl:ml-2" />
                {t('dashboard.logistique.fichier.voyagesAddBtn')}
              </Button>
            </div>

            <div className="space-y-4">
              {rows.map((r, i) => (
                <VoyageRowCard
                  key={r.id}
                  index={i}
                  row={r}
                  locked={locked}
                  onChange={(field, value) => updateRow(r.id, field, value)}
                  onRemove={() => removeRow(r.id)}
                  canRemove={rows.length > 1 && !locked}
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-background border p-3 shadow-sm flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {t(
                'dashboard.logistique.fichier.totalVoyagesLabel',
                'Total voyages :'
              )}{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {rows.length}
              </span>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button
                variant="outline"
                asChild
                type="button"
                className="w-full sm:w-auto"
              >
                <Link href={`/dashboard/logistique/fichiers/${id}`}>
                  {t('actions.cancel')}
                </Link>
              </Button>
              <Button
                type="submit"
                disabled={submitting || locked}
                className="w-full sm:w-auto"
              >
                <Save className="mr-2 h-4 w-4" />
                {submitting ? t('dashboard.logistique.fichier.saving') : t('dashboard.logistique.fichier.saveBtn')}
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
  locked: boolean;
  onChange: (field: keyof VoyageRow, value: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function VoyageRowCard({
  index,
  row,
  locked,
  onChange,
  onRemove,
  canRemove,
}: VoyageRowCardProps) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border bg-muted/30 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{t('dashboard.logistique.fichier.voyageRowTitle', { index: index + 1 })}</div>
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
            disabled={locked}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`client-${row.id}`}>{t('dashboard.logistique.fichier.voyageClient')}</Label>
          <Input
            id={`client-${row.id}`}
            value={row.client}
            onChange={(e) => onChange('client', e.target.value)}
            placeholder={t('dashboard.logistique.fichier.voyageClientPlaceholder')}
            disabled={locked}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`bl-${row.id}`}>{t('dashboard.logistique.fichier.voyageBl')}</Label>
          <Input
            id={`bl-${row.id}`}
            value={row.bl}
            onChange={(e) => onChange('bl', e.target.value.toUpperCase())}
            placeholder={t('dashboard.logistique.fichier.voyageBlPlaceholder')}
            disabled={locked}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`ntc-${row.id}`}>{t('dashboard.logistique.fichier.voyageNtc')}</Label>
          <Input
            id={`ntc-${row.id}`}
            value={row.ntc}
            onChange={(e) => onChange('ntc', e.target.value.toUpperCase())}
            placeholder={t('dashboard.logistique.fichier.voyageNtcPlaceholder')}
            disabled={locked}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`tel-${row.id}`}>{t('dashboard.logistique.fichier.voyageTel')}</Label>
          <Input
            id={`tel-${row.id}`}
            value={row.telephone}
            onChange={(e) => onChange('telephone', e.target.value)}
            placeholder={t('dashboard.logistique.fichier.voyageTelPlaceholder')}
            disabled={locked}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`soc-${row.id}`}>{t('dashboard.logistique.fichier.voyageSociete')}</Label>
          <Input
            id={`soc-${row.id}`}
            value={row.societe}
            onChange={(e) => onChange('societe', e.target.value)}
            placeholder={t('dashboard.logistique.fichier.voyageSocietePlaceholder')}
            disabled={locked}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`tp-${row.id}`}>{t('dashboard.logistique.fichier.voyageTp')}</Label>
          <Input
            id={`tp-${row.id}`}
            value={row.tp}
            onChange={(e) => onChange('tp', e.target.value)}
            disabled={locked}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`mag-${row.id}`}>{t('dashboard.logistique.fichier.voyageMagasinage')}</Label>
          <Input
            id={`mag-${row.id}`}
            type="date"
            value={row.magasinage}
            onChange={(e) => onChange('magasinage', e.target.value)}
            disabled={locked}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`sur-${row.id}`}>{t('dashboard.logistique.fichier.voyageSurestaries')}</Label>
          <Input
            id={`sur-${row.id}`}
            type="date"
            value={row.surestaries}
            onChange={(e) => onChange('surestaries', e.target.value)}
            disabled={locked}
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
            disabled={locked}
          />
        </div>
        {/* Prix transport & Commission : saisis par le user TRANSIT lors de
            la validation du fichier — non affichés à l'agent réception. */}
      </div>
    </div>
  );
}
