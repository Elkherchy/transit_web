import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { formatCurrency } from '@/lib/utils';
import { EMAMA_TRANSIT_AR } from '@/lib/transitLogo';

const NAVY = '#003366';
const FOOTER = '#1a1a1a';
const BANKILY_LINE = 'Bankily,Masrivi : 36351198';
const TABLE_TOTAL_BG = '#cce5f7';
const TABLE_ROW_TARGET = 8;

const PAD_X = 22;
const PAD_TOP = 22;
const FOOTER_BLOCK_PT = 76;
const FOOTER_BOTTOM_PT = 10;

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

const styles = StyleSheet.create({
  page: {
    position: 'relative',
    flexDirection: 'column',
    paddingTop: PAD_TOP,
    paddingHorizontal: PAD_X,
    paddingBottom: FOOTER_BLOCK_PT + FOOTER_BOTTOM_PT,
    fontSize: 9,
    color: '#111',
    fontFamily: 'Cairo',
  },
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
  metaCell: {
    flex: 1,
    padding: 4,
    borderRightWidth: 1,
    borderColor: '#000',
    fontSize: 8,
  },
  metaCellLast: {
    flex: 1,
    padding: 4,
    fontSize: 8,
  },
  label: {
    color: NAVY,
    fontWeight: 'bold',
    textDecoration: 'underline',
  },
  clientBlock: {
    fontSize: 11,
    marginBottom: 6,
    marginTop: 2,
  },
  clientLabel: {
    color: NAVY,
    fontWeight: 'bold',
  },
  clientName: {
    color: NAVY,
    fontStyle: 'italic',
    textDecoration: 'underline',
  },
  metaBlock: {
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 4,
  },
  metaBankily: {
    padding: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    alignItems: 'center',
  },
  metaBankilyText: {
    fontSize: 8,
    color: NAVY,
    textAlign: 'center',
  },
  tableHeader: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: '#f5f5f5',
  },
  th: {
    padding: 3,
    fontSize: 8,
    color: NAVY,
    fontWeight: 'bold',
    borderRightWidth: 1,
    borderColor: '#000',
  },
  row: {
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    minHeight: 14,
  },
  cell: {
    padding: 2,
    fontSize: 8,
    borderRightWidth: 1,
    borderColor: '#000',
  },
  cellLast: {
    padding: 2,
    fontSize: 8,
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
    padding: 4,
    fontSize: 8,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'right',
    borderRightWidth: 1,
    borderColor: '#000',
  },
  totalRowVal: {
    width: '22%',
    padding: 4,
    fontSize: 8,
    color: NAVY,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  sign: {
    marginTop: 4,
    textAlign: 'right',
    fontSize: 10,
    color: NAVY,
    fontWeight: 'bold',
    paddingRight: 16,
  },
  footerWrap: {
    position: 'absolute',
    bottom: FOOTER_BOTTOM_PT,
    left: PAD_X,
    right: PAD_X,
    paddingTop: 4,
  },
  footer: {
    fontSize: 7,
    lineHeight: 1.15,
    textAlign: 'center',
    color: FOOTER,
  },
  footerBlue: {
    color: NAVY,
    marginBottom: 0,
    lineHeight: 1.15,
  },
  footerLine: {
    marginTop: 1,
    lineHeight: 1.15,
  },
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

  return (
    <Document title={`Transit ${data.blNumber || data.factureNumber || ''}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitleFr}>SNTS</Text>
          <View style={styles.headerLogoWrap}>
            <Image src={headerImagePath} style={styles.headerLogo} />
          </View>
          <Text style={styles.headerTitleAr}>{EMAMA_TRANSIT_AR}</Text>
        </View>

        <View style={styles.metaBlock}>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000' }}>
            <View style={{ ...styles.metaCell, flexGrow: 1, flexBasis: 0 }}>
              <Text>
                <Text style={styles.label}>Objet :</Text> {data.objet || ''}
              </Text>
            </View>
            <View style={{ ...styles.metaCell, flexGrow: 1, flexBasis: 0 }}>
              <Text>
                <Text style={styles.label}>BL :</Text> {data.blNumber || ''}
              </Text>
            </View>
            <View style={{ ...styles.metaCellLast, flexGrow: 1, flexBasis: 0 }}>
              <Text>
                <Text style={styles.label}>Date :</Text> {data.date || ''}
              </Text>
            </View>
          </View>
          <View style={styles.metaBankily}>
            <Text style={styles.metaBankilyText}>{BANKILY_LINE}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ ...styles.metaCell, flexGrow: 2, flexBasis: 0, borderBottomWidth: 0 }}>
              <Text>
                <Text style={styles.label}>Facture N° :</Text> {data.factureNumber || ''}
              </Text>
            </View>
            <View style={{ ...styles.metaCellLast, flexGrow: 1, flexBasis: 0 }}>
              <Text>
                <Text style={styles.label}>Fiche N° :</Text> {data.ficheNumber || data.declarNumber || ''}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.clientBlock}>
          <Text style={styles.clientLabel}>Client : </Text>
          <Text style={styles.clientName}>{data.client || ''}</Text>
        </Text>

        <View style={styles.tableHeader}>
          <Text style={{ ...styles.th, width: '50%', textAlign: 'left', paddingLeft: 4 }}>Désignation</Text>
          <Text style={{ ...styles.th, width: '25%', textAlign: 'center' }}>
            Montant (en N-UM)
          </Text>
          <Text style={{ ...styles.th, width: '25%', textAlign: 'center', borderRightWidth: 0 }}>
            Date
          </Text>
        </View>

        {rows.map((line, idx) => (
          <View key={idx} style={styles.row} wrap={false}>
            <Text style={{ ...styles.cell, width: '50%' }} wrap>
              {line.designationNom}
            </Text>
            <Text style={{ ...styles.cell, width: '25%', textAlign: 'center' }}>
              {line.designationNom ? amountNum(line.montant || 0) : ''}
            </Text>
            <Text style={{ ...styles.cellLast, width: '25%', textAlign: 'center' }}>
              {line.date || ''}
            </Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalRowLabel}>Total</Text>
          <Text style={styles.totalRowVal}>{amountNum(data.totalOperations)}</Text>
        </View>

        {interet > 0 ? (
          <View>
            <View style={{ flexDirection: 'row', marginTop: 2, paddingLeft: 4 }}>
              <Text style={{ width: '45%', fontSize: 8, color: NAVY, fontWeight: 'bold', textAlign: 'right' }}>
                Intérêt :
              </Text>
              <Text
                style={{
                  width: '20%',
                  marginLeft: 4,
                  borderWidth: 1,
                  borderColor: '#000',
                  padding: 2,
                  fontSize: 8,
                  textAlign: 'center',
                }}
              >
                {formatCurrency(interet).replace('MRU', '').trim()}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 2, paddingLeft: 4 }}>
              <Text style={{ width: '45%', fontSize: 8, color: NAVY, fontWeight: 'bold', textAlign: 'right' }}>
                Total :
              </Text>
              <Text
                style={{
                  width: '20%',
                  marginLeft: 4,
                  borderWidth: 1,
                  borderColor: '#000',
                  padding: 2,
                  fontSize: 8,
                  fontWeight: 'bold',
                  textAlign: 'center',
                }}
              >
                {data.total > 0 ? formatCurrency(data.total).replace('MRU', '').trim() : ''}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.sign}>Le Directeur</Text>

        <View style={styles.footerWrap} fixed>
          <View style={styles.footer}>
            <Text style={styles.footerBlue}>
              Tél.(الهاتف): +222 45 29 57 23 --- mobile : 36 35 11 98 +
            </Text>
            <Text style={{ ...styles.footerBlue, textDecoration: 'underline' }}>
              E-mail (البريد الإلكتروني) : contact@ets-emama.com - site web (الموقع) : www.groupe-emama.com
            </Text>
            <Text style={styles.footerLine}>
              Siège : Avenue Elmoukhtar Ould DADAH, en face de la Banque mondiale
            </Text>
            <Text style={styles.footerLine}>المقر: شارع المختار ولد داداه، قبالة البنك الدولي</Text>
            <Text style={{ ...styles.footerLine, fontWeight: 'bold' }}>
              Nouakchott-Mauritanie === نواكشوط-موريتانيا
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
