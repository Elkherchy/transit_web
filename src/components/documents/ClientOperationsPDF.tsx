import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

export interface ClientOperationLine {
  date: string;
  motif: string;
  debit: number;
  credit: number;
  solde: number; // solde cumulé après l'opération
}

export interface ClientOperationsData {
  clientNom: string;
  generatedAt: string;
  /** Période filtrée (ex. « Du 01/06/2026 au 30/06/2026 »). Absent = tout. */
  periode?: string;
  lines: ClientOperationLine[];
  totalDebit: number;
  totalCredit: number;
  totalSolde: number;
}

/**
 * Format français pour PDF : remplace les espaces fines insécables ( )
 * et insécables ( ) — non rendues par la police Cairo en mode PDF, qui
 * apparaissent sinon comme "/" ou des glyphes erronés — par un espace
 * normal. Conserve la virgule décimale française.
 */
const fmt = (n: number): string => {
  const v = Number(n || 0);
  const sign = v < 0 ? '-' : '';
  const fixed = Math.abs(v).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${withSpaces},${decPart}`;
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Cairo',
    fontSize: 9,
    padding: 24,
    paddingTop: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  logoBox: {
    width: 110,
    height: 50,
  },
  logoImg: {
    width: 110,
    height: 50,
    objectFit: 'contain',
  },
  titleBox: {
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 9,
    color: '#475569',
    marginTop: 2,
  },
  clientBox: {
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderRadius: 4,
    marginBottom: 12,
  },
  clientLabel: {
    fontSize: 9,
    color: '#475569',
    marginBottom: 2,
  },
  clientName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  table: {
    marginTop: 4,
  },
  thead: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    color: '#ffffff',
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontSize: 9,
    fontWeight: 'bold',
  },
  trow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#cbd5e1',
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 9,
  },
  trowAlt: {
    backgroundColor: '#f8fafc',
  },
  cellDate: { width: '15%' },
  cellMotif: { width: '40%', paddingRight: 4 },
  cellDebit: { width: '15%', textAlign: 'right' },
  cellCredit: { width: '15%', textAlign: 'right' },
  cellSolde: { width: '15%', textAlign: 'right' },
  cellDebitText: { color: '#b91c1c' },
  cellCreditText: { color: '#15803d' },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    padding: 6,
    marginTop: 10,
    fontWeight: 'bold',
    fontSize: 10,
  },
  totalLabel: {
    width: '55%',
    textAlign: 'left',
    fontWeight: 'bold',
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 24,
    right: 24,
    fontSize: 8,
    color: '#94a3b8',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export interface ClientOperationsPDFProps {
  data: ClientOperationsData;
  headerImagePath?: string;
}

export function ClientOperationsPDF({
  data,
  headerImagePath,
}: ClientOperationsPDFProps) {
  return (
    <Document title={`Operations ${data.clientNom}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.logoBox}>
            {headerImagePath ? (
              <Image src={headerImagePath} style={styles.logoImg} />
            ) : (
              <Text> </Text>
            )}
          </View>
          <View style={styles.titleBox}>
            <Text style={styles.title}>Relevé d&apos;opérations</Text>
            <Text style={styles.subtitle}>Édité le {data.generatedAt}</Text>
          </View>
        </View>

        <View style={styles.clientBox}>
          <Text style={styles.clientLabel}>Client</Text>
          <Text style={styles.clientName}>{data.clientNom}</Text>
          {data.periode && (
            <Text style={[styles.clientLabel, { marginTop: 4 }]}>
              Période : {data.periode}
            </Text>
          )}
        </View>

        <View style={styles.table}>
          <View style={styles.thead} fixed>
            <Text style={styles.cellDate}>Date</Text>
            <Text style={styles.cellMotif}>Motif</Text>
            <Text style={styles.cellDebit}>Débit</Text>
            <Text style={styles.cellCredit}>Crédit</Text>
            <Text style={styles.cellSolde}>Solde</Text>
          </View>
          {data.lines.length === 0 && (
            <View style={[styles.trow, { justifyContent: 'center' }]}>
              <Text>Aucune opération.</Text>
            </View>
          )}
          {data.lines.map((l, i) => (
            <View
              key={i}
              style={i % 2 === 0 ? styles.trow : [styles.trow, styles.trowAlt]}
              wrap={false}
            >
              <Text style={styles.cellDate}>{l.date}</Text>
              <Text style={styles.cellMotif}>{l.motif}</Text>
              <Text style={[styles.cellDebit, styles.cellDebitText]}>
                {l.debit > 0 ? fmt(l.debit) : '—'}
              </Text>
              <Text style={[styles.cellCredit, styles.cellCreditText]}>
                {l.credit > 0 ? fmt(l.credit) : '—'}
              </Text>
              <Text style={styles.cellSolde}>{fmt(l.solde)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAUX</Text>
          <Text style={[styles.cellDebit, styles.cellDebitText]}>
            {fmt(data.totalDebit)}
          </Text>
          <Text style={[styles.cellCredit, styles.cellCreditText]}>
            {fmt(data.totalCredit)}
          </Text>
          <Text style={styles.cellSolde}>{fmt(data.totalSolde)}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>{data.clientNom}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
