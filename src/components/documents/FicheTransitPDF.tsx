import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { formatCurrency } from '@/lib/utils';

const NAVY = '#123454';
const ACCENT = '#167D9A';
const BORDER = '#DCE5ED';
const MUTED = '#5B6B7C';
const TABLE_ROW_TARGET = 6;
const PAD_X = 30;
const FOOTER_BLOCK_PT = 54;
const FOOTER_BOTTOM_PT = 20;

export interface FicheTransitLine {
  designation: string;
  montant: number;
  responsable?: string;
  date?: string;
}

export interface FicheTransitData {
  ficheNumber: string;
  declarNumber?: string;
  factureNumber: string;
  objet: string;
  blNumber: string;
  client: string;
  nombreConteneurs?: string;
  date: string;
  lines: FicheTransitLine[];
  totalOperations: number;
  interet?: number;
  total: number;
}

function amountNum(v: number): string {
  return formatCurrency(v).replace('MRU', '').trim();
}

type PaddedRow = { designationNom: string; montant: number; date?: string };

function padLines(lines: PaddedRow[]): PaddedRow[] {
  const n = Math.max(0, TABLE_ROW_TARGET - lines.length);
  const empty: PaddedRow = { designationNom: '', montant: 0, date: '' };
  return [...lines, ...Array.from({ length: n }, () => ({ ...empty }))];
}

const baseStyles = StyleSheet.create({
  page: {
    position: 'relative',
    minHeight: 841.89,
    maxHeight: 841.89,
    paddingTop: 28,
    paddingHorizontal: PAD_X,
    paddingBottom: FOOTER_BLOCK_PT + FOOTER_BOTTOM_PT,
    fontSize: 10,
    lineHeight: 1.45,
    color: '#24374A',
    fontFamily: 'Cairo',
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, height: 76, flexShrink: 0,
    paddingBottom: 14, marginBottom: 18,
    borderBottomWidth: 2, borderBottomColor: ACCENT,
  },
  headerLogo: { width: 58, height: 58, objectFit: 'contain' },
  headerBrand: { flex: 1 },
  headerTitleFr: { fontSize: 24, fontWeight: 'bold', color: NAVY, lineHeight: 1.2 },
  headerSubtitle: { fontSize: 9, color: MUTED, marginTop: 3 },
  metaBlock: { borderWidth: 1, borderColor: BORDER, borderRadius: 6, marginBottom: 12 },
  metaRow: { flexDirection: 'row' },
  metaRowDivider: { borderBottomWidth: 1, borderBottomColor: BORDER },
  metaCell: { flex: 1, paddingHorizontal: 10, paddingVertical: 8 },
  metaDivider: { borderRightWidth: 1, borderRightColor: BORDER },
  label: { fontSize: 8, color: MUTED, marginBottom: 3 },
  metaValue: { fontSize: 10, fontWeight: 'bold', color: NAVY },
  clientBlock: {
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16,
    backgroundColor: '#F0F6FA', borderLeftWidth: 3, borderLeftColor: ACCENT,
  },
  clientName: { fontSize: 13, fontWeight: 'bold', color: NAVY },
  tableHeader: { flexDirection: 'row', backgroundColor: NAVY },
  th: { paddingHorizontal: 9, paddingVertical: 8, fontSize: 9, color: '#FFFFFF', fontWeight: 'bold' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, minHeight: 26 },
  rowAlternate: { backgroundColor: '#F5F8FB' },
  cell: { paddingHorizontal: 9, paddingVertical: 5, fontSize: 10 },
  amountCell: { fontWeight: 'bold', textAlign: 'right' },
  totalRow: {
    flexDirection: 'row', backgroundColor: '#EAF2F8',
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  totalRowLabel: { width: '55%', padding: 10, fontSize: 10, color: NAVY, fontWeight: 'bold' },
  totalRowVal: { width: '27%', padding: 10, fontSize: 11, color: NAVY, fontWeight: 'bold', textAlign: 'right' },
  summary: { width: '55%', alignSelf: 'flex-end', marginTop: 12 },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 7 },
  summaryLabel: { flex: 1, fontSize: 10, fontWeight: 'bold' },
  summaryValue: { fontSize: 11, fontWeight: 'bold', textAlign: 'right' },
  grandTotal: { backgroundColor: NAVY, color: '#FFFFFF', borderRadius: 4 },
  signBlock: { alignSelf: 'flex-end', width: 150, marginTop: 22, minHeight: 54 },
  sign: { textAlign: 'center', fontSize: 11, color: NAVY, fontWeight: 'bold' },
  signLine: { borderTopWidth: 1, borderTopColor: BORDER, marginTop: 32 },
  footerWrap: {
    position: 'absolute', bottom: FOOTER_BOTTOM_PT, left: PAD_X, right: PAD_X, height: 44, flexShrink: 0,
    borderTopWidth: 2, borderTopColor: ACCENT, paddingTop: 10,
  },
  footerContact: { fontSize: 8, fontWeight: 'bold', color: NAVY, textAlign: 'center', lineHeight: 1.5 },
  footerAddress: { fontSize: 6.5, color: MUTED, textAlign: 'center', lineHeight: 1.5, marginTop: 4 },
});

