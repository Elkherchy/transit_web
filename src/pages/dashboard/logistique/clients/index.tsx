import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';


import {
  PageContent,
  PageHeader,
  PageSkeleton,
  EmptyState,
  ResponsiveTableArea,
  MobileEntityCard,
  SearchInput,
} from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DataTable,
  type DataTableColumnMeta,
} from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
import { ILogistiqueClient, UserRole } from '@/types';
import {
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  UserRound,
} from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

const ALLOWED: UserRole[] = [
  UserRole.ADMIN,
  UserRole.ADMIN_LOGISTIQUE,
  UserRole.AGENT_RECEPTION_LOGISTIQUE,
];

interface FormState {
  nom: string;
  numero: string;
  societe: string;
}

const EMPTY_FORM: FormState = {
  nom: '',
  numero: '',
  societe: '',
};

export default function LogistiqueClientsPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = session?.user;
  const isAllowed = !!user?.role && ALLOWED.includes(user.role as UserRole);

  const [rows, setRows] = useState<ILogistiqueClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ILogistiqueClient | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ILogistiqueClient | null>(
    null
  );

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      const r = await fetch(
        `/api/logistique/customers${params.toString() ? `?${params.toString()}` : ''}`,
        { credentials: 'include' }
      );
      const data = await r.json();
      if (data.success) {
        setRows((data.data || []) as ILogistiqueClient[]);
      } else {
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [search, t]);

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

  const openNewDialog = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (c: ILogistiqueClient) => {
    setEditing(c);
    setForm({
      nom: c.nom,
      numero: c.numero || '',
      societe: c.societe || '',
    });
    setError(null);
    setDialogOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.nom.trim()) {
      setError(t('dashboard.logistiqueClients.errNomRequis'));
      return;
    }
    setSubmitting(true);
    try {
      const url = editing
        ? `/api/logistique/customers/${editing._id}`
        : '/api/logistique/customers';
      const method = editing ? 'PATCH' : 'POST';
      const r = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (data.success) {
        setSuccess(
          editing
            ? t('dashboard.logistiqueClients.successUpdate')
            : t('dashboard.logistiqueClients.successCreate')
        );
        setDialogOpen(false);
        void reload();
      } else {
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/logistique/customers/${deleteTarget._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await r.json();
      if (data.success) {
        setSuccess(t('dashboard.logistiqueClients.deactivated'));
        setDeleteTarget(null);
        void reload();
      } else {
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDef<ILogistiqueClient>[]>(
    () => [
      {
        id: 'nom',
        header: t('dashboard.logistiqueClients.fields.nom'),
        cell: ({ row }) => <span className="font-medium">{row.original.nom}</span>,
      },
      {
        id: 'numero',
        header: t('dashboard.logistiqueClients.fields.numero'),
        cell: ({ row }) => row.original.numero || '—',
      },
      {
        id: 'societe',
        header: t('dashboard.logistiqueClients.fields.societe'),
        cell: ({ row }) => row.original.societe || '—',
      },
      {
        id: 'actif',
        header: t('dashboard.logistiqueClients.fields.actif'),
        cell: ({ row }) =>
          row.original.actif ? (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              {t('common.yes')}
            </Badge>
          ) : (
            <Badge variant="secondary">{t('common.no')}</Badge>
          ),
      },
      {
        id: 'actions',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: '',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
                <Pencil className="mr-2 h-4 w-4 rtl:rotate-180" />
                {t('actions.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeleteTarget(row.original)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('dashboard.logistiqueClients.deleteSubmit')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [t]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.logistiqueClients.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.logistiqueClients.title')}
        subtitle={t('dashboard.logistiqueClients.subtitle')}
        actions={
          <Button onClick={openNewDialog} className={isMobile ? 'h-10 px-3' : ''}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {t('dashboard.logistiqueClients.newBtn')}
            </span>
            <span className="sm:hidden">
              {t('dashboard.logistiqueClients.newShort')}
            </span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="mb-4">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <SearchInput
              placeholder={t('dashboard.logistiqueClients.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:max-w-md"
            />
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {rows.length === 0 ? (
              <EmptyState
                icon={<UserRound className="h-8 w-8" />}
                title={t('dashboard.logistiqueClients.empty')}
              />
            ) : (
              <ResponsiveTableArea
                table={<DataTable columns={columns} data={rows} />}
                mobileList={
                  <div className="space-y-3">
                    {rows.map((c) => (
                      <MobileEntityCard
                        key={c._id}
                        title={c.nom}
                        subtitle={c.societe || c.numero || '—'}
                        fields={[
                          {
                            label: t('dashboard.logistiqueClients.fields.numero'),
                            value: c.numero || '—',
                          },
                          {
                            label: t('dashboard.logistiqueClients.fields.societe'),
                            value: c.societe || '—',
                          },
                        ]}
                        actions={
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(c)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setDeleteTarget(c)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        }
                      />
                    ))}
                  </div>
                }
              />
            )}
          </CardContent>
        </Card>
      </PageContent>

      {/* Dialog création / édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('dashboard.logistiqueClients.editTitle')
                : t('dashboard.logistiqueClients.newDialog')}
            </DialogTitle>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="nom">
                {t('dashboard.logistiqueClients.fields.nom')} *
              </Label>
              <Input
                id="nom"
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="numero">
                {t('dashboard.logistiqueClients.fields.numero')}
              </Label>
              <Input
                id="numero"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="societe">
                {t('dashboard.logistiqueClients.fields.societe')}
              </Label>
              <Input
                id="societe"
                value={form.societe}
                onChange={(e) => setForm({ ...form, societe: e.target.value })}
              />
            </div>

            <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setDialogOpen(false)}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {submitting ? t('actions.loading') : t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('dashboard.logistiqueClients.deleteDialog')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.logistiqueClients.deleteHint')}
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              {t('dashboard.logistiqueClients.deleteSubmit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
