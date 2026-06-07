import React from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, PageContent } from '@/components/ui';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Users, FileText, Wallet } from 'lucide-react';


export default function PaieIndexPage() {
  const { t } = useTranslation();
  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.paie.title')}
        subtitle={t('dashboard.paie.subtitle')}
      />
      <PageContent>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5" /> {t('dashboard.paie.salaries.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                {t('dashboard.paie.salaries.description')}
              </p>
              <Button asChild className="w-full">
                <Link href="/dashboard/paie/salaries">
                  {t('dashboard.paie.salaries.viewBtn')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5" /> {t('dashboard.paie.bulletins.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                {t('dashboard.paie.bulletins.description')}
              </p>
              <Button asChild className="w-full">
                <Link href="/dashboard/paie/bulletins">
                  {t('dashboard.paie.bulletins.viewBtn')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-5 w-5" /> {t('dashboard.paie.paiements.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                {t('dashboard.paie.paiements.description')}
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/paie/bulletins?statut=VALIDE">
                  {t('dashboard.paie.paiements.viewBtn')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
