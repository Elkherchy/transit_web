import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  FilterBadge,
  FilterBar,
  StatusBadge,
  MobilePagination,
} from '@/components/ui';
import { 
  TransitDataTable,
  type TransitRow,
} from '@/components/dashboard/transit/data-table';
import { UserRole } from '@/types';
import { Plus, FileText, Trash2, Eye, Pencil, MoreHorizontal, CreditCard } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { useIsMobile } from '@/hooks/use-mobile';

export default function TransitList() {
  const { data: session } = useSession();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  
  const [transits, setTransits] = useState<TransitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const { t } = useTranslation();

  const isAgentOrAdmin =
    user?.role === UserRole.ADMIN || user?.role === UserRole.AGENT_TRANSIT;
  const isPayeur = user?.role === UserRole.USER_PAYEUR;

  const itemsPerPage = isMobile ? 5 : 10;

  const fetchTransits = async () => {
    try {
      const response = await fetch('/api/transit', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();
      if (data.success) {
        setTransits(data.data.data);
      }
    } catch (error) {
      console.error('Error fetching transits:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTransits();
  }, []);

  const filteredTransits = transits.filter(
    (t) =>
      t.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.bl.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.objet.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredTransits.length / itemsPerPage);
  const paginatedTransits = filteredTransits.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleDeleteTransit = useCallback(async (id: string) => {
    if (
      !window.confirm(
        t('dashboard.transit.list_card.deleteConfirm')
      )
    ) {
      return;
    }
    setListError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/transit/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setTransits((prev) => prev.filter((t) => t._id !== id));
      } else {
        setListError(data.error || t('dashboard.transit.list_card.deleteFailed'));
      }
    } catch {
      setListError(t('common.errorNetwork'));
    } finally {
      setDeletingId(null);
    }
  }, []);

  // Render mobile cards
  const renderMobileCards = () => (
    <div className="space-y-3">
      {paginatedTransits.map((transit) => (
        <MobileEntityCard
          key={transit._id}
          title={transit.client}
          subtitle={`BL: ${transit.bl}`}
          fields={[
            { label: t('dashboard.transit.list_card.fieldObjet'), value: transit.objet },
            { label: t('dashboard.transit.list_card.fieldDesignations'), value: `${transit.designations?.length || 0} ligne(s)` },
            { label: t('dashboard.transit.list_card.fieldDocuments'), value: `${transit.documents?.length || 0} fichier(s)` },
          ]}
          actions={
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 px-3"
                    aria-label={`Actions — ${transit.client}`}
                    disabled={deletingId === transit._id}
                  >
                    {deletingId === transit._id ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    ) : (
                      <MoreHorizontal className="h-4 w-4" />
                    )}
                    {t('dashboard.transit.actions.label')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>{t('dashboard.transit.actions.label')}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      void router.push({
                        pathname: '/dashboard/transit/details',
                        query: { id: transit._id },
                      })
                    }
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    {isPayeur ? t('dashboard.transit.actions.viewDossier') : t('dashboard.transit.actions.view')}
                  </DropdownMenuItem>
                  {isAgentOrAdmin && (
                    <DropdownMenuItem
                      onClick={() =>
                        void router.push(`/dashboard/transit/edit/${transit._id}`)
                      }
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('dashboard.transit.actions.edit')}
                    </DropdownMenuItem>
                  )}
                  {isPayeur &&
                    transit.payeurFacture?.soumettrePaiementDisponible &&
                    transit.payeurFacture._id && (
                      <DropdownMenuItem
                        onClick={() => {
                          const fid = transit.payeurFacture?._id;
                          if (fid)
                            void router.push(
                              `/dashboard/factures/${fid}?paiement=1`
                            );
                        }}
                      >
                        <CreditCard className="mr-2 h-4 w-4" />
                        {t('dashboard.transit.actions.submitPayment')}
                      </DropdownMenuItem>
                    )}
                  {isAgentOrAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDeleteTransit(transit._id)}
                        disabled={deletingId === transit._id}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('dashboard.transit.actions.delete')}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
      ))}
    </div>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.transit.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.transit.title')}
        subtitle={isPayeur
          ? t('dashboard.transit.subtitlePayeur')
          : t('dashboard.transit.subtitleAdmin')
        }
        actions={
          isAgentOrAdmin && (
            <Button asChild className={isMobile ? 'h-10 px-3' : ''}>
              <Link href="/dashboard/transit/create">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('dashboard.transit.list_card.newDossier')}</span>
              </Link>
            </Button>
          )
        }
        sticky={isMobile}
      />

      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <Card className="overflow-hidden">
          <CardHeader className="space-y-4">
            <CardTitle className="text-base sm:text-lg">{t('dashboard.transit.list')}</CardTitle>
            
            {listError && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {listError}
              </div>
            )}
            
            <SearchInput
              placeholder={t('dashboard.transit.list_card.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:max-w-md"
            />
          </CardHeader>
          
          <CardContent className="p-4 sm:p-6">
            {filteredTransits.length === 0 ? (
              <div className="px-4 pb-6">
                <EmptyState
                  icon={<FileText className="h-8 w-8" />}
                  title={t('dashboard.transit.list_card.emptyTitle')}
                  description={searchTerm
                    ? t('dashboard.transit.list_card.emptyDescriptionWithSearch')
                    : t('dashboard.transit.list_card.emptyDescription')
                  }
                  action={
                    isAgentOrAdmin && (
                      <Button asChild>
                        <Link href="/dashboard/transit/create">
                          <Plus className="mr-2 h-4 w-4" />
                          {t('dashboard.transit.list_card.newDossier')}
                        </Link>
                      </Button>
                    )
                  }
                />
              </div>
            ) : (
              <>
                <div className="px-4 pb-4 sm:px-0">
                  <ResponsiveTableArea
                    table={
                      <TransitDataTable
                        data={paginatedTransits}
                        router={router}
                        isAgentOrAdmin={isAgentOrAdmin}
                        isPayeur={isPayeur}
                        deletingId={deletingId}
                        onDelete={handleDeleteTransit}
                      />
                    }
                    mobileList={renderMobileCards()}
                  />
                </div>

                {totalPages > 1 && (
                  <div className="px-4 pb-4 sm:px-0">
                    <MobilePagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                      totalItems={filteredTransits.length}
                      itemsPerPage={itemsPerPage}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </PageContent>
    </DashboardLayout>
  );
}
