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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { CompteType, UserRole } from '@/types';
import {
  Banknote,
  Building2,
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

export default function MouvementGeneralView({
  endpoint,
  allowedRoles,
  titleKey,
  subtitleKey,
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
            <span className="hidden sm:inline">
              {t('actions.refresh')}
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
