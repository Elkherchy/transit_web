import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ROLE_LABELS,
} from '@/components/dashboard/utilisateurs/columns';
import { 
  PageHeader, 
  PageContent, 
  EmptyState,
  PageSkeleton,
  MobileEntityCard,
  ResponsiveTableArea,
} from '@/components/ui';
import {
  SearchInput,
  StatusBadge,
  MobilePagination,
} from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ADMIN_TRANSIT_CREATABLE_ROLES,
  CaisseKind,
  CaisseType,
  ICaisseListItem,
  IUserResponse,
  UserRole,
} from '@/types';
import { Plus, Eye, Pencil, Trash2, User, MoreHorizontal, MinusCircle } from 'lucide-react';

import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

export default function UtilisateursPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const user = session?.user;
  // Admin scopés inclus dans la garde "isAdmin" — la portée des actions
  // est restreinte côté API.
  const isAdmin =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT;
  const isMobile = useIsMobile();

  // Liste des rôles que l'admin courant peut créer/éditer (mirroir de
  // /api/users → creatableRolesFor).
  const creatableRoles = useMemo<readonly UserRole[]>(() => {
    if (user?.role === UserRole.ADMIN) return Object.values(UserRole);
    if (user?.role === UserRole.ADMIN_TRANSIT) return ADMIN_TRANSIT_CREATABLE_ROLES;
    return [];
  }, [user?.role]);

  const [rows, setRows] = useState<IUserResponse[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IUserResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IUserResponse | null>(null);

  // Debit dialog state
  const [debitTarget, setDebitTarget] = useState<IUserResponse | null>(null);
  const [debitMontant, setDebitMontant] = useState('');
  const [debitDescription, setDebitDescription] = useState('');
  const [debitError, setDebitError] = useState<string | null>(null);
  const [submittingDebit, setSubmittingDebit] = useState(false);

  const [formNom, setFormNom] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>(UserRole.AGENT_TRANSIT);
  // Réaligne le rôle par défaut sur le périmètre du créateur quand on
  // ouvre une création (sinon l'admin verrait un rôle hors périmètre
  // pré-sélectionné).
  useEffect(() => {
    if (!editing && creatableRoles.length > 0 && !creatableRoles.includes(formRole)) {
      setFormRole(creatableRoles[0]);
    }
  }, [creatableRoles, editing, formRole]);
  const [formCaisse, setFormCaisse] = useState<CaisseType>(CaisseType.TRANSIT);
  const [formTel, setFormTel] = useState('');
  const [formActif, setFormActif] = useState(true);
  // Caisses USER (kind=USER) — utilisées pour afficher la caisse liée à chaque payeur.
  const [payeurCaisses, setPayeurCaisses] = useState<ICaisseListItem[]>([]);

  const limit = isMobile ? 5 : 15;

  useEffect(() => {
    if (status !== 'loading' && user && !isAdmin) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAdmin, router]);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search.trim()) params.set('search', search.trim());
      if (roleFilter) params.set('role', roleFilter);
      const res = await fetch(`/api/users?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('dashboard.utilisateurs.loadError'));
        setRows([]);
        return;
      }
      setRows(json.data.data);
      setTotalPages(json.data.totalPages || 1);
    } catch {
      setError(t('common.errorNetwork'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page, search, roleFilter, limit, t]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  // Charge toutes les caisses USER (une fois) → utilisées par les colonnes pour
  // afficher la caisse liée à chaque payeur dans la liste utilisateurs.
  const fetchPayeurCaisses = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/caisse/caisses?includeUser=true', {
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) return;
      const onlyUser = (json.data as ICaisseListItem[]).filter(
        (c) => c.kind === CaisseKind.USER && c.actif
      );
      setPayeurCaisses(onlyUser);
    } catch {
      /* ignore */
    }
  }, [isAdmin]);

  useEffect(() => {
    void fetchPayeurCaisses();
  }, [fetchPayeurCaisses]);

  // payeurId → caisse liée (pour affichage dans la liste).
  const payeurCaisseMap = useMemo(() => {
    const m = new Map<string, ICaisseListItem>();
    for (const c of payeurCaisses) {
      if (c.payeurId) m.set(String(c.payeurId), c);
    }
    return m;
  }, [payeurCaisses]);

  const openCreate = () => {
    setEditing(null);
    setFormNom('');
    setFormEmail('');
    setFormPassword('');
    setFormRole(UserRole.AGENT_TRANSIT);
    setFormCaisse(CaisseType.TRANSIT);
    setFormTel('');
    setFormActif(true);
    setDialogOpen(true);
    setError(null);
  };

  const openEdit = useCallback((u: IUserResponse) => {
    setEditing(u);
    setFormNom(u.nom);
    setFormEmail(u.email);
    setFormPassword('');
    setFormRole(u.role);
    setFormCaisse(u.caisse || CaisseType.TRANSIT);
    setFormTel(u.telephone || '');
    setFormActif(u.actif);
    setDialogOpen(true);
    setError(null);
  }, []);

  const requestDeleteUser = useCallback((u: IUserResponse) => {
    setError(null);
    setDeleteTarget(u);
  }, []);

  const submitForm = async () => {
    setError(null);
    if (!formNom.trim() || !formEmail.trim()) {
      setError(t('dashboard.utilisateurs.errNomEmail'));
      return;
    }
    if (!editing && !formPassword.trim()) {
      setError(t('dashboard.utilisateurs.errPasswordRequired'));
      return;
    }
    if (formRole === UserRole.COMPTABLE && !formCaisse) {
      setError(t('dashboard.utilisateurs.errCaisseRequise'));
      return;
    }

    try {
      if (editing) {
        const body: Record<string, unknown> = {
          nom: formNom.trim(),
          email: formEmail.trim(),
          role: formRole,
          telephone: formTel.trim() || undefined,
          actif: formActif,
        };
        if (formRole === UserRole.COMPTABLE) body.caisse = formCaisse;
        if (formPassword.trim()) body.password = formPassword.trim();

        const res = await fetch(`/api/users/${editing._id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.success) {
          setError(json.error || t('dashboard.utilisateurs.errMajRefusee'));
          return;
        }
      } else {
        const body: Record<string, unknown> = {
          nom: formNom.trim(),
          email: formEmail.trim(),
          password: formPassword,
          role: formRole,
          telephone: formTel.trim() || undefined,
          actif: formActif,
        };
        if (formRole === UserRole.COMPTABLE) body.caisse = formCaisse;

        const res = await fetch('/api/users', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.success) {
          setError(json.error || t('dashboard.utilisateurs.errCreationRefusee'));
          return;
        }
      }
      setDialogOpen(false);
      void fetchUsers();
    } catch {
      setError(t('common.errorNetwork'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setError(null);
    try {
      const res = await fetch(`/api/users/${deleteTarget._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('dashboard.utilisateurs.errSuppRefusee'));
        return;
      }
      setDeleteTarget(null);
      void fetchUsers();
    } catch {
      setError(t('common.errorNetwork'));
    }
  };

  const openDebit = useCallback((u: IUserResponse) => {
    setDebitTarget(u);
    setDebitMontant('');
    setDebitDescription('');
    setDebitError(null);
  }, []);

  const submitDebit = async () => {
    if (!debitTarget) return;
    const m = parseFloat(debitMontant.replace(',', '.'));
    if (!Number.isFinite(m) || m <= 0) {
      setDebitError(t('dashboard.utilisateurs.debit.errMontant'));
      return;
    }
    if (!debitDescription.trim()) {
      setDebitError(t('dashboard.utilisateurs.debit.errDescription'));
      return;
    }
    setSubmittingDebit(true);
    setDebitError(null);
    try {
      const r = await fetch(`/api/admin/payeurs/${debitTarget._id}/debit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant: m, description: debitDescription.trim() }),
      });
      const json = await r.json();
      if (json.success) {
        setDebitTarget(null);
        void fetchPayeurCaisses();
      } else {
        setDebitError(json.error || t('common.errorNetwork'));
      }
    } catch {
      setDebitError(t('common.errorNetwork'));
    } finally {
      setSubmittingDebit(false);
    }
  };

  // Render mobile cards
  const renderMobileCards = () => (
    <div className="space-y-3">
      {rows.map((userRow) => {
        const linkedCaisse =
          userRow.role === UserRole.USER_PAYEUR
            ? payeurCaisseMap.get(String(userRow._id))
            : undefined;
        const baseFields = [
          {
            label: t('dashboard.utilisateurs.fieldRole'),
            value: <Badge variant="outline">{ROLE_LABELS[userRow.role]}</Badge>,
          },
          {
            label: t('dashboard.utilisateurs.fieldStatut'),
            value: (
              <span className={userRow.actif ? 'text-green-600' : 'text-red-600'}>
                {userRow.actif ? t('dashboard.utilisateurs.actif') : t('dashboard.utilisateurs.inactif')}
              </span>
            ),
          },
          { label: t('dashboard.utilisateurs.fieldTel'), value: userRow.telephone || '—' },
        ];
        const fields =
          userRow.role === UserRole.USER_PAYEUR
            ? [
                ...baseFields,
                {
                  label: t('dashboard.utilisateurs.fieldCaisseLiee'),
                  value: linkedCaisse ? (
                    <span className="font-medium tabular-nums">
                      {linkedCaisse.nom} ·{' '}
                      {Number(linkedCaisse.solde ?? 0).toLocaleString('fr-FR', {
                        minimumFractionDigits: 2,
                      })}{' '}
                      MRU
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t('dashboard.utilisateurs.pasEncoreCreeeAlim')}
                    </span>
                  ),
                },
              ]
            : baseFields;
        return (
        <MobileEntityCard
          key={userRow._id}
          title={userRow.nom}
          subtitle={userRow.email}
          fields={fields}
          actions={
            userRow._id !== user?.id ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(userRow)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('actions.edit')}
                  </DropdownMenuItem>
                  {userRow.role === UserRole.USER_PAYEUR && (
                    <DropdownMenuItem onClick={() => openDebit(userRow)} className="text-amber-600 focus:text-amber-700">
                      <MinusCircle className="mr-2 h-4 w-4" />
                      {t('dashboard.utilisateurs.debit.btnDebit')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => requestDeleteUser(userRow)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('actions.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null
          }
        />
      );
      })}
    </div>
  );

  // Desktop table columns
  const renderDesktopTable = () => (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 font-medium">{t('dashboard.utilisateurs.colNom')}</th>
            <th className="text-left px-4 py-3 font-medium">{t('dashboard.utilisateurs.colEmail')}</th>
            <th className="text-left px-4 py-3 font-medium">{t('dashboard.utilisateurs.colRole')}</th>
            <th className="text-left px-4 py-3 font-medium">{t('dashboard.utilisateurs.colCaisse')}</th>
            <th className="text-left px-4 py-3 font-medium">{t('dashboard.utilisateurs.colTel')}</th>
            <th className="text-left px-4 py-3 font-medium">{t('dashboard.utilisateurs.colStatut')}</th>
            <th className="text-right px-4 py-3 font-medium">{t('dashboard.utilisateurs.colActions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center py-12 text-muted-foreground">
                {t('dashboard.utilisateurs.emptyTable')}
              </td>
            </tr>
          ) : (
            rows.map((userRow) => {
              const linkedCaisse =
                userRow.role === UserRole.USER_PAYEUR
                  ? payeurCaisseMap.get(String(userRow._id))
                  : undefined;
              return (
              <tr key={userRow._id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{userRow.nom}</td>
                <td className="px-4 py-3">{userRow.email}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{ROLE_LABELS[userRow.role]}</Badge>
                </td>
                <td className="px-4 py-3">
                  {userRow.role === UserRole.USER_PAYEUR ? (
                    linkedCaisse ? (
                      <span className="text-sm">
                        <span className="font-medium">{linkedCaisse.nom}</span>
                        <span className="text-muted-foreground">
                          {' · '}
                          {Number(linkedCaisse.solde ?? 0).toLocaleString('fr-FR', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          MRU
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t('dashboard.utilisateurs.pasEncoreCreee')}
                      </span>
                    )
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">{userRow.telephone || '—'}</td>
                <td className="px-4 py-3">
                  <span className={userRow.actif ? 'text-green-600' : 'text-red-600'}>
                    {userRow.actif ? t('dashboard.utilisateurs.actif') : t('dashboard.utilisateurs.inactif')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {userRow._id !== user?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(userRow)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {t('actions.edit')}
                        </DropdownMenuItem>
                        {userRow.role === UserRole.USER_PAYEUR && (
                          <DropdownMenuItem onClick={() => openDebit(userRow)} className="text-amber-600 focus:text-amber-700">
                            <MinusCircle className="mr-2 h-4 w-4" />
                            {t('dashboard.utilisateurs.debit.btnDebit')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => requestDeleteUser(userRow)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('actions.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  if (status === 'loading' || !user) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.utilisateurs.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">{t('common.redirecting')}</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.utilisateurs.title')}
        subtitle={t('dashboard.utilisateurs.subtitle')}
        actions={
          <Button onClick={openCreate} className={isMobile ? 'h-10 px-3' : ''}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('dashboard.utilisateurs.title')}</span>
          </Button>
        }
        sticky={isMobile}
      />

      <PageContent padding={isMobile ? 'sm' : 'md'}>
        {error && !dialogOpen && !deleteTarget && (
          <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card className="overflow-hidden">
          <CardHeader className="space-y-4">
            <CardTitle className="text-base sm:text-lg">{t('dashboard.utilisateurs.list')}</CardTitle>
            
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex gap-2">
                <SearchInput
                  placeholder={t('dashboard.utilisateurs.searchPlaceholder')}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSearch(searchInput.trim());
                      setPage(1);
                    }
                  }}
                  className="w-full sm:max-w-xs"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch(searchInput.trim());
                    setPage(1);
                  }}
                >
                  {t('dashboard.utilisateurs.filterBtn')}
                </Button>
              </div>
              <Select
                value={roleFilter || 'ALL'}
                onValueChange={(v) => {
                  setRoleFilter(v === 'ALL' ? '' : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder={t('dashboard.utilisateurs.rolePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('dashboard.utilisateurs.allRoles')}</SelectItem>
                  {creatableRoles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          
          <CardContent className="p-4 sm:p-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <>
                <div className="px-4 pb-4 sm:px-0">
                  {rows.length === 0 ? (
                    <EmptyState
                      icon={<User className="h-8 w-8" />}
                      title={t('dashboard.utilisateurs.emptyTitle')}
                      description={search || roleFilter
                        ? t('dashboard.utilisateurs.emptySearch')
                        : t('dashboard.utilisateurs.emptyAll')
                      }
                      action={
                        <Button onClick={openCreate}>
                          <Plus className="mr-2 h-4 w-4" />
                          {t('dashboard.utilisateurs.newUser')}
                        </Button>
                      }
                    />
                  ) : (
                    <ResponsiveTableArea
                      table={renderDesktopTable()}
                      mobileList={renderMobileCards()}
                    />
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="px-4 pb-4 sm:px-0">
                    <MobilePagination
                      currentPage={page}
                      totalPages={totalPages}
                      onPageChange={setPage}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </PageContent>

      {/* Dialog Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('dashboard.utilisateurs.modifierUser') : t('dashboard.utilisateurs.newUser')}
            </DialogTitle>
          </DialogHeader>
          {error && dialogOpen && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="nom">{t('dashboard.utilisateurs.labelNom')}</Label>
              <Input id="nom" value={formNom} onChange={(e) => setFormNom(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">{t('dashboard.utilisateurs.labelEmail')}</Label>
              <Input
                id="email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pwd">
                {editing ? t('dashboard.utilisateurs.labelMdpNew') : t('dashboard.utilisateurs.labelMdp')}
              </Label>
              <Input
                id="pwd"
                type="password"
                autoComplete="new-password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('dashboard.utilisateurs.fieldRole')}</Label>
              <Select
                value={formRole}
                onValueChange={(v) => setFormRole(v as UserRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {creatableRoles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formRole === UserRole.COMPTABLE && (
              <div className="grid gap-2">
                <Label>{t('dashboard.utilisateurs.labelCaisse')}</Label>
                <Select
                  value={formCaisse}
                  onValueChange={(v) => setFormCaisse(v as CaisseType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CaisseType.TRANSIT}>{t('dashboard.utilisateurs.caisseTransit')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {formRole === UserRole.CAISSIER && (
              <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('dashboard.utilisateurs.fieldCaisseLiee')}
                </Label>
                <p
                  className="text-sm text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: t('dashboard.utilisateurs.labelCaisseGenerale') }}
                />
              </div>
            )}
            {formRole === UserRole.USER_PAYEUR && (() => {
              const linkedCaisse = editing
                ? payeurCaisseMap.get(String(editing._id))
                : undefined;
              return (
                <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t('dashboard.utilisateurs.fieldCaisseLiee')}
                  </Label>
                  {linkedCaisse ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{linkedCaisse.nom}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {Number(linkedCaisse.solde ?? 0).toLocaleString('fr-FR', {
                          minimumFractionDigits: 2,
                        })}{' '}
                        MRU
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t('dashboard.utilisateurs.pasEncoreCreeeFull')}
                    </p>
                  )}
                </div>
              );
            })()}
            <div className="grid gap-2">
              <Label htmlFor="tel">{t('dashboard.utilisateurs.labelTelOpt')}</Label>
              <Input id="tel" value={formTel} onChange={(e) => setFormTel(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="actif"
                className="rounded border-input"
                checked={formActif}
                onChange={(e) => setFormActif(e.target.checked)}
              />
              <Label htmlFor="actif" className="font-normal cursor-pointer">
                {t('dashboard.utilisateurs.compteActif')}
              </Label>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => void submitForm()} className="w-full sm:w-auto">
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Delete */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboard.utilisateurs.deleteConfirm')}</DialogTitle>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            {deleteTarget
              ? t('dashboard.utilisateurs.deleteWarning', { email: deleteTarget.email })
              : ''}
          </p>
          <DialogFooter className="flex-col sm:flex-row gap-2 p-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="w-full sm:w-auto">
              {t('actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} className="w-full sm:w-auto">
              {t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Debit dialog */}
      <Dialog open={!!debitTarget} onOpenChange={(o) => !o && setDebitTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MinusCircle className="h-4 w-4 text-amber-600" />
              {t('dashboard.utilisateurs.debit.title')}
            </DialogTitle>
          </DialogHeader>
          {debitTarget && (
            <p className="text-sm text-muted-foreground -mt-1">
              {debitTarget.nom}
              {(() => {
                const c = payeurCaisseMap.get(String(debitTarget._id));
                return c ? (
                  <span className="ml-2 font-semibold tabular-nums text-foreground">
                    {Number(c.solde ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MRU
                  </span>
                ) : null;
              })()}
            </p>
          )}
          <div className="space-y-3 py-1">
            {debitError && (
              <Alert variant="destructive">
                <AlertDescription>{debitError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="debitM">{t('dashboard.utilisateurs.debit.labelMontant')}</Label>
              <Input
                id="debitM"
                type="number"
                step="0.01"
                min="0.01"
                value={debitMontant}
                onChange={(e) => setDebitMontant(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debitDesc">{t('dashboard.utilisateurs.debit.labelDescription')}</Label>
              <Input
                id="debitDesc"
                value={debitDescription}
                onChange={(e) => setDebitDescription(e.target.value)}
                placeholder={t('dashboard.utilisateurs.debit.descPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDebitTarget(null)} disabled={submittingDebit}>
              {t('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitDebit()}
              disabled={submittingDebit}
            >
              {submittingDebit ? '…' : t('dashboard.utilisateurs.debit.btnConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