export function FicheTransitPDF({
  data,
  headerImagePath,
}: {
  data: FicheTransitData;
  /** Chemin absolu vers `public/transit-logo.png` (logo compact). */
  headerImagePath: string;
}) {
  const rows = padLines(
    (data.lines || []).map((l) => ({
      designationNom: l.designation,
      montant: typeof l.montant === 'number' ? l.montant : 0,
      date: l.date || '',
    }))
  );

  const interet = typeof data.interet === 'number' ? data.interet : 0;

  // Reserve a conservative height for wrapped Cairo text before scaling the
  // complete content block. Keep every operation and the footer on one A4 page.
  const textLines = (value: string, charactersPerLine: number) =>
    value.split(/\r?\n/).reduce((count, part) => count + Math.max(1, Math.ceil(part.length / charactersPerLine)), 0);
  const rowsHeight = rows.reduce((height, row) => height + 14 + 21 * Math.max(
    textLines(row.designationNom, 38),
    textLines(row.date || '', 12),
    textLines(row.designationNom ? amountNum(row.montant) : '', 18),
  ), 0);
  const metaHeight = 23 * (
    Math.max(...[data.objet, data.blNumber, data.date].map((value) => textLines(value || '', 20))) +
    Math.max(...[data.factureNumber, data.nombreConteneurs].map((value) => textLines(value || '', 30)))
  );
  const estimatedHeight = 280 + metaHeight + 28 * textLines(data.client || '', 45) + rowsHeight + (interet > 0 ? 90 : 0);
  const availableHeight = 841.89 - 28 - FOOTER_BLOCK_PT - FOOTER_BOTTOM_PT;
  const contentScale = Math.min(1, availableHeight / estimatedHeight);
  const styles = Object.fromEntries(Object.entries(baseStyles).map(([name, style]) => [
    name,
    name === 'page' || name.startsWith('footer') ? style : Object.fromEntries(
      Object.entries(style).map(([property, value]) => [property,
        typeof value === 'number' && property !== 'flex' && property !== 'flexShrink' && property !== 'lineHeight'
          ? value * contentScale : value,
      ]),
    ),
  ])) as typeof baseStyles;

  return (
    <Document title={`Transit ${data.blNumber || data.factureNumber || ''}`}>
      <Page size="A4" style={styles.page} wrap={false}>
        <View style={{
          position: 'absolute',
          top: 28,
          left: PAD_X,
          width: 595.28 - 2 * PAD_X,
          fontSize: 10 * contentScale,
          lineHeight: 1.45,
          flexShrink: 0,
        }}>
          <View style={styles.headerRow} wrap={false}>
            <View style={styles.headerBrand}>
              <Text style={styles.headerTitleFr}>SNTS</Text>
              <Text style={styles.headerSubtitle}>TRANSIT &amp; LOGISTIQUE</Text>
            </View>
            <Image src={headerImagePath} style={styles.headerLogo} />
            <View style={styles.headerBrand} />
          </View>

          <View style={styles.metaBlock} wrap={false}>
            <View style={[styles.metaRow, styles.metaRowDivider]}>
              <View style={[styles.metaCell, styles.metaDivider]}>
                <Text style={styles.label}>OBJET</Text>
                <Text style={styles.metaValue}>{data.objet || '-'}</Text>
              </View>
              <View style={[styles.metaCell, styles.metaDivider]}>
                <Text style={styles.label}>CONNAISSEMENT / BL</Text>
                <Text style={styles.metaValue}>{data.blNumber || '-'}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.label}>DATE</Text>
                <Text style={styles.metaValue}>{data.date || '-'}</Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <View style={[styles.metaCell, styles.metaDivider]}>
                <Text style={styles.label}>FACTURE N°</Text>
                <Text style={styles.metaValue}>{data.factureNumber || '-'}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.label}>NOMBRE DE CONTENEURS</Text>
                <Text style={styles.metaValue}>{data.nombreConteneurs || '-'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.clientBlock} wrap={false}>
            <Text style={styles.label}>CLIENT</Text>
            <Text style={styles.clientName}>{data.client || '-'}</Text>
          </View>

          <View>
            <View style={styles.tableHeader}>
              <Text style={{ ...styles.th, width: '55%' }}>Désignation</Text>
              <Text style={{ ...styles.th, width: '27%', textAlign: 'right' }}>Montant (N-UM)</Text>
              <Text style={{ ...styles.th, width: '18%', textAlign: 'center' }}>Date</Text>
            </View>
          </View>

          {rows.map((line, idx) => (
            <View key={idx} style={[styles.row, ...(idx % 2 === 1 ? [styles.rowAlternate] : [])]} wrap={false}>
              <Text style={{ ...styles.cell, width: '55%' }}>{line.designationNom}</Text>
              <Text style={{ ...styles.cell, ...styles.amountCell, width: '27%' }}>
                {line.designationNom ? amountNum(line.montant || 0) : ''}
              </Text>
              <Text style={{ ...styles.cell, width: '18%', textAlign: 'center', fontSize: 9 * contentScale }}>
                {line.date || ''}
              </Text>
            </View>
          ))}

          <View wrap={false}>
            <View style={styles.totalRow}>
              <Text style={styles.totalRowLabel}>Total des opérations</Text>
              <Text style={styles.totalRowVal}>{amountNum(data.totalOperations)}</Text>
            </View>
            {interet > 0 ? (
              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Intérêt</Text>
                  <Text style={styles.summaryValue}>{amountNum(interet)}</Text>
                </View>
                <View style={[styles.summaryRow, styles.grandTotal]}>
                  <Text style={styles.summaryLabel}>Total (MRU)</Text>
                  <Text style={styles.summaryValue}>{data.total > 0 ? amountNum(data.total) : ''}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.signBlock}>
              <Text style={styles.sign}>Le Directeur</Text>
              <View style={styles.signLine} />
            </View>
          </View>

        </View>

        <View style={styles.footerWrap} fixed wrap={false}>
          <Text style={styles.footerContact}>
            +222 46 91 19 19 | +222 36 31 10 37 | contact@snts.mr | www.snts.mr
          </Text>
          <Text style={styles.footerAddress}>
            Av. Elmoukhtar Ould DADAH, face à la mosquée de Quba | شارع المختار ولد داداه، قبالة مسجد قباء | Nouakchott - Mauritanie
          </Text>
        </View>
      </Page>
    </Document>
  );
}
