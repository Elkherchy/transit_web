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

const NAVY = '#003366';
const FOOTER = '#1a1a1a';
const TABLE_TOTAL_BG = '#cce5f7';

const TABLE_ROW_TARGET = 10;

/** Marges latérales (pt) — cohérentes corps / pied de page. */
const PAD_X = 28;
const PAD_TOP = 16;
/** Espace réservé + position du bloc pied de page (pt). */
const FOOTER_BLOCK_PT = 76;
const FOOTER_BOTTOM_PT = 12;

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

const styles = StyleSheet.create({
  page: {
    position: 'relative',
    flexDirection: 'column',
    paddingTop: PAD_TOP,
    paddingHorizontal: PAD_X,
    paddingBottom: FOOTER_BLOCK_PT + FOOTER_BOTTOM_PT,
    fontSize: 10,
    color: '#111',
    fontFamily: 'CairoFacture',
  },
  pageHelveticaFallback: {
    position: 'relative',
    flexDirection: 'column',
    paddingTop: PAD_TOP,
    paddingHorizontal: PAD_X,
    paddingBottom: FOOTER_BLOCK_PT + FOOTER_BOTTOM_PT,
    fontSize: 10,
    color: '#111',
    fontFamily: 'Helvetica',
  },
  body: {
    flexDirection: 'column',
    width: '100%',
  },
  /** Une ligne : FR (gauche) | logo (centre) | AR (droite) */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: NAVY,
    gap: 6,
  },
  headerLogoWrap: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 36,
    height: 36,
    objectFit: 'contain',
  },
  headerTitleFr: {
    flexGrow: 1,
    flexBasis: 0,
    fontSize: 10,
    fontWeight: 'bold',
    color: NAVY,
    textTransform: 'uppercase',
    textAlign: 'left',
    lineHeight: 1.2,
  },
  headerTitleAr: {
    flexGrow: 1,
    flexBasis: 0,
    fontSize: 8.5,
    fontWeight: 'bold',
    color: NAVY,
    textAlign: 'right',
    lineHeight: 1.25,
  },
  label: {
    color: NAVY,
    fontWeight: 'bold',
    textDecoration: 'underline',
    fontSize: 9,
  },
  metaValue: {
    fontSize: 9,
    lineHeight: 1.35,
  },
  metaBlock: {
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 5,
  },
  metaBankily: {
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    alignItems: 'center',
  },
  metaBankilyText: {
    fontSize: 9,
    color: NAVY,
    textAlign: 'center',
    lineHeight: 1.3,
  },
  metaCell: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderColor: '#000',
  },
  metaCellLast: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 5,
  },
  clientBlock: {
    fontSize: 11,
    lineHeight: 1.4,
    marginBottom: 7,
    marginTop: 3,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  clientLabel: {
    color: NAVY,
    fontStyle: 'italic',
    fontSize: 10.5,
  },
  clientName: {
    color: NAVY,
    fontWeight: 'bold',
    textDecoration: 'underline',
    textTransform: 'uppercase',
    fontSize: 11,
  },
  tableHeader: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: '#f5f5f5',
  },
  th: {
    paddingVertical: 5,
    paddingHorizontal: 3,
    fontSize: 7.5,
    lineHeight: 1.25,
    color: NAVY,
    fontWeight: 'bold',
    borderRightWidth: 1,
    borderColor: '#000',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    minHeight: 18,
  },
  cell: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 9,
    lineHeight: 1.25,
    borderRightWidth: 1,
    borderColor: '#000',
  },
  cellLast: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 9,
    lineHeight: 1.25,
  },
  totalRow: {
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    backgroundColor: TABLE_TOTAL_BG,
  },
  totalRowLabel: {
    width: '78%',
    paddingVertical: 6,
    paddingHorizontal: 5,
    fontSize: 9,
    lineHeight: 1.2,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'right',
    borderRightWidth: 1,
    borderColor: '#000',
  },
  totalRowVal: {
    width: '22%',
    paddingVertical: 6,
    paddingHorizontal: 5,
    fontSize: 9,
    lineHeight: 1.2,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  sign: {
    marginTop: 14,
    textAlign: 'right',
    fontSize: 10.5,
    lineHeight: 1.2,
    color: NAVY,
    fontWeight: 'bold',
    paddingRight: 16,
  },
  interetLabel: {
    width: '45%',
    fontSize: 9,
    lineHeight: 1.3,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  interetBox: {
    width: '20%',
    marginLeft: 4,
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 9,
    lineHeight: 1.2,
    textAlign: 'right',
  },
  footerWrap: {
    position: 'absolute',
    bottom: FOOTER_BOTTOM_PT,
    left: PAD_X,
    right: PAD_X,
    paddingTop: 6,
    borderTopWidth: 0.75,
    borderTopColor: '#bbb',
  },
  footer: {
    fontSize: 8,
    lineHeight: 1.38,
    textAlign: 'center',
    color: FOOTER,
  },
  footerBlue: {
    color: NAVY,
    marginBottom: 2,
    lineHeight: 1.38,
    fontSize: 8,
  },
  footerLine: {
    marginTop: 2,
    lineHeight: 1.38,
    fontSize: 8,
  },
});

