import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { UserRole, TransitStatus, type ITransit, type IFacture } from '@/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  FileText, CheckCircle2, Clock, ArrowRight, RefreshCcw, Receipt,
} from 'lucide-react';

const BLUE   = '#02389b';
const INDIGO = '#4f46e5';
const GREEN  = '#16a34a';
const AMBER  = '#d97706';
const RED    = '#dc2626';
const PURPLE = '#9333ea';

const STATUS_COLORS: Record<string, string> = {
  [TransitStatus.BROUILLON]:      '#94a3b8',
  [TransitStatus.EN_COURS]:       BLUE,
  [TransitStatus.EN_VALIDATION]:  AMBER,
  [TransitStatus.VALIDE_TRANSIT]: INDIGO,
  [TransitStatus.VALIDE]:         GREEN,
  [TransitStatus.FACTURE_EMISE]:  PURPLE,
  [TransitStatus.CLOTURE]:        '#64748b',
};

const STATUS_LABELS: Record<string, string> = {
  [TransitStatus.BROUILLON]:      'Brouillon',
  [TransitStatus.EN_COURS]:       'En cours',
  [TransitStatus.EN_VALIDATION]:  'En validation',
  [TransitStatus.VALIDE_TRANSIT]: 'Validé transit',
  [TransitStatus.VALIDE]:         'Validé',
  [TransitStatus.FACTURE_EMISE]:  'Facture émise',
  [TransitStatus.CLOTURE]:        'Clôturé',
};

const MONTH_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function getMonthKey(date: string | Date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function last6MonthKeys(): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function monthLabel(key: string) {
  const [, m] = key.split('-');
  return MONTH_SHORT[parseInt(m, 10) - 1];
}

function StatCard({
  label, value, sub, color, icon: Icon, href,
}: { label: string; value: string | number; sub?: string; color: string; icon: React.ElementType; href?: string }) {
  const inner = (
    <div
      className="flex items-start gap-3 rounded-xl border bg-white p-4 shadow-sm transition-all hover:shadow-md"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}18` }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      {href && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 mt-1" />}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.value} dossier{p.value > 1 ? 's' : ''}</p>
      ))}
    </div>
  );
};

export default function AgentTransitDashboardPage() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const [transits, setTransits] = useState<ITransit[]>([]);
  const [factures, setFactures] = useState<IFacture[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const load = async () => {
    setDataLoading(true);
    try {
      const [tRes, fRes] = await Promise.all([
        fetch('/api/transit?limit=500', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/transit/factures?limit=500', { credentials: 'include' }).then((r) => r.json()),
      ]);
      if (tRes.success) setTransits((tRes.data?.data ?? tRes.data ?? []) as ITransit[]);
      if (fRes.success) setFactures((fRes.data?.data ?? fRes.data ?? []) as IFacture[]);
    } catch { /* ignore */ }
    finally { setDataLoading(false); }
  };

  useEffect(() => {
    if (user?.role === UserRole.AGENT_TRANSIT || user?.role === UserRole.ADMIN) {
      void load();
    }
  }, [user]);

  useEffect(() => {
    if (status !== 'loading' && user && user.role !== UserRole.AGENT_TRANSIT && user.role !== UserRole.ADMIN) {
      void router.replace('/dashboard');
    }
  }, [status, user, router]);

  const months = useMemo(() => last6MonthKeys(), []);

  const monthlyBar = useMemo(() => months.map((key) => ({
    mois: monthLabel(key),
    transits: transits.filter((t) => getMonthKey(t.createdAt) === key).length,
    factures: factures.filter((f) => getMonthKey((f as { createdAt?: string | Date }).createdAt ?? new Date(0)) === key).length,
  })), [transits, factures, months]);

  const statutPie = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of transits) {
      counts[t.statut] = (counts[t.statut] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([statut, value]) => ({ name: STATUS_LABELS[statut] ?? statut, value, color: STATUS_COLORS[statut] ?? '#94a3b8' }))
      .sort((a, b) => b.value - a.value);
  }, [transits]);

  const totalTransits      = transits.length;
  const enCours            = transits.filter((t) => t.statut === TransitStatus.EN_COURS).length;
  const aValider           = transits.filter((t) => t.statut === TransitStatus.EN_VALIDATION || t.statut === TransitStatus.VALIDE_TRANSIT).length;
  const totalFactures      = factures.length;
  const recentTransits     = [...transits].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);

  if (status === 'loading' || dataLoading) {
    return (
      <DashboardLayout>
        <PageHeader title="Tableau de bord" />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (user?.role !== UserRole.AGENT_TRANSIT && user?.role !== UserRole.ADMIN) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title="Tableau de bord"
        subtitle={`Bonjour${user?.nom ? `, ${user.nom}` : ''} — vue d'ensemble de votre activité`}
        sticky={isMobile}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm hover:bg-muted/50 transition-colors"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        }
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6 max-w-7xl mx-auto">

          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total Dossiers" value={totalTransits} sub="Tous statuts" color={BLUE} icon={FileText} href="/dashboard/transit" />
            <StatCard label="En cours" value={enCours} sub="Dossiers actifs" color={INDIGO} icon={Clock} href="/dashboard/transit" />
            <StatCard label="À valider" value={aValider} sub="En attente validation" color={AMBER} icon={CheckCircle2} href="/dashboard/transit/bls/non-valides" />
            <StatCard label="Factures" value={totalFactures} sub="Total générées" color={PURPLE} icon={Receipt} href="/dashboard/factures" />
          </div>

          {/* ── Charts Row ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">

            {/* Bar Chart — activité mensuelle */}
            <div className="lg:col-span-3 rounded-xl border bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Activité mensuelle</h3>
                  <p className="text-xs text-muted-foreground">Dossiers et factures — 6 derniers mois</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: BLUE }} />Dossiers</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PURPLE }} />Factures</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyBar} barSize={14} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mois" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="transits" fill={BLUE} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="factures" fill={PURPLE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie Chart — statuts */}
            <div className="lg:col-span-2 rounded-xl border bg-white p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Répartition statuts</h3>
                <p className="text-xs text-muted-foreground">Distribution des dossiers</p>
              </div>
              {statutPie.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={statutPie}
                      cx="50%"
                      cy="45%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statutPie.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} dossier${Number(v) > 1 ? 's' : ''}`]} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">Aucun dossier</div>
              )}
            </div>
          </div>

          {/* ── Recent Transits ── */}
          {recentTransits.length > 0 && (
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="text-sm font-semibold">Derniers dossiers</h3>
                <Link href="/dashboard/transit" className="flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: BLUE }}>
                  Voir tout <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y">
                {recentTransits.map((t) => (
                  <Link
                    key={t._id}
                    href={`/dashboard/transit/${t._id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.client}</p>
                      <p className="text-xs text-muted-foreground">BL : {t.bl}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {new Date(t.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: `${STATUS_COLORS[t.statut] ?? '#94a3b8'}18`,
                          color: STATUS_COLORS[t.statut] ?? '#94a3b8',
                        }}
                      >
                        {STATUS_LABELS[t.statut] ?? t.statut}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}


        </div>
      </PageContent>
    </DashboardLayout>
  );
}
