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
import type { IFacture } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { EMAMA_TRANSIT_AR, transitLogoPublicUrl } from '@/lib/transitLogo';

const NAVY      = '#003366';
const NAVY_DARK = '#00244d';
const ACCENT    = '#e8f0f8';
const MUTED     = '#555555';
const DIVIDER   = '#d0d8e4';

const PAD_X           = 32;
const FOOTER_BLOCK_PT = 68;
const FOOTER_BOTTOM_PT = 10;

let cairoFontAttempted = false;
let cairoFontReady = false;

function ensureFactureClientFonts(origin: string): boolean {
  if (cairoFontAttempted) return cairoFontReady;
  cairoFontAttempted = true;
  const base = origin.replace(/\/$/, '');
  try {
    Font.register({
      family: 'CairoFacture',
      fonts: [
        { src: `${base}/fonts/Cairo-Regular.ttf` },
        { src: `${base}/fonts/Cairo-Bold.ttf`, fontWeight: 'bold' },
        { src: `${base}/fonts/Cairo-Regular.ttf`, fontStyle: 'italic' },
        { src: `${base}/fonts/Cairo-Bold.ttf`, fontWeight: 'bold', fontStyle: 'italic' },
      ],
    });
    cairoFontReady = true;
  } catch {
    cairoFontReady = false;
  }
  return cairoFontReady;
}

function amountNum(v: number): string {
  return formatCurrency(v).replace('MRU', '').trim();
}

export interface FactureClientPdfModel {
  produitFacture: string;
  factureNum: string;
  ficheNum: string;
  blNumber: string;
  issueDate: string;
  clientName: string;
  lines: Array<{ produit: string; montant: number }>;
  totalOperations: number;
  interet: number;
  total: number;
}

const TABLE_ROW_TARGET = 10;

const styles = StyleSheet.create({
  page: {
    position: 'relative',
    flexDirection: 'column',
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: FOOTER_BLOCK_PT + FOOTER_BOTTOM_PT,
    fontSize: 10,
    color: '#1a1a1a',
    fontFamily: 'CairoFacture',
    backgroundColor: '#ffffff',
  },
  pageHelveticaFallback: {
    position: 'relative',
    flexDirection: 'column',
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: FOOTER_BLOCK_PT + FOOTER_BOTTOM_PT,
    fontSize: 10,
    color: '#1a1a1a',
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },

  /* ─── HEADER BAND ─── */
  headerBand: {
    backgroundColor: NAVY,
    paddingVertical: 18,
    paddingHorizontal: PAD_X,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerLogo: {
    width: 44,
    height: 44,
    objectFit: 'contain',
  },
  headerCompany: {
    flexDirection: 'column',
    gap: 2,
  },
  headerFr: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerAr: {
    fontSize: 9,
    color: '#b8ccde',
    textAlign: 'right',
  },
  headerBadge: {
    backgroundColor: '#ffffff',
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 18,
  },
  headerBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: NAVY,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  /* ─── BODY ─── */
  body: {
    flexDirection: 'column',
    paddingHorizontal: PAD_X,
    paddingTop: 20,
    flex: 1,
  },

  /* ─── META GRID ─── */
  metaGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metaCard: {
    flex: 1,
    backgroundColor: ACCENT,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: NAVY,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  metaLabel: {
    fontSize: 7.5,
    color: NAVY,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    width: 70,
    flexShrink: 0,
  },
  metaValue: {
    fontSize: 9.5,
    color: '#1a1a1a',
    flex: 1,
  },
  metaValueBold: {
    fontSize: 9.5,
    color: NAVY_DARK,
    fontWeight: 'bold',
    flex: 1,
  },

  /* ─── CLIENT BLOCK ─── */
  clientBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 4,
    overflow: 'hidden',
  },
  clientTag: {
    backgroundColor: NAVY,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  clientTagText: {
    fontSize: 8.5,
    color: '#ffffff',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clientName: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 11,
    fontWeight: 'bold',
    color: NAVY_DARK,
    textTransform: 'uppercase',
  },

  /* ─── TABLE ─── */
  table: {
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: DIVIDER,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: NAVY,
  },
  th: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    fontSize: 8,
    color: '#ffffff',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1a4a80',
  },
  thLast: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    fontSize: 8,
    color: '#ffffff',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    minHeight: 20,
  },
  rowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    minHeight: 20,
    backgroundColor: '#f4f7fb',
  },
  cell: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 9,
    color: '#1a1a1a',
    borderRightWidth: 1,
    borderRightColor: DIVIDER,
  },
  cellLast: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 9,
    color: '#1a1a1a',
  },

  /* ─── TOTAL ROW ─── */
  totalRow: {
    flexDirection: 'row',
    backgroundColor: NAVY_DARK,
  },
  totalLabel: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    fontSize: 9,
    color: '#b8ccde',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'right',
    borderRightWidth: 1,
    borderRightColor: '#1a4a80',
  },
  totalValue: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    fontSize: 10,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'right',
  },

  /* ─── SIGNATURE ─── */
  signSection: {
    marginTop: 22,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingRight: 8,
  },
  signBox: {
    alignItems: 'center',
    gap: 30,
  },
  signLabel: {
    fontSize: 10,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  signLine: {
    width: 130,
    height: 1,
    backgroundColor: NAVY,
  },

  /* ─── FOOTER ─── */
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
  footerInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  footerCol: {
    flex: 1,
  },
  footerLabel: {
    fontSize: 7,
    color: NAVY,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  footerText: {
    fontSize: 7.5,
    color: MUTED,
    lineHeight: 1.45,
  },
  footerCenter: {
    flex: 2,
    alignItems: 'center',
  },
  footerCenterBold: {
    fontSize: 8,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 2,
  },
  footerCenterText: {
    fontSize: 7.5,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 1.45,
  },
});

