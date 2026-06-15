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
import { formatCurrency, formatDate } from '@/lib/utils';
import { EMAMA_TRANSIT_AR, transitLogoPublicUrl } from '@/lib/transitLogo';

const NAVY      = '#003366';
const NAVY_DARK = '#00244d';
const ACCENT    = '#e8f0f8';
const GREEN     = '#006633';
const MUTED     = '#555555';
const DIVIDER   = '#d0d8e4';

const PAD_X            = 32;
const FOOTER_BLOCK_PT  = 68;
const FOOTER_BOTTOM_PT = 10;

let cairoFontAttempted = false;
let cairoFontReady = false;

function ensureCreditCompteFonts(origin: string): boolean {
  if (cairoFontAttempted) return cairoFontReady;
  cairoFontAttempted = true;
  const base = origin.replace(/\/$/, '');
  try {
    Font.register({
      family: 'CairoCC',
      fonts: [
        { src: `${base}/fonts/Cairo-Regular.ttf` },
        { src: `${base}/fonts/Cairo-Bold.ttf`, fontWeight: 'bold' },
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

export interface CreditComptePdfModel {
  numero: string;
  clientNom: string;
  montant: number;
  date: string;
  reference?: string;
  description?: string;
}

const styles = StyleSheet.create({
  page: {
    position: 'relative',
    flexDirection: 'column',
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: FOOTER_BLOCK_PT + FOOTER_BOTTOM_PT,
    fontSize: 10,
    color: '#1a1a1a',
    fontFamily: 'CairoCC',
    backgroundColor: '#ffffff',
  },
  pageFallback: {
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
    backgroundColor: '#e6f4ec',
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#99d6b0',
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: GREEN,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  /* BODY */
  body: { flexDirection: 'column', paddingHorizontal: PAD_X, paddingTop: 24, flex: 1 },

  /* SECTION TITLE */
  sectionTitle: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: NAVY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },

  /* META GRID */
  metaGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
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
  metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  metaLabel: {
    fontSize: 7.5, color: NAVY, fontWeight: 'bold',
    textTransform: 'uppercase', letterSpacing: 0.4, width: 70, flexShrink: 0,
  },
  metaValue: { fontSize: 9.5, color: '#1a1a1a', flex: 1 },
  metaValueBold: { fontSize: 9.5, color: NAVY_DARK, fontWeight: 'bold', flex: 1 },

  /* CLIENT */
  clientBlock: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 20,
    borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, overflow: 'hidden',
  },
  clientTag: { backgroundColor: NAVY, paddingVertical: 10, paddingHorizontal: 14 },
  clientTagText: {
    fontSize: 8.5, color: '#ffffff', fontWeight: 'bold',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  clientNameText: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 14,
    fontSize: 11, fontWeight: 'bold', color: NAVY_DARK, textTransform: 'uppercase',
  },

  /* MONTANT BOX */
  montantSection: { marginBottom: 20 },
  montantBox: {
    backgroundColor: '#e6f4ec',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#99d6b0',
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  montantLabel: { fontSize: 10, color: GREEN, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  montantValue: { fontSize: 22, color: GREEN, fontWeight: 'bold' },
  montantCurrency: { fontSize: 12, color: GREEN, fontWeight: 'bold' },

  /* DESCRIPTION */
  descSection: { marginBottom: 20 },
  descBox: {
    backgroundColor: ACCENT, borderRadius: 4, borderLeftWidth: 3,
    borderLeftColor: DIVIDER, paddingVertical: 10, paddingHorizontal: 14,
  },
  descText: { fontSize: 9.5, color: '#333', lineHeight: 1.5 },

  /* DIVIDER */
  hr: { height: 1, backgroundColor: DIVIDER, marginBottom: 20 },

  /* SIGNATURES */
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  sigBox: { alignItems: 'center', gap: 32, width: '40%' },
  sigLabel: { fontSize: 9.5, color: NAVY, fontWeight: 'bold', textAlign: 'center' },
  sigLine: { width: '100%', height: 1, backgroundColor: NAVY },

  /* FOOTER */
  footerWrap: {
    position: 'absolute', bottom: FOOTER_BOTTOM_PT, left: 0, right: 0,
    paddingHorizontal: PAD_X, paddingTop: 8,
    borderTopWidth: 2, borderTopColor: NAVY,
  },
  footerInner: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  footerCol: { flex: 1 },
  footerLabel: {
    fontSize: 7, color: NAVY, fontWeight: 'bold',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
  },
  footerText: { fontSize: 7.5, color: MUTED, lineHeight: 1.45 },
  footerCenter: { flex: 2, alignItems: 'center' },
  footerCenterBold: { fontSize: 8, color: NAVY, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  footerCenterText: { fontSize: 7.5, color: MUTED, textAlign: 'center', lineHeight: 1.45 },
});

function CreditComptePdfPage({
  model,
  logoUrl,
  useCairo,
}: {
  model: CreditComptePdfModel;
  logoUrl: string;
  useCairo: boolean;
}) {
  const pageStyle = useCairo ? styles.page : styles.pageFallback;

  return (
    <Page size="A4" style={pageStyle}>

      {/* HEADER */}
      <View style={styles.headerBand}>
        <View style={styles.headerLeft}>
          <Image src={logoUrl} style={styles.headerLogo} />
          <View style={styles.headerCompany}>
            <Text style={styles.headerFr}>SNTS</Text>
            <Text style={styles.headerAr}>{EMAMA_TRANSIT_AR}</Text>
          </View>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>Crédit Compte</Text>
        </View>
      </View>

      {/* BODY */}
      <View style={styles.body}>

        {/* META: N° + Date */}
        <View style={styles.metaGrid}>
          <View style={styles.metaCard}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>N° Reçu</Text>
              <Text style={styles.metaValueBold}>{model.numero}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{model.date}</Text>
            </View>
          </View>

          {model.reference ? (
            <View style={styles.metaCard}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Référence</Text>
                <Text style={styles.metaValue}>{model.reference}</Text>
              </View>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
        </View>

        {/* CLIENT */}
        <View style={styles.clientBlock}>
          <View style={styles.clientTag}>
            <Text style={styles.clientTagText}>Client</Text>
          </View>
          <Text style={styles.clientNameText}>{model.clientNom}</Text>
        </View>

        {/* MONTANT */}
        <View style={styles.montantSection}>
          <Text style={styles.sectionTitle}>Montant crédité</Text>
          <View style={styles.montantBox}>
            <Text style={styles.montantLabel}>Total Crédit Compte</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={styles.montantValue}>{amountNum(model.montant)}</Text>
              <Text style={styles.montantCurrency}>MRU</Text>
            </View>
          </View>
        </View>

        {/* DESCRIPTION */}
        {model.description ? (
          <View style={styles.descSection}>
            <Text style={styles.sectionTitle}>Observations</Text>
            <View style={styles.descBox}>
              <Text style={styles.descText}>{model.description}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.hr} />

        {/* SIGNATURES */}
        <View style={styles.sigRow}>
          <View style={styles.sigBox}>
            <Text style={styles.sigLabel}>Le Client</Text>
            <View style={styles.sigLine} />
          </View>
          <View style={styles.sigBox}>
            <Text style={styles.sigLabel}>Le Directeur</Text>
            <View style={styles.sigLine} />
          </View>
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

export function CreditComptePdfDocument({
  model,
  logoUrl,
  useCairo = true,
}: {
  model: CreditComptePdfModel;
  logoUrl: string;
  useCairo?: boolean;
}) {
  return (
    <Document title={`Crédit Compte ${model.numero}`}>
      <CreditComptePdfPage model={model} logoUrl={logoUrl} useCairo={useCairo} />
    </Document>
  );
}

export function buildCreditComptePdfModel(
  doc: Pick<CreditComptePdfModel, 'numero' | 'clientNom' | 'montant' | 'date' | 'reference' | 'description'>
): CreditComptePdfModel {
  return {
    numero: doc.numero,
    clientNom: doc.clientNom,
    montant: doc.montant,
    date: typeof doc.date === 'string'
      ? doc.date
      : formatDate(doc.date as unknown as Date) || '',
    reference: doc.reference,
    description: doc.description,
  };
}

async function creditComptePdfBlob(model: CreditComptePdfModel, origin: string): Promise<Blob> {
  const useCairo = ensureCreditCompteFonts(origin);
  const logoUrl = transitLogoPublicUrl(origin);
  return pdf(
    <CreditComptePdfDocument model={model} logoUrl={logoUrl} useCairo={useCairo} />
  ).toBlob();
}

export async function downloadCreditComptePdf(model: CreditComptePdfModel, origin: string) {
  const blob = await creditComptePdfBlob(model, origin);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `credit-compte-${model.numero.replace(/[^\w.-]+/g, '_')}.pdf`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 90_000);
}

export async function printCreditComptePdf(model: CreditComptePdfModel, origin: string) {
  const blob = await creditComptePdfBlob(model, origin);
  const url = URL.createObjectURL(blob);

  const scheduleRevoke = () => window.setTimeout(() => URL.revokeObjectURL(url), 180_000);
  const tryPrint = (w: Window) => {
    try { w.focus(); w.print(); } catch { /* */ }
  };

  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (w) {
    scheduleRevoke();
    w.addEventListener('load', () => window.setTimeout(() => tryPrint(w), 450), { once: true });
    window.setTimeout(() => tryPrint(w), 1600);
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.title = 'Impression crédit compte';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  iframe.src = url;
  iframe.onload = () => {
    window.setTimeout(() => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* */ }
    }, 350);
    scheduleRevoke();
    window.setTimeout(() => iframe.remove(), 180_000);
  };
  document.body.appendChild(iframe);
}
