import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FichiersDataTable } from '@/components/dashboard/logistique/fichiers/data-table';
import type { FichierRow } from '@/components/dashboard/logistique/fichiers/columns';
import { UserRole } from '@/types';
import { Plus, RefreshCcw, Trash2, CheckCircle2 } from 'lucide-react';

export default function FichiersLogistiqueList() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_LOGISTIQUE ||
    user?.role === UserRole.AGENT_RECEPTION_LOGISTIQUE ||
    user?.role === UserRole.AGENT_TRANSIT ||
    user?.role === UserRole.COMPTABLE;
  const canMutate =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_LOGISTIQUE ||
    user?.role === UserRole.AGENT_RECEPTION_LOGISTIQUE;

  const [rows, setRows] = useState<FichierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [confirmRow, setConfirmRow] = useState<FichierRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Soumission du fichier à validation transit (agent réception logistique).
  const [soumettreRow, setSoumettreRow] = useState<FichierRow | null>(null);
  const [submittingValidation, setSubmittingValidation] = useState(false);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/logistique/fichiers', {
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) setRows(r.data || []);
      else setError(r.error || t('common.error'));
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

  const submitDelete = async () => {
    if (!confirmRow) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const r = await fetch(`/api/logistique/fichiers/${confirmRow._id}`, {
        method: 'DELETE',
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) {
        setSuccess(t('dashboard.logistique.list.deleteSuccess', { reference: confirmRow.reference }));
        setConfirmRow(null);
        void reload();
      } else {
        setDeleteError(r.error || t('dashboard.logistique.list.deleteFailed'));
      }
    } catch {
      setDeleteError(t('common.errorNetwork'));
    } finally {
      setDeleting(false);
    }
  };

  /** Soumet un fichier à validation transit (statut OUVERT → PRET_VALIDATION). */
  const submitSoumission = async () => {
    if (!soumettreRow) return;
    setSubmittingValidation(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/logistique/fichiers/${soumettreRow._id}/soumettre`,
        {
          method: 'POST',
          credentials: 'include',
        }
      ).then((x) => x.json());
      if (r.success) {
        setSuccess(
          t('dashboard.logistique.list.soumettreSuccess', {
            reference: soumettreRow.reference,
          })
        );
        setSoumettreRow(null);
        void reload();
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmittingValidation(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.fichiers.title')} />
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
        title={t('dashboard.fichiers.title')}
        subtitle={t('dashboard.fichiers.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reload()}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <RefreshCcw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('dashboard.logistique.actions.refresh')}</span>
            </Button>
            {canMutate && (
              <Button asChild className={isMobile ? 'h-10 px-3' : ''}>
                <Link href="/dashboard/logistique/fichiers/create">
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('dashboard.fichiers.newTitle')}</span>
                  <span className="sm:hidden">{t('dashboard.logistique.list.newShort')}</span>
                </Link>
              </Button>
            )}
          </div>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-3 max-w-7xl mx-auto rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
          <CardHeader className="text-base font-semibold text-primary p-0">
            {t('dashboard.logistique.list.title', { count: rows.length })}
          </CardHeader>
          <FichiersDataTable
            data={rows}
            readOnly={!canMutate}
            onDelete={canMutate ? (row) => setConfirmRow(row) : undefined}
            onSoumettre={canMutate ? (row) => setSoumettreRow(row) : undefined}
            emptyMessage={t('dashboard.logistique.list.emptyMessage')}
          />
        </div>

        <Dialog
          open={!!confirmRow}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmRow(null);
              setDeleteError(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('dashboard.fichiers.deleteDialog')}</DialogTitle>
              <DialogDescription>
                {t('dashboard.logistique.list.deleteDialogDescription', { reference: confirmRow?.reference || '' })}
              </DialogDescription>
            </DialogHeader>
            {deleteError && (
              <Alert variant="destructive">
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmRow(null)}
                disabled={deleting}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void submitDelete()}
                disabled={deleting}
                className="w-full sm:w-auto"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deleting ? t('dashboard.logistique.list.deleting') : t('actions.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmation : soumission à validation transit */}
        <Dialog
          open={!!soumettreRow}
          onOpenChange={(open) => {
            if (!open) setSoumettreRow(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t('dashboard.logistique.list.soumettreDialogTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('dashboard.logistique.list.soumettreDialogDescription', {
                  reference: soumettreRow?.reference || '',
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setSoumettreRow(null)}
                disabled={submittingValidation}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                onClick={submitSoumission}
                disabled={submittingValidation}
                className="w-full sm:w-auto"
              >
                {submittingValidation
                  ? t('actions.loading')
                  : t('dashboard.logistique.actions.soumettre')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContent>
    </DashboardLayout>
  );
}
