import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  PageContent,
  PageHeader,
  PageSkeleton,
} from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { CompteType, UserRole } from '@/types';
import {
  Banknote,
  Building2,
  Download,
  Loader2,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';

interface ComptePayload {
  _id: string;
  nom: string;
  type: CompteType;
  solde: number;
}

interface MouvementPayload {
  periodeDebut: string;
  periodeFin: string;
  solde: number;
  charges: number;
  benefices: number;
  interetBL: number;
  creditClient: number;
  comptes: ComptePayload[];
}

interface Props {
  endpoint: string;
  allowedRoles: UserRole[];
  titleKey: string;
  subtitleKey: string;
  /** Endpoint renvoyant { operations: [...] } pour l'export CSV. Optionnel. */
  exportEndpoint?: string;
}

interface OperationRow {
  date: string;
  compteNom: string;
  compteType: string;
  type: string;
  montant: number;
  description: string;
  reference: string;
}

interface ExportUser {
  _id: string;
  nom: string;
  role: UserRole;
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

function startOfMonthISO(): string {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)
  )
    .toISOString()
    .slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default function MouvementGeneralView({
  endpoint,
  allowedRoles,
  titleKey,
  subtitleKey,
  exportEndpoint,
}: Props) {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = session?.user;
  const isAllowed = !!user?.role && allowedRoles.includes(user.role as UserRole);

  const [data, setData] = useState<MouvementPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateDebut, setDateDebut] = useState<string>(startOfMonthISO());
  const [dateFin, setDateFin] = useState<string>(todayISO());
  const [exporting, setExporting] = useState(false);
  // Périmètre d'export : 'societe' (défaut) ou l'_id d'un payeur/caissier.
  const [exportScope, setExportScope] = useState<string>('societe');
  const [exportUsers, setExportUsers] = useState<ExportUser[]>([]);

  useEffect(() => {
    if (!exportEndpoint || !isAllowed) return;
    fetch('/api/users?limit=500', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) return;
        const list = (j.data?.data || []) as ExportUser[];
        setExportUsers(
          list.filter(
            (u) =>
              u.role === UserRole.USER_PAYEUR || u.role === UserRole.CAISSIER
          )
        );
      })
      .catch(() => {
        /* liste facultative — l'export société reste disponible */
      });
  }, [exportEndpoint, isAllowed]);

  const exportOperations = useCallback(async () => {
    if (!exportEndpoint || exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (dateDebut) params.set('dateDebut', new Date(dateDebut).toISOString());
      if (dateFin) {
        const end = new Date(dateFin);
        end.setUTCHours(23, 59, 59, 999);
        params.set('dateFin', end.toISOString());
      }
      if (exportScope && exportScope !== 'societe') {
        params.set('userId', exportScope);
      }
      const url = `${exportEndpoint}${params.toString() ? `?${params}` : ''}`;
      const r = await fetch(url, { credentials: 'include' });
      const json = await r.json();
      if (!json.success) {
        setError(json.error || t('common.error'));
        return;
      }
      const ops = (json.data?.operations || []) as OperationRow[];
      const scopeLabel = String(json.data?.scopeLabel || 'transit');
      const header = [
        'Date',
        'Compte',
        'Type compte',
        'Sens',
        'Débit',
        'Crédit',
        'Description',
        'Référence',
      ];
      const lines = [header];
      for (const o of ops) {
        const d = new Date(o.date);
        const pad = (n: number) => String(n).padStart(2, '0');
        const dateStr = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
        const isCr = o.type === 'CREDIT';
        lines.push([
          dateStr,
          o.compteNom,
          o.compteType,
          isCr ? 'Crédit' : 'Débit',
          isCr ? '' : o.montant.toFixed(2),
          isCr ? o.montant.toFixed(2) : '',
          o.description.replace(/[\r\n]+/g, ' '),
          o.reference,
        ]);
      }
      const csv =
        '﻿' + lines.map((row) => row.map(csvCell).join(';')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const dlUrl = URL.createObjectURL(blob);
      const slug = scopeLabel
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `operations-${slug || 'transit'}-${dateDebut || 'debut'}_${dateFin || 'fin'}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setExporting(false);
    }
  }, [exportEndpoint, exporting, dateDebut, dateFin, exportScope, t]);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    if (!isAllowed) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateDebut)
        params.set('dateDebut', new Date(dateDebut).toISOString());
      if (dateFin) {
        const end = new Date(dateFin);
        end.setUTCHours(23, 59, 59, 999);
        params.set('dateFin', end.toISOString());
      }
      const url = `${endpoint}${params.toString() ? `?${params}` : ''}`;
      const r = await fetch(url, { credentials: 'include' });
      const json = await r.json();
      if (json.success) {
        setData(json.data as MouvementPayload);
      } else {
        setError(json.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [isAllowed, endpoint, dateDebut, dateFin, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (status === 'loading' || (loading && !data)) {
    return (
      <DashboardLayout>
        <PageHeader title={t(titleKey)} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 4 : 6} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  const isPositiveProfit = (data?.interetBL ?? data?.benefices ?? 0) >= 0;

  return (
    <DashboardLayout>
      <PageHeader
        title={t(titleKey)}
        subtitle={t(subtitleKey)}
        actions={
          <Button
            variant="outline"
            onClick={() => void reload()}
            disabled={loading}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <RefreshCcw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('actions.refresh')}</span>
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

        {/* Filtre période */}
        <Card className="mb-4">
          <CardContent className="py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="dateDebut" className="text-xs">
                {t('dashboard.mouvement.periodeDebut')}
              </Label>
              <Input
                id="dateDebut"
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="dateFin" className="text-xs">
                {t('dashboard.mouvement.periodeFin')}
              </Label>
              <Input
                id="dateFin"
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => void reload()}
                disabled={loading}
                className="w-full"
              >
                {t('dashboard.mouvement.applyFilter')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Export des opérations : périmètre société ou un payeur/caissier */}
        {exportEndpoint && (
          <Card className="mb-4">
            <CardContent className="py-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="grid gap-1 flex-1 min-w-0">
                <Label className="text-xs">
                  {t('dashboard.mouvement.exportScope')}
                </Label>
                <Select value={exportScope} onValueChange={setExportScope}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="societe">
                      {t('dashboard.mouvement.exportScopeSociete')}
                    </SelectItem>
                    {exportUsers.some(
                      (u) => u.role === UserRole.USER_PAYEUR
                    ) && (
                      <SelectGroup>
                        <SelectLabel>
                          {t('dashboard.mouvement.exportGroupPayeurs')}
                        </SelectLabel>
                        {exportUsers
                          .filter((u) => u.role === UserRole.USER_PAYEUR)
                          .map((u) => (
                            <SelectItem key={u._id} value={u._id}>
                              {u.nom}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    )}
                    {exportUsers.some(
                      (u) => u.role === UserRole.CAISSIER
                    ) && (
                      <SelectGroup>
                        <SelectLabel>
                          {t('dashboard.mouvement.exportGroupCaissiers')}
                        </SelectLabel>
                        {exportUsers
                          .filter((u) => u.role === UserRole.CAISSIER)
                          .map((u) => (
                            <SelectItem key={u._id} value={u._id}>
                              {u.nom}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                onClick={() => void exportOperations()}
                disabled={exporting || loading}
                className={isMobile ? 'h-10' : ''}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
                ) : (
                  <Download className="h-4 w-4 sm:mr-2" />
                )}
                {t('dashboard.mouvement.exportOps')}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 4 KPI cards : Solde · Charges · Bénéfices · Crédit Client */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('dashboard.mouvement.solde')}
              </CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">
                {fmt(data?.solde || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('common.mru')} · {t('dashboard.mouvement.soldeHint')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('dashboard.mouvement.charges')}
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-red-700">
                {fmt(data?.charges || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('common.mru')} · {t('dashboard.mouvement.chargesHint')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('dashboard.mouvement.benefices')}
              </CardTitle>
              <TrendingUp
                className={`h-4 w-4 ${isPositiveProfit ? 'text-emerald-600' : 'text-red-600'}`}
              />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  isPositiveProfit ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {fmt(data?.interetBL ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('common.mru')} · {t('dashboard.mouvement.beneficesInteretBL')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('dashboard.mouvement.creditClient')}
              </CardTitle>
              <Users className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-amber-700">
                {fmt(data?.creditClient || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('common.mru')} · {t('dashboard.mouvement.creditClientHint')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Détail des comptes du domaine */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              {t('dashboard.mouvement.comptesDetailTitle')}
              <Badge variant="secondary" className="ml-1">
                {data?.comptes.length || 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!data || data.comptes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('dashboard.mouvement.noCompte')}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.comptes.map((c) => (
                  <div
                    key={c._id}
                    className="rounded-md border bg-card p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {c.type === CompteType.BANQUE ? (
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <Banknote className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">
                        {c.nom}
                      </span>
                    </div>
                    <span className="font-semibold tabular-nums text-sm whitespace-nowrap">
                      {fmt(c.solde)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>
    </DashboardLayout>
  );
}