const COL_DESIGNATION = '46%';
const COL_QTY         = '10%';
const COL_PU          = '22%';
const COL_PT          = '22%';

function padLines(lines: FactureClientPdfModel['lines']) {
  const n = Math.max(0, TABLE_ROW_TARGET - lines.length);
  const empty = { produit: '', montant: 0 };
  return [...lines, ...Array.from({ length: n }, () => ({ ...empty }))];
}

function FactureClientPdfPage({
  model,
  logoUrl,
  useCairo,
}: {
  model: FactureClientPdfModel;
  logoUrl: string;
  useCairo: boolean;
}) {
  const rows = padLines(model.lines);
  const pageStyle = useCairo ? styles.page : styles.pageHelveticaFallback;
  const totalVal = model.total ?? model.totalOperations;

  return (
    <Page size="A4" style={pageStyle}>

      {/* ── HEADER BAND ── */}
      <View style={styles.headerBand}>
        <View style={styles.headerLeft}>
          <Image src={logoUrl} style={styles.headerLogo} />
          <View style={styles.headerCompany}>
            <Text style={styles.headerFr}>SNTS</Text>
            <Text style={styles.headerAr}>{EMAMA_TRANSIT_AR}</Text>
          </View>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>Facture</Text>
        </View>
      </View>

      {/* ── BODY ── */}
      <View style={styles.body}>

        {/* META GRID */}
        <View style={styles.metaGrid}>
          <View style={styles.metaCard}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Produit</Text>
              <Text style={styles.metaValue}>{model.produitFacture || '—'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>BL N°</Text>
              <Text style={styles.metaValueBold}>{model.blNumber || '—'}</Text>
            </View>
          </View>

          <View style={styles.metaCard}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Facture N°</Text>
              <Text style={styles.metaValueBold}>{model.factureNum || '—'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Fiche N°</Text>
              <Text style={styles.metaValue}>{model.ficheNum || '—'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{model.issueDate || '—'}</Text>
            </View>
          </View>
        </View>

        {/* CLIENT */}
        <View style={styles.clientBlock}>
          <View style={styles.clientTag}>
            <Text style={styles.clientTagText}>Client</Text>
          </View>
          <Text style={styles.clientName}>{model.clientName || '—'}</Text>
        </View>

        {/* TABLE */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={{ ...styles.th, width: COL_DESIGNATION, textAlign: 'left', paddingLeft: 10 }}>
              Désignation
            </Text>
            <Text style={{ ...styles.th, width: COL_QTY }}>Qté</Text>
            <Text style={{ ...styles.th, width: COL_PU }}>{'Prix Unitaire\n(N-UM)'}</Text>
            <Text style={{ ...styles.thLast, width: COL_PT }}>{'Prix Total\n(N-UM)'}</Text>
          </View>

          {rows.map((line, idx) => {
            const hasLine = Boolean(line.produit?.trim()) || line.montant > 0;
            const rowStyle = idx % 2 === 0 ? styles.row : styles.rowAlt;
            return (
              <View key={idx} style={rowStyle} wrap={false}>
                <Text style={{ ...styles.cell, width: COL_DESIGNATION, paddingLeft: 10 }} wrap>
                  {line.produit}
                </Text>
                <Text style={{ ...styles.cell, width: COL_QTY, textAlign: 'center' }}>
                  {''}
                </Text>
                <Text style={{ ...styles.cell, width: COL_PU, textAlign: 'right' }}>
                  {''}
                </Text>
                <Text style={{ ...styles.cellLast, width: COL_PT, textAlign: 'right' }}>
                  {hasLine ? amountNum(line.montant) : ''}
                </Text>
              </View>
            );
          })}

          {/* TOTAL */}
          <View style={styles.totalRow}>
            <Text style={{ ...styles.totalLabel, width: '78%' }}>
              Total (N-UM)
            </Text>
            <Text style={{ ...styles.totalValue, width: '22%' }}>
              {totalVal > 0 ? amountNum(totalVal) : ''}
            </Text>
          </View>
        </View>

        {/* SIGNATURE */}
        <View style={styles.signSection}>
          <View style={styles.signBox}>
            <Text style={styles.signLabel}>Le Directeur</Text>
            <View style={styles.signLine} />
          </View>
        </View>
      </View>

      {/* ── FOOTER ── */}
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

export function FactureClientPdfDocument({
  model,
  logoUrl,
  useCairo = true,
}: {
  model: FactureClientPdfModel;
  logoUrl: string;
  useCairo?: boolean;
}) {
  return (
    <Document title={`Facture client ${model.factureNum || ''}`}>
      <FactureClientPdfPage model={model} logoUrl={logoUrl} useCairo={useCairo} />
    </Document>
  );
}

export function buildFactureClientPdfModel(facture: IFacture): FactureClientPdfModel {
  const lines = [
    {
      produit: facture.transitObjet || '—',
      montant: facture.totalFinal ?? facture.totalOperations,
    },
  ];

  const issue =
    formatDate(facture.dateEmission) ||
    formatDate(facture.createdAt) ||
    '';

  return {
    produitFacture: facture.transitObjet || '',
    factureNum: facture.numero,
    ficheNum: facture.numero,
    blNumber: facture.bl || '',
    issueDate: issue,
    clientName: facture.transitClient || facture.payeur?.nom || '—',
    lines,
    totalOperations: facture.totalOperations,
    interet: facture.interet,
    total: facture.totalFinal,
  };
}

function factureFilename(model: FactureClientPdfModel): string {
  return (model.factureNum || 'facture').replace(/[^\w.-]+/g, '_');
}

async function factureClientPdfBlob(model: FactureClientPdfModel, origin: string): Promise<Blob> {
  const useCairo = ensureFactureClientFonts(origin);
  const logoUrl = transitLogoPublicUrl(origin);
  return pdf(
    <FactureClientPdfDocument model={model} logoUrl={logoUrl} useCairo={useCairo} />
  ).toBlob();
}

export async function downloadFactureClientPdf(model: FactureClientPdfModel, origin: string) {
  const blob = await factureClientPdfBlob(model, origin);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `facture-client-${factureFilename(model)}.pdf`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 90_000);
}

export async function printFactureClientPdf(model: FactureClientPdfModel, origin: string) {
  const blob = await factureClientPdfBlob(model, origin);
  const url = URL.createObjectURL(blob);

  const scheduleRevoke = () => {
    window.setTimeout(() => URL.revokeObjectURL(url), 180_000);
  };

  const tryPrintWindow = (w: Window) => {
    try {
      w.focus();
      w.print();
    } catch {
      /* lecteur PDF ou politique du navigateur */
    }
  };

  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (w) {
    scheduleRevoke();
    w.addEventListener('load', () => window.setTimeout(() => tryPrintWindow(w), 450), { once: true });
    window.setTimeout(() => tryPrintWindow(w), 1600);
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.title = 'Impression facture client';
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
