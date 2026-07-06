'use client';

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  pdf,
  Font,
} from '@react-pdf/renderer';
import { formatCurrency } from '@/lib/utils';
import { EMAMA_TRANSIT_AR, transitLogoPublicUrl } from '@/lib/transitLogo';

const NAVY      = '#003366';
const NAVY_DARK = '#00244d';
const ACCENT    = '#e8f0f8';
const GREEN     = '#006633';
const RED       = '#b3261e';
const MUTED     = '#555555';
const DIVIDER   = '#d0d8e4';

const PAD_X            = 32;
const FOOTER_BLOCK_PT  = 68;
const FOOTER_BOTTOM_PT = 10;

let histFontAttempted = false;
let histFontReady = false;

function ensureHistoriqueFonts(origin: string): boolean {
  if (histFontAttempted) return histFontReady;
  histFontAttempted = true;
  const base = origin.replace(/\/$/, '');
  try {
    Font.register({
      family: 'CairoHist',
      fonts: [
        { src: `${base}/fonts/Cairo-Regular.ttf` },
        { src: `${base}/fonts/Cairo-Bold.ttf`, fontWeight: 'bold' },
      ],
    });
    histFontReady = true;
  } catch {
    histFontReady = false;
  }
  return histFontReady;
}

function amountNum(v: number): string {
  return formatCurrency(v).replace('MRU', '').trim();
}

export type CaisseHistoriqueTone = 'default' | 'credit' | 'debit';

export interface CaisseHistoriqueKpi {
  label: string;
  /** Déjà formaté (ex. « 12 500,00 MRU » ou « 14 »). */
  value: string;
  tone?: CaisseHistoriqueTone;
}

export interface CaisseHistoriqueRow {
  date: string;
  type: 'CREDIT' | 'DEBIT';
  description: string;
  reference?: string;
  montant: number;
}

export interface CaisseHistoriquePdfModel {
  /** Libellé du badge dans l'en-tête (ex. « Opérations de caisse »). */
  badge: string;
  titre: string;
  sousTitre?: string;
  /** Date de génération formatée. */
  genereLe: string;
  kpis: CaisseHistoriqueKpi[];
  rows: CaisseHistoriqueRow[];
  /** Affiche la colonne Type (masquée quand toutes les lignes sont du même sens). */
  showType: boolean;
  totalLabel: string;
  totalMontant: number;
}

/* Largeurs de colonnes (en %) selon la présence de la colonne Type. */
function columnWidths(showType: boolean) {
  return showType
    ? { date: '15%', type: '13%', desc: '40%', ref: '19%', montant: '13%' }
    : { date: '18%', type: '0%', desc: '46%', ref: '22%', montant: '14%' };
}