const COL_DESIGNATION = '46%';
const COL_QTY = '10%';
const COL_PU = '22%';
const COL_PT = '22%';

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

  return (
    <Page size="A4" style={pageStyle}>
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitleFr}>SNTS</Text>
          <View style={styles.headerLogoWrap}>
            <Image src={logoUrl} style={styles.headerLogo} />
          </View>
          <Text style={styles.headerTitleAr}>{EMAMA_TRANSIT_AR}</Text>
        </View>

        <View style={styles.metaBlock}>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000' }}>
            <View style={{ ...styles.metaCell, flexGrow: 1, flexBasis: 0 }}>
              <Text style={styles.metaValue}>
                <Text style={styles.label}>Produit facturé :</Text> {model.produitFacture || ''}
              </Text>
            </View>
            <View style={{ ...styles.metaCell, flexGrow: 1, flexBasis: 0 }}>
              <Text style={styles.metaValue}>
                <Text style={styles.label}>BL :</Text> {model.blNumber || ''}
              </Text>
            </View>
            <View style={{ ...styles.metaCellLast, flexGrow: 1, flexBasis: 0 }}>
              <Text style={styles.metaValue}>
                <Text style={styles.label}>Date :</Text> {model.issueDate || ''}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ ...styles.metaCell, flexGrow: 2, flexBasis: 0, borderBottomWidth: 0 }}>
              <Text style={styles.metaValue}>
                <Text style={styles.label}>Facture N° :</Text> {model.factureNum || ''}
              </Text>
            </View>
            <View style={{ ...styles.metaCellLast, flexGrow: 1, flexBasis: 0 }}>
              <Text style={styles.metaValue}>
                <Text style={styles.label}>Fiche N° :</Text> {model.ficheNum || ''}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.clientBlock} wrap={false}>
          <Text style={styles.clientLabel}>Client : </Text>
          <Text style={styles.clientName}>{model.clientName || ''}</Text>
        </View>

        <View style={styles.tableHeader}>
          <Text style={{ ...styles.th, width: COL_DESIGNATION }}>Désignation</Text>
          <Text style={{ ...styles.th, width: COL_QTY }}>Quantité</Text>
          <Text style={{ ...styles.th, width: COL_PU }}>Prix Unitaire{'\n'}(en N-UM)</Text>
          <Text style={{ ...styles.th, width: COL_PT, borderRightWidth: 0 }}>
            Prix Total{'\n'}(en N-UM)
          </Text>
        </View>

        {rows.map((line, idx) => {
          const hasLine = Boolean(line.produit?.trim()) || line.montant > 0;
          return (
            <View key={idx} style={styles.row} wrap={false}>
              <Text style={{ ...styles.cell, width: COL_DESIGNATION, textAlign: 'left', paddingLeft: 6 }} wrap>
                {line.produit}
              </Text>
              <Text style={{ ...styles.cell, width: COL_QTY, textAlign: 'right', paddingRight: 6 }}>
                {''}
              </Text>
              <Text style={{ ...styles.cell, width: COL_PU, textAlign: 'right', paddingRight: 6 }}>
                {''}
              </Text>
              <Text style={{ ...styles.cellLast, width: COL_PT, textAlign: 'right', paddingRight: 6 }}>
                {hasLine ? amountNum(line.montant) : ''}
              </Text>
            </View>
          );
        })}


        <Text style={styles.sign}>Le Directeur</Text>
      </View>

      <View style={styles.footerWrap} fixed>
        <View style={styles.footer}>
          <Text style={styles.footerBlue}>
            Tél. (الهاتف) : +222 46 91 19 19 --- mobile : 36 31 10 37 +
          </Text>
          <Text style={{ ...styles.footerBlue, textDecoration: 'underline' }}>
            E-mail (البريد الالكتروني) : contact@snts.mr - site web (الموقع) : www.snts.mr
          </Text>
          <Text style={styles.footerLine}>
            Siège : Avenue Elmoukhtar Ould DADAH, en face de la mosquée de Quba
          </Text>
          <Text style={styles.footerLine}>المقر: شارع المختار ولد داداه، قبالة مسجد قباء</Text>
          <Text style={{ ...styles.footerLine, fontWeight: 'bold' }}>
            Nouakchott-Mauritanie === نواكشوط موريتانيا
          </Text>
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

/** Télécharge le fichier PDF sur l’appareil. */
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
/**
 * Ouvre la boîte de dialogue d’impression du navigateur pour le PDF.
 * Utilise une nouvelle fenêtre (plus fiable avec le lecteur PDF intégré) ; repli iframe si pop-up bloqué.
 */
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

