'use client';

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  pdf,
} from '@react-pdf/renderer';
import type { PrintableTransitModel } from '@/components/transit/PrintableTransitDoc';
import { formatCurrency } from '@/lib/utils';
import { EMAMA_TRANSIT_AR, transitLogoPublicUrl } from '@/lib/transitLogo';

const NAVY = '#003366';
const FOOTER = '#1a1a1a';
const BANKILY_LINE = 'Bankily,Masrivi : 36351198';
const TABLE_TOTAL_BG = '#cce5f7';

const PAD_X = 22;
/** Espace réservé + position du bloc pied de page (pt), aligné sur la facture client PDF */
const FOOTER_BLOCK_PT = 76;
const FOOTER_BOTTOM_PT = 10;

const TABLE_ROW_TARGET = 8;

function amountNum(v: number): string {
  return formatCurrency(v).replace('MRU', '').trim();
}

const styles = StyleSheet.create({
  page: {
    position: 'relative',
    flexDirection: 'column',
    paddingTop: 6,
    paddingHorizontal: PAD_X,
    paddingBottom: FOOTER_BLOCK_PT + FOOTER_BOTTOM_PT,
    fontSize: 9,
    color: '#111',
    fontFamily: 'Helvetica',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
    paddingBottom: 5,
    borderBottomWidth: 2,
    borderBottomColor: NAVY,
    gap: 5,
  },
  headerLogoWrap: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 34,
    height: 34,
    objectFit: 'contain',
  },
  headerTitleFr: {
    flexGrow: 1,
    flexBasis: 0,
    fontSize: 9,
    fontWeight: 'bold',
    color: NAVY,
    textTransform: 'uppercase',
    textAlign: 'left',
    lineHeight: 1.2,
  },
  headerTitleAr: {
    flexGrow: 1,
    flexBasis: 0,
    fontSize: 8,
    fontWeight: 'bold',
    color: NAVY,
    textAlign: 'right',
    lineHeight: 1.25,
  },
  metaRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 4,
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
    marginTop: 6,
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

function padLines(lines: PrintableTransitModel['lines']) {
  const n = Math.max(0, TABLE_ROW_TARGET - lines.length);
  const empty = { designationNom: '', montant: 0, responsable: '', date: undefined as string | Date | undefined };
  return [...lines, ...Array.from({ length: n }, () => ({ ...empty }))];
}

function TransitPdfPage({
  model,
  logoUrl,
}: {
  model: PrintableTransitModel;
  logoUrl: string;
}) {
  const rows = padLines(model.lines || []);

  return (
    <Page size="A4" style={styles.page}>
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
            <Text>
              <Text style={styles.label}>Objet :</Text> {model.objet || ''}
            </Text>
          </View>
          <View style={{ ...styles.metaCell, flexGrow: 1, flexBasis: 0 }}>
            <Text>
              <Text style={styles.label}>BL :</Text> {model.blNumber || ''}
            </Text>
          </View>
          <View style={{ ...styles.metaCellLast, flexGrow: 1, flexBasis: 0 }}>
            <Text>
              <Text style={styles.label}>Date :</Text> {model.issueDate || ''}
            </Text>
          </View>
        </View>
        <View style={styles.metaBankily}>
          <Text style={styles.metaBankilyText}>{BANKILY_LINE}</Text>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ ...styles.metaCell, flexGrow: 2, flexBasis: 0, borderBottomWidth: 0 }}>
            <Text>
              <Text style={styles.label}>Facture N° :</Text> {model.factureNum || ''}
            </Text>
          </View>
          <View style={{ ...styles.metaCellLast, flexGrow: 1, flexBasis: 0 }}>
            <Text>
              <Text style={styles.label}>Fiche N° :</Text>{' '}
              {model.ficheNumber || model.declarNumber || ''}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.clientBlock}>
        <Text style={styles.clientLabel}>Client : </Text>
        <Text style={styles.clientName}>{model.clientName || ''}</Text>
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

      {rows.map((line, idx) => {
        const d = line.date ? new Date(line.date) : null;
        const dateStr =
          d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR') : '';
        return (
          <View key={idx} style={styles.row} wrap={false}>
            <Text style={{ ...styles.cell, width: '50%' }} wrap>
              {line.designationNom}
            </Text>
            <Text style={{ ...styles.cell, width: '25%', textAlign: 'center' }}>
              {line.designationNom ? amountNum(line.montant || 0) : ''}
            </Text>
            <Text style={{ ...styles.cellLast, width: '25%', textAlign: 'center' }}>
              {dateStr}
            </Text>
          </View>
        );
      })}

      <View style={styles.totalRow}>
        <Text style={styles.totalRowLabel}>Total</Text>
        <Text style={styles.totalRowVal}>{amountNum(model.totalOperations)}</Text>
      </View>

      {model.interet > 0 ? (
        <>
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
              {formatCurrency(model.interet).replace('MRU', '').trim()}
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
              {model.total > 0 ? formatCurrency(model.total).replace('MRU', '').trim() : ''}
            </Text>
          </View>
        </>
      ) : null}

      <Text style={styles.sign}>Le Directeur</Text>

      <View style={styles.footerWrap} fixed>
        <View style={styles.footer}>
          <Text style={styles.footerBlue}>
            Tél.(الهاتف): +222 46 91 19 19 --- mobile : 36 31 10 37 +
          </Text>
          <Text style={{ ...styles.footerBlue, textDecoration: 'underline' }}>
            E-mail (البريد الإلكتروني) : contact@snts.mr - site web (الموقع) : www.snts.mr
          </Text>
          <Text style={styles.footerLine}>
            Siège : Avenue Elmoukhtar Ould DADAH, en face de la mosquée de Quba
          </Text>
          <Text style={styles.footerLine}>المقر: شارع المختار ولد داداه، قبالة مسجد قباء</Text>
          <Text style={{ ...styles.footerLine, fontWeight: 'bold' }}>
            Nouakchott-Mauritanie === نواكشوط-موريتانيا
          </Text>
        </View>
      </View>
    </Page>
  );
}

export function TransitPdfDocument({
  model,
  logoUrl,
}: {
  model: PrintableTransitModel;
  logoUrl: string;
}) {
  return (
    <Document title={`Transit ${model.blNumber || model.factureNum || ''}`}>
      <TransitPdfPage model={model} logoUrl={logoUrl} />
    </Document>
  );
}

export async function downloadTransitPdf(model: PrintableTransitModel, origin: string) {
  const logoUrl = transitLogoPublicUrl(origin);
  const instance = pdf(
    <TransitPdfDocument model={model} logoUrl={logoUrl} />
  );
  const blob = await instance.toBlob();
  const url = URL.createObjectURL(blob);
  const safe = (model.blNumber || model.factureNum || 'dossier').replace(/[^\w.-]+/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `transit-${safe}.pdf`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