const styles = StyleSheet.create({
  page: {
    position: 'relative',
    flexDirection: 'column',
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: FOOTER_BLOCK_PT + FOOTER_BOTTOM_PT,
    fontSize: 9,
    color: '#1a1a1a',
    fontFamily: 'CairoHist',
    backgroundColor: '#ffffff',
  },
  pageFallback: {
    position: 'relative',
    flexDirection: 'column',
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: FOOTER_BLOCK_PT + FOOTER_BOTTOM_PT,
    fontSize: 9,
    color: '#1a1a1a',
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },

  /* HEADER */
  headerBand: {
    backgroundColor: NAVY,
    paddingVertical: 18,
    paddingHorizontal: PAD_X,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerLogo: { width: 44, height: 44, objectFit: 'contain' },
  headerCompany: { flexDirection: 'column', gap: 2 },
  headerFr: { fontSize: 15, fontWeight: 'bold', color: '#ffffff', letterSpacing: 1 },
  headerAr: { fontSize: 9, color: '#b8ccde', textAlign: 'right' },
  headerBadge: {
    backgroundColor: ACCENT,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#9ab6d6',
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: NAVY,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  /* BODY */
  body: { flexDirection: 'column', paddingHorizontal: PAD_X, paddingTop: 22 },

  /* TITRE */
  titleBlock: { marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 'bold', color: NAVY_DARK },
  subtitle: { fontSize: 9.5, color: MUTED, marginTop: 3 },
  genere: { fontSize: 8, color: MUTED, marginTop: 3 },

  /* KPI */
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  kpiCard: {
    flex: 1,
    backgroundColor: ACCENT,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: NAVY,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  kpiLabel: {
    fontSize: 7,
    color: NAVY,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  kpiValue: { fontSize: 11, fontWeight: 'bold', color: NAVY_DARK },
  kpiValueCredit: { fontSize: 11, fontWeight: 'bold', color: GREEN },
  kpiValueDebit: { fontSize: 11, fontWeight: 'bold', color: RED },

  /* TABLE */
  table: { borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: DIVIDER },
  tableHeader: { flexDirection: 'row', backgroundColor: NAVY },
  th: {
    paddingVertical: 7,
    paddingHorizontal: 7,
    fontSize: 7.5,
    color: '#ffffff',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    borderRightWidth: 1,
    borderRightColor: '#1a4a80',
  },
  thLast: {
    paddingVertical: 7,
    paddingHorizontal: 7,
    fontSize: 7.5,
    color: '#ffffff',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'right',
  },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: DIVIDER, minHeight: 18 },
  rowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    minHeight: 18,
    backgroundColor: '#f4f7fb',
  },
  cell: {
    paddingVertical: 4.5,
    paddingHorizontal: 7,
    fontSize: 8,
    color: '#1a1a1a',
    borderRightWidth: 1,
    borderRightColor: DIVIDER,
  },
  cellMuted: {
    paddingVertical: 4.5,
    paddingHorizontal: 7,
    fontSize: 8,
    color: MUTED,
    borderRightWidth: 1,
    borderRightColor: DIVIDER,
  },
  cellMontant: {
    paddingVertical: 4.5,
    paddingHorizontal: 7,
    fontSize: 8.5,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  typeCredit: { color: GREEN, fontWeight: 'bold' },
  typeDebit: { color: RED, fontWeight: 'bold' },

  /* TOTAL ROW */
  totalRow: { flexDirection: 'row', backgroundColor: NAVY_DARK },
  totalLabel: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 8.5,
    color: '#b8ccde',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'right',
  },
  totalValue: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 10,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'right',
  },

  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    fontSize: 9,
    color: MUTED,
  },

  /* FOOTER */
  footerWrap: {
    position: 'absolute',
    bottom: FOOTER_BOTTOM_PT,
    left: 0,
    right: 0,
    paddingHorizontal: PAD_X,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: NAVY,
  },
  footerInner: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  footerCol: { flex: 1 },
  footerLabel: {
    fontSize: 7,
    color: NAVY,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  footerText: { fontSize: 7.5, color: MUTED, lineHeight: 1.45 },
  footerCenter: { flex: 2, alignItems: 'center' },
  footerCenterBold: { fontSize: 8, color: NAVY, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  footerCenterText: { fontSize: 7.5, color: MUTED, textAlign: 'center', lineHeight: 1.45 },
  footerPage: { fontSize: 7, color: MUTED, textAlign: 'center', marginTop: 2 },
});

function kpiValueStyle(tone?: CaisseHistoriqueTone) {
  if (tone === 'credit') return styles.kpiValueCredit;
  if (tone === 'debit') return styles.kpiValueDebit;
  return styles.kpiValue;
}

function CaisseHistoriquePdfPage({
  model,
  logoUrl,
  useCairo,
}: {
  model: CaisseHistoriquePdfModel;
  logoUrl: string;
  useCairo: boolean;
}) {
  const pageStyle = useCairo ? styles.page : styles.pageFallback;
  const w = columnWidths(model.showType);

  return (
    <Page size="A4" style={pageStyle}>
      {/* HEADER (page 1) */}
      <View style={styles.headerBand}>
        <View style={styles.headerLeft}>
          <Image src={logoUrl} style={styles.headerLogo} />
          <View style={styles.headerCompany}>
            <Text style={styles.headerFr}>SNTS</Text>
            <Text style={styles.headerAr}>{EMAMA_TRANSIT_AR}</Text>
          </View>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{model.badge}</Text>
        </View>
      </View>

      {/* BODY */}
      <View style={styles.body}>
        {/* TITRE */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{model.titre}</Text>
          {model.sousTitre ? <Text style={styles.subtitle}>{model.sousTitre}</Text> : null}
          <Text style={styles.genere}>Généré le {model.genereLe}</Text>
        </View>

        {/* KPI */}
        {model.kpis.length > 0 ? (
          <View style={styles.kpiRow}>
            {model.kpis.map((k, i) => (
              <View key={i} style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{k.label}</Text>
                <Text style={kpiValueStyle(k.tone)}>{k.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* TABLE */}
        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            <Text style={{ ...styles.th, width: w.date }}>Date</Text>
            {model.showType ? (
              <Text style={{ ...styles.th, width: w.type }}>Type</Text>
            ) : null}
            <Text style={{ ...styles.th, width: w.desc }}>Description</Text>
            <Text style={{ ...styles.th, width: w.ref }}>Référence</Text>
            <Text style={{ ...styles.thLast, width: w.montant }}>Montant</Text>
          </View>

          {model.rows.length === 0 ? (
            <Text style={styles.empty}>Aucune opération.</Text>
          ) : (
            model.rows.map((r, idx) => {
              const isCredit = r.type === 'CREDIT';
              const rowStyle = idx % 2 === 1 ? styles.rowAlt : styles.row;
              return (
                <View key={idx} style={rowStyle} wrap={false}>
                  <Text style={{ ...styles.cell, width: w.date }}>{r.date}</Text>
                  {model.showType ? (
                    <Text
                      style={{
                        ...styles.cell,
                        width: w.type,
                        ...(isCredit ? styles.typeCredit : styles.typeDebit),
                      }}
                    >
                      {isCredit ? 'Entrée' : 'Sortie'}
                    </Text>
                  ) : null}
                  <Text style={{ ...styles.cell, width: w.desc }} wrap>
                    {r.description || '—'}
                  </Text>
                  <Text style={{ ...styles.cellMuted, width: w.ref }}>
                    {r.reference || '—'}
                  </Text>
                  <Text
                    style={{
                      ...styles.cellMontant,
                      width: w.montant,
                      color: isCredit ? GREEN : RED,
                    }}
                  >
                    {isCredit ? '+' : '−'}
                    {amountNum(r.montant)}
                  </Text>
                </View>
              );
            })
          )}

          {/* TOTAL */}
          {model.rows.length > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{model.totalLabel}</Text>
              <Text style={{ ...styles.totalValue, width: w.montant }}>
                {amountNum(model.totalMontant)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* FOOTER */}
      <View style={styles.footerWrap} fixed>
        <View style={styles.footerInner}>
          <View style={styles.footerCol}>
            <Text style={styles.footerLabel}>Contact</Text>
            <Text style={styles.footerText}>
              Tél : +222 46 91 19 19{'\n'}Mobile : +222 36 31 10 37
            </Text>
          </View>
          <View style={styles.footerCenter}>
            <Text style={styles.footerCenterBold}>SNTS — Nouakchott, Mauritanie</Text>
            <Text style={styles.footerCenterText}>
              Avenue Elmoukhtar Ould Dadah, en face de la mosquée de Quba
            </Text>
            <Text
              style={styles.footerPage}
              render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
            />
          </View>
          <View style={{ ...styles.footerCol, alignItems: 'flex-end' }}>
            <Text style={styles.footerLabel}>Web</Text>
            <Text style={{ ...styles.footerText, textAlign: 'right' }}>
              contact@snts.mr{'\n'}www.snts.mr
            </Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

export function CaisseHistoriquePdfDocument({
  model,
  logoUrl,
  useCairo = true,
}: {
  model: CaisseHistoriquePdfModel;
  logoUrl: string;
  useCairo?: boolean;
}) {
  return (
    <Document title={`${model.badge} — ${model.titre}`}>
      <CaisseHistoriquePdfPage model={model} logoUrl={logoUrl} useCairo={useCairo} />
    </Document>
  );
}

async function caisseHistoriquePdfBlob(
  model: CaisseHistoriquePdfModel,
  origin: string
): Promise<Blob> {
  const useCairo = ensureHistoriqueFonts(origin);
  const logoUrl = transitLogoPublicUrl(origin);
  return pdf(
    <CaisseHistoriquePdfDocument model={model} logoUrl={logoUrl} useCairo={useCairo} />
  ).toBlob();
}

function safeFilePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'historique';
}

export async function downloadCaisseHistoriquePdf(
  model: CaisseHistoriquePdfModel,
  origin: string
) {
  const blob = await caisseHistoriquePdfBlob(model, origin);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilePart(model.titre)}.pdf`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 90_000);
}

export async function printCaisseHistoriquePdf(
  model: CaisseHistoriquePdfModel,
  origin: string
) {
  const blob = await caisseHistoriquePdfBlob(model, origin);
  const url = URL.createObjectURL(blob);

  const scheduleRevoke = () => window.setTimeout(() => URL.revokeObjectURL(url), 180_000);
  const tryPrint = (w: Window) => {
    try {
      w.focus();
      w.print();
    } catch {
      /* */
    }
  };

  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (w) {
    scheduleRevoke();
    w.addEventListener('load', () => window.setTimeout(() => tryPrint(w), 450), { once: true });
    window.setTimeout(() => tryPrint(w), 1600);
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.title = 'Impression historique caisse';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  iframe.src = url;
  iframe.onload = () => {
    window.setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        /* */
      }
    }, 350);
    scheduleRevoke();
    window.setTimeout(() => iframe.remove(), 180_000);
  };
  document.body.appendChild(iframe);
}
