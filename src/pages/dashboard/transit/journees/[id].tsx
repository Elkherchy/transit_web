import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  UserRole,
  type ITransit,
  type IDesignation,
  type IJourneeCaisse,
  type IUserResponse,
  DesignationStatus,
  JourneeCaisseStatus,
} from '@/types';
import Link from 'next/link';
import { Eye, CheckCircle2, XCircle, FileCheck2, Receipt } from 'lucide-react';

interface DetailPayload {
  journee: IJourneeCaisse;
  transits: ITransit[];
  payeurs: Record<string, IUserResponse>;
  caissier?: IUserResponse;
}

interface ViewState {
  transitId: string;
  designation: IDesignation;
  recuUrl?: string | null;
  payeur?: IUserResponse;
}

export default function TransitJourneeDetail() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed =
    user?.role === UserRole.AGENT_TRANSIT ||
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT;
  const id = String(router.query.id || '');

  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<ViewState | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [validatingAdmin, setValidatingAdmin] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const isAdmin = user?.role === UserRole.ADMIN;
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/journee/${id}`, {
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
    if (isAllowed && id) void reload();
  }, [isAllowed, id, reload]);

  const openView = async (
    transitId: string,
    designation: IDesignation,
    payeur?: IUserResponse
  ) => {
    setView({
      transitId,
      designation,
      recuUrl: designation.recuUrl,
      payeur,
    });
    setSignedUrl(null);
    setCommentaire('');
    if (designation.recuUrl) {
      try {
        const r = await fetch(
          `/api/documents/${encodeURIComponent(designation.recuUrl)}`,
          { credentials: 'include' }
        ).then((x) => x.json());
        if (r.success && r.url) setSignedUrl(r.url);
      } catch {
        /* ignore */
      }
    }
  };

  const decide = async (action: 'valider' | 'rejeter') => {
    if (!view) return;
    setBusy(`${view.transitId}:${view.designation._id}:${action}`);
    try {
      const r = await fetch(
        `/api/transit/${view.transitId}/designation/${view.designation._id}/valider-transit`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            commentaire: commentaire.trim() || undefined,
          }),
        }
      ).then((x) => x.json());
      if (!r.success) setError(r.error || 'Erreur');
      setView(null);
      void reload();
    } finally {
      setBusy(null);
    }
  };

  const validerJournee = async () => {
    setValidating(true);
    setError(null);
    try {
      const r = await fetch(`/api/journee/${id}/valider-transit`, {
        method: 'POST',
        credentials: 'include',
      }).then((x) => x.json());
      if (!r.success) setError(r.error || 'Erreur');
      void reload();
    } finally {
      setValidating(false);
    }
  };

  const validerAdmin = async () => {
    setValidatingAdmin(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`/api/journee/${id}/valider-admin`, {
        method: 'POST',
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) {
        const n = (r.data?.facturesCreees || []).length;
        setSuccess(
          `Journée validée. ${n} facture(s) client générée(s) automatiquement.`
        );
        void reload();
      } else {
        setError(r.error || 'Erreur');
      }
    } catch {
      setError('Erreur réseau');
    } finally {
      setValidatingAdmin(false);
    }
  };

  const designationStatusBadge = (s?: DesignationStatus) => {
    switch (s) {
      case DesignationStatus.PAYEE:
        return <Badge variant="secondary">À valider</Badge>;
      case DesignationStatus.VALIDEE_TRANSIT:
        return <Badge className="bg-emerald-600">Validée transit</Badge>;
      case DesignationStatus.VALIDEE_ADMIN:
        return <Badge className="bg-green-700">Validée admin</Badge>;
      case DesignationStatus.RESERVEE:
        return <Badge>Réservée</Badge>;
      case DesignationStatus.LIBRE:
        return <Badge variant="outline">Libre</Badge>;
      case DesignationStatus.REJETEE:
        return <Badge variant="destructive">Rejetée</Badge>;
      default:
        return <Badge variant="outline">{s || '—'}</Badge>;
    }
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title="Détail journée" />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed || !data) return null;

  const { journee, transits, payeurs, caissier } = data;
  const canValidateJournee =
    journee.statut === JourneeCaisseStatus.CLOTUREE &&
    transits.every((t) =>
      t.designations.every(
        (d) => d.statutDesignation !== DesignationStatus.PAYEE
      )
    );

  const totalAlimentations = (journee.alimentationsPayeurs || []).reduce(
    (s, a) => s + a.montant,
    0
  );
  const totalDepots = (journee.alimentationsAdmin || []).reduce(
    (s, a) => s + a.montant,
    0
  );

  return (
    <DashboardLayout>
      <PageHeader
        title={`Journée du ${new Date(journee.date).toLocaleDateString('fr-FR')}`}
        subtitle={`Caissier : ${caissier?.nom || journee.caissierId}`}
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Rapport caisse</span>
                <Badge variant="outline">{journee.statut}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <div className="text-muted-foreground">Solde au début</div>
                <div className="font-semibold">
                  {journee.soldeGeneralDebut.toFixed(2)} MRU
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Solde à la clôture</div>
                <div className="font-semibold">
                  {journee.soldeGeneralFin !== undefined &&
                  journee.soldeGeneralFin !== null
                    ? `${journee.soldeGeneralFin.toFixed(2)} MRU`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Dépôts admin</div>
                <div className="font-semibold text-green-700">
                  +{totalDepots.toFixed(2)} MRU
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">
                  Alimentations payeurs
                </div>
                <div className="font-semibold text-red-700">
                  −{totalAlimentations.toFixed(2)} MRU
                </div>
              </div>
            </CardContent>
          </Card>

          {transits.map((t) => (
            <Card key={t._id}>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>
                    {t.client} — BL {t.bl}
                  </span>
                  {t.factureClientId && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/factures/${t.factureClientId}`}>
                        <Receipt className="mr-2 h-4 w-4" />
                        Facture client
                      </Link>
                    </Button>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{t.objet}</p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-3">Désignation</th>
                        <th className="py-2 pr-3 text-right">Montant</th>
                        <th className="py-2 pr-3">Payeur</th>
                        <th className="py-2 pr-3">Statut</th>
                        <th className="py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(t.designations || []).map((d) => {
                        const payeur = d.payeurId
                          ? payeurs[String(d.payeurId)]
                          : undefined;
                        return (
                          <tr
                            key={String(d._id)}
                            className="border-b last:border-0"
                          >
                            <td className="py-2 pr-3">{d.nom}</td>
                            <td className="py-2 pr-3 text-right">
                              {Number(d.montant || 0).toFixed(2)} MRU
                            </td>
                            <td className="py-2 pr-3">
                              {payeur?.nom || (d.payeurId ? '—' : '')}
                            </td>
                            <td className="py-2 pr-3">
                              {designationStatusBadge(d.statutDesignation)}
                            </td>
                            <td className="py-2 text-right">
                              {d.statutDesignation ===
                                DesignationStatus.PAYEE && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openView(t._id, d, payeur)}
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  Voir
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}

          {journee.statut === JourneeCaisseStatus.CLOTUREE && (
            <div className="flex justify-end">
              <Button
                size="lg"
                onClick={validerJournee}
                disabled={!canValidateJournee || validating}
              >
                <FileCheck2 className="mr-2 h-4 w-4" />
                {validating
                  ? 'Validation…'
                  : 'Valider toute la journée (passer à admin)'}
              </Button>
            </div>
          )}

          {/* Validation finale admin → crée les factures clients */}
          {isAdmin &&
            journee.statut === JourneeCaisseStatus.VALIDEE_TRANSIT && (
              <div className="flex justify-end">
                <Button
                  size="lg"
                  onClick={validerAdmin}
                  disabled={validatingAdmin}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {validatingAdmin
                    ? 'Validation…'
                    : 'Valider la journée + créer factures clients'}
                </Button>
              </div>
            )}
        </div>

        <Dialog
          open={!!view}
          onOpenChange={(o) => !o && setView(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{view?.designation.nom}</DialogTitle>
              <DialogDescription>
                Payé par {view?.payeur?.nom || '—'} —{' '}
                {Number(view?.designation.montant || 0).toFixed(2)} MRU
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {view?.recuUrl ? (
                <div className="border rounded">
                  {signedUrl ? (
                    /\.pdf$/i.test(view.recuUrl || '') ? (
                      <iframe
                        src={signedUrl}
                        className="w-full h-[420px] rounded"
                        title="Reçu PDF"
                      />
                    ) : (
                      // S3 presigned URL (1h) — next/image inadapté.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={signedUrl}
                        alt="Reçu"
                        className="w-full max-h-[420px] object-contain rounded"
                      />
                    )
                  ) : (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      Chargement du reçu…
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun reçu.</p>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Commentaire (optionnel)
                </label>
                <Textarea
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder="Remarques pour audit…"
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="destructive"
                disabled={!!busy}
                onClick={() => void decide('rejeter')}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Rejeter
              </Button>
              <Button
                disabled={!!busy}
                onClick={() => void decide('valider')}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Valider
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContent>
    </DashboardLayout>
  );
}
