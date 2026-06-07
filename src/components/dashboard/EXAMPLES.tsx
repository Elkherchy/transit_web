/**
 * EXEMPLE D'UTILISATION - DashboardSection & MetricCard
 * Ce fichier montre comment utiliser les nouveaux composants
 * pour structurer d'autres pages du dashboard
 */

import React from 'react';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { DashboardSection } from '@/components/dashboard/DashboardSection';
import { BarChart3, TrendingUp, Clock, AlertCircle, Truck, FileText } from 'lucide-react';

/**
 * EXEMPLE 1: Page de Gestion des Caisses avec sections
 */
export function CaissesDashboardExample() {
  return (
    <div className="space-y-8">
      {/* Section 1: Résumé des Caisses */}
      <DashboardSection
        title="Résumé des Caisses"
        subtitle="État actuel de la trésorerie"
        icon={<BarChart3 className="w-5 h-5 text-amber-600" />}
        iconBgColor="bg-amber-50"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            variant="stat"
            title="Caisse Principale"
            value="250,000"
            description="Solde actuel en DZD"
            borderTopColor="#ca8a04"
          />
          <MetricCard
            variant="stat"
            title="Banque Principale"
            value="1,500,000"
            description="Solde en banque"
            borderTopColor="#16a34a"
          />
          <MetricCard
            variant="stat"
            title="Opérations Aujourd'hui"
            value="45"
            description="Transactions traitées"
            borderTopColor="#02389b"
          />
          <MetricCard
            variant="stat"
            title="Différence"
            value="+12,500"
            description="Par rapport à hier"
            borderTopColor="#4f46e5"
          />
        </div>
      </DashboardSection>

      {/* Section 2: Actions Rapides */}
      <DashboardSection
        title="Actions Rapides"
        subtitle="Accès aux opérations fréquentes"
        icon={<Clock className="w-5 h-5 text-blue-600" />}
        iconBgColor="bg-blue-50"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            variant="module"
            title="Nouveaux Versements"
            description="Enregistrer des dépôts en caisse"
            value="→"
            borderTopColor="#02389b"
            href="/dashboard/caisses/versements"
            voirPlusLabel="Accéder"
          />
          <MetricCard
            variant="module"
            title="Mouvements de Fonds"
            description="Transferts entre caisses et banques"
            value="→"
            borderTopColor="#16a34a"
            href="/dashboard/caisses/mouvements"
            voirPlusLabel="Accéder"
          />
          <MetricCard
            variant="module"
            title="Rapprochements"
            description="Vérification des soldes"
            value="→"
            borderTopColor="#ca8a04"
            href="/dashboard/caisses/rapprochements"
            voirPlusLabel="Accéder"
          />
        </div>
      </DashboardSection>

      {/* Section 3: Alertes et Avertissements */}
      <DashboardSection
        title="Alertes Importantes"
        subtitle="Points d'attention importants"
        icon={<AlertCircle className="w-5 h-5 text-red-600" />}
        iconBgColor="bg-red-50"
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-yellow-200 bg-yellow-50/50 p-4">
            <p className="text-sm font-semibold text-yellow-900">
              ⚠️ Caisse 02 - Différence détectée
            </p>
            <p className="mt-1 text-xs text-yellow-800">
              Différence de 5,000 DZD détectée lors du dernier rapprochement
            </p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
            <p className="text-sm font-semibold text-blue-900">
              ℹ️ Archivage automatique prévu
            </p>
            <p className="mt-1 text-xs text-blue-800">
              Les opérations de plus de 30 jours seront archivées demain
            </p>
          </div>
        </div>
      </DashboardSection>

      {/* Section 4: Graphiques */}
      <DashboardSection
        title="Analyse Tendances"
        subtitle="Évolution des soldes sur 30 jours"
        icon={<TrendingUp className="w-5 h-5 text-green-600" />}
        iconBgColor="bg-green-50"
      >
        {/* Insérez ici un composant Highcharts ou Chart.js */}
        <div className="h-64 rounded-lg bg-muted/50 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Graphique à insérer</p>
        </div>
      </DashboardSection>
    </div>
  );
}

/**
 * EXEMPLE 2: Grid d'actions pour module Factures
 */
export function FacturesActionsExample() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        variant="module"
        title="Créer Facture"
        description="Nouvelle facture client"
        value="→"
        borderTopColor="#4f46e5"
        href="/dashboard/factures/create"
        icon={<BarChart3 className="w-6 h-6" />}
      />
      <MetricCard
        variant="module"
        title="Factures En Attente"
        description="À valider ou confirmer"
        value="→"
        borderTopColor="#f59e0b"
        href="/dashboard/factures/pending"
        icon={<Clock className="w-6 h-6" />}
      />
      <MetricCard
        variant="module"
        title="Rapports"
        description="Synthèse des facturations"
        value="→"
        borderTopColor="#02389b"
        href="/dashboard/factures/reports"
        icon={<TrendingUp className="w-6 h-6" />}
      />
      <MetricCard
        variant="module"
        title="Importer"
        description="Factures depuis fichier"
        value="→"
        borderTopColor="#16a34a"
        href="/dashboard/factures/import"
        icon={<BarChart3 className="w-6 h-6" />}
      />
    </div>
  );
}

/**
 * EXEMPLE 3: Statistiques clés avec MetricCard variant="stat"
 */
export function KPIStatsExample() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        variant="stat"
        title="Revenue (MTD)"
        value="4.2M"
        description="Chiffre d'affaires du mois"
        borderTopColor="#16a34a"
      />
      <MetricCard
        variant="stat"
        title="Dossiers Actifs"
        value="156"
        description="En cours de traitement"
        borderTopColor="#02389b"
      />
      <MetricCard
        variant="stat"
        title="Taux de Clôture"
        value="94.2%"
        description="Dossiers complétés"
        borderTopColor="#4f46e5"
      />
      <MetricCard
        variant="stat"
        title="En Attente"
        value="9"
        description="Actions requises"
        borderTopColor="#ca8a04"
      />
    </div>
  );
}

/**
 * EXEMPLE 4: Navigation module avec variant="module"
 */
export function ModuleNavigationExample() {
  const modules = [
    {
      title: 'Transit',
      description: 'Gestion des dossiers transit',
      color: '#02389b',
      href: '/dashboard/transit',
      icon: <Truck className="w-6 h-6" />,
    },
    {
      title: 'Factures',
      description: 'Facturation et paiements',
      color: '#4f46e5',
      href: '/dashboard/factures',
      icon: <FileText className="w-6 h-6" />,
    },
    // ... autres modules
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {modules.map((mod) => (
        <MetricCard
          key={mod.href}
          variant="module"
          title={mod.title}
          description={mod.description}
          value="→"
          borderTopColor={mod.color}
          href={mod.href}
          icon={mod.icon}
          voirPlusLabel="Accéder"
        />
      ))}
    </div>
  );
}

/**
 * COMPOSANTS À IMPORTER POUR UTILISATION
 * 
 * import { MetricCard } from '@/components/dashboard/MetricCard';
 * import { DashboardSection } from '@/components/dashboard/DashboardSection';
 * import { 
 *   BarChart3, 
 *   TrendingUp, 
 *   Clock, 
 *   AlertCircle,
 *   Truck,
 *   FileText
 * } from 'lucide-react';
 */
