import React from 'react';
import type { ITransit } from '@/types';
import type { FicheTransitData } from '@/components/documents/FicheTransitPDF';
import { formatCurrency, formatDate } from '@/lib/utils';
import { EMAMA_TRANSIT_AR, transitLogoPublicUrl } from '@/lib/transitLogo';

/** Bleu marine type en-tête papier SNTS Transit */
const NAVY = '#003366';
const FOOTER_BODY = '#1a1a1a';
/** Ligne paiement mobile (modèle papier facture client) */
const BANKILY_LINE = 'Bankily,Masrivi : 36351198';
/** Fond ligne total tableau (comme modèle papier) */
const TABLE_TOTAL_BG = '#cce5f7';

function amountNum(v: number): string {
  return formatCurrency(v).replace('MRU', '').trim();
}

/** Données alignées sur le gabarit papier (champs optionnels si absents en base). */
export interface PrintableTransitModel {
  ficheNumber?: string;
  declarNumber?: string;
  factureNum: string;
  blNumber: string;
  objet: string;
  /** Date affichée en en-tête (ex. date dossier / émission) */
  issueDate?: string;
  clientName: string;
  lines: Array<{
    designationNom: string;
    montant: number;
    responsable: string;
    date?: Date | string;
  }>;
  totalOperations: number;
  interet: number;
  total: number;
}

interface PrintableTransitDocProps {
  model: PrintableTransitModel;
  /** Ex. `https://localhost:3000` — requis pour que l’en-tête s’affiche à l’impression / PDF */
  assetOrigin?: string;
}

/** Lignes vides pour le gabarit papier ; rester court pour tenir sur une seule page A4 à l’impression. */
const TABLE_ROW_TARGET = 8;

function transitLogoSrc(assetOrigin?: string) {
  return transitLogoPublicUrl(assetOrigin);
}

export const PrintableTransitDoc = React.forwardRef<HTMLDivElement, PrintableTransitDocProps>(
  ({ model, assetOrigin }, ref) => {
    const logoSrc = transitLogoSrc(assetOrigin);
    const lines = model.lines || [];
    const paddingRowsCount = Math.max(0, TABLE_ROW_TARGET - lines.length);
    const paddingRows = Array.from({ length: paddingRowsCount }).map((_, i) => ({
      _id: `pad-${i}`,
      isEmpty: true as const,
    }));

    return (
      <div
        ref={ref}
        className="transit-print-doc w-full bg-white p-4 text-sm text-black print:m-0 print:p-0"
        style={{ fontFamily: '"Cairo", "Helvetica Neue", Helvetica, Arial, sans-serif' }}
      >
        <div
          className="transit-print-sheet mx-auto flex min-h-0 w-[21cm] max-w-full flex-col border border-black/10 bg-white p-4 shadow-sm print:min-h-[calc(297mm-22mm)] print:w-full print:max-w-none print:border-none print:p-0 print:shadow-none"
          style={{ color: FOOTER_BODY }}
        >
          <header
            className="transit-print-brand mb-3 flex w-full shrink-0 flex-row items-center gap-2 border-b-2 border-[#003366] bg-white pb-2 sm:gap-3 print:mb-2 print:gap-2 print:pb-1.5"
            aria-label="SNTS"
          >
            <span
              className="min-w-0 flex-1 text-left text-sm font-bold uppercase leading-tight tracking-wide text-[#003366] sm:text-base print:text-[11pt]"
              style={{ letterSpacing: '0.02em' }}
            >
              SNTS
            </span>
            <div className="flex shrink-0 items-center justify-center px-0.5 print:px-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt=""
                role="presentation"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="transit-print-logo h-11 w-auto max-h-[44px] object-contain sm:h-12 sm:max-h-[48px] print:h-9 print:max-h-[34pt]"
              />
            </div>
            <span
              className="min-w-0 flex-1 text-right text-xs font-semibold leading-snug text-[#003366] sm:text-sm print:text-[9pt]"
              dir="rtl"
            >
              {EMAMA_TRANSIT_AR}
            </span>
          </header>

          <div className="transit-print-main flex w-full flex-col min-h-0">
          <div className="mb-1.5 w-full border border-black print:mb-1">
            <table className="transit-print-meta w-full text-[13px] print:text-[8.5pt]">
              <tbody>
                <tr>
                  <td className="w-[36%] border-r border-black p-1.5 align-top">
                    <span className="font-semibold underline" style={{ color: NAVY }}>
                      Objet :
                    </span>{' '}
                    {model.objet || ''}
                  </td>
                  <td className="w-[32%] border-r border-black p-1.5 align-top">
                    <span className="font-semibold underline" style={{ color: NAVY }}>
                      BL :
                    </span>{' '}
                    {model.blNumber || ''}
                  </td>
                  <td className="w-[32%] p-1.5 align-top">
                    <span className="font-semibold underline" style={{ color: NAVY }}>
                      Date :
                    </span>{' '}
                    {model.issueDate || ''}
                  </td>
                </tr>
                <tr>
                  <td
                    colSpan={3}
                    className="border-t border-black p-1.5 text-center text-[12px] print:text-[8pt]"
                    style={{ color: NAVY }}
                  >
                    {BANKILY_LINE}
                  </td>
                </tr>
                <tr>
                  <td className="border-t border-r border-black p-1.5" colSpan={2}>
                    <span className="font-semibold underline" style={{ color: NAVY }}>
                      Facture N° :
                    </span>{' '}
                    {model.factureNum || ''}
                  </td>
                  <td className="border-t border-black p-1.5">
                    <span className="font-semibold underline" style={{ color: NAVY }}>
                      Fiche N° :
                    </span>{' '}
                    {model.ficheNumber || model.declarNumber || ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mb-2 pl-1 print:mb-1">
            <span className="text-[15px] font-bold print:text-[10.5pt]" style={{ color: NAVY }}>
              Client :{' '}
            </span>
            <span
              className="text-[15px] italic underline decoration-1 underline-offset-4 print:text-[10.5pt]"
              style={{ color: NAVY }}
            >
              {model.clientName}
            </span>
          </div>

          <table className="transit-print-table mb-1 w-full border-collapse border border-black text-center text-[13px] print:text-[8.5pt] print:leading-snug">
            <colgroup>
              <col style={{ width: '44%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '22%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-black" style={{ color: NAVY }}>
                <th className="border-r border-black bg-gray-100 p-1 pl-2 text-left font-bold">
                  Désignation
                </th>
                <th className="border-r border-black bg-gray-100 p-1 font-bold">Quantité</th>
                <th className="border-r border-black bg-gray-100 p-1 font-bold">Prix Unitaire (en N-UM)</th>
                <th className="bg-gray-100 p-1 font-bold">Prix Total (en N-UM)</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} className="transit-print-trow min-h-[1.35rem] border-b border-black print:min-h-[1.2rem]">
                  <td className="border-r border-black px-1.5 py-1 pl-2 text-left font-medium print:py-0.5">
                    {line.designationNom}
                  </td>
                  <td className="border-r border-black px-1 py-1 print:py-0.5">1</td>
                  <td className="border-r border-black px-1 py-1 print:py-0.5">{amountNum(line.montant)}</td>
                  <td className="px-1 py-1 print:py-0.5">{amountNum(line.montant)}</td>
                </tr>
              ))}
              {paddingRows.map((row) => (
                <tr key={row._id} className="transit-print-trow min-h-[1.35rem] border-b border-black print:min-h-[1.05rem]">
                  <td className="border-r border-black p-1"></td>
                  <td className="border-r border-black p-1"></td>
                  <td className="border-r border-black p-1"></td>
                  <td className="p-1"></td>
                </tr>
              ))}
              <tr style={{ backgroundColor: TABLE_TOTAL_BG }}>
                <td
                  className="border-r border-t border-black p-1.5 text-right font-bold"
                  colSpan={3}
                  style={{ color: NAVY }}
                >
                  Total
                </td>
                <td className="border-t border-black p-1.5 text-center font-bold" style={{ color: NAVY }}>
                  {amountNum(model.totalOperations)}
                </td>
              </tr>
            </tbody>
          </table>

          {model.interet > 0 && (
            <div className="mt-0.5 w-full print:mt-0">
              <table className="w-full border-collapse text-center text-[13px] print:text-[8.5pt]">
                <colgroup>
                  <col style={{ width: '45%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '15%' }} />
                </colgroup>
                <tbody>
                  <tr style={{ color: NAVY }}>
                    <td className="p-1 pr-6 text-right font-bold">Intérêt :</td>
                    <td className="h-6 border border-black p-1">
                      {formatCurrency(model.interet).replace('MRU', '').trim()}
                    </td>
                    <td></td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="h-1"></td>
                  </tr>
                  <tr style={{ color: NAVY }}>
                    <td className="p-1 pr-6 text-right font-bold">Total :</td>
                    <td className="h-6 border border-black p-1 font-bold">
                      {model.total > 0 ? formatCurrency(model.total).replace('MRU', '').trim() : ''}
                    </td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div
            className="transit-print-sign mb-1 mt-2 flex shrink-0 justify-end pr-6 text-[14px] font-bold print:mb-0.5 print:mt-1.5 print:pr-4 print:text-[10pt]"
            style={{ color: NAVY }}
          >
            Le Directeur
          </div>
          </div>

          {/* Pied de page : ancré en bas de la feuille (flex + min-h sur .transit-print-sheet à l’impression) */}
          <div className="transit-print-footer mt-auto flex shrink-0 flex-col items-center gap-0.5 pb-6 text-center text-[10px] font-medium leading-[1.35] print:pb-2 print:text-[7.5pt] print:leading-[1.35]">
            <div className="flex flex-wrap items-center justify-center font-medium" style={{ color: NAVY }}>
              <span>Tél.(الهاتف): +222 46 91 19 19 --- mobile : 36 31 10 37 +</span>
            </div>
            <div
              className="flex flex-wrap justify-center underline decoration-1 underline-offset-1 [text-underline-offset:2px]"
              style={{ color: NAVY }}
            >
              <span>E-mail (البريد الإلكتروني) : contact@snts.mr -</span>
              <span>site web (الموقع) : www.snts.mr</span>
            </div>
            <div className="pt-0.5" style={{ color: FOOTER_BODY }}>
              Siège : Avenue Elmoukhtar Ould DADAH, en face de la mosquée de Quba
            </div>
            <div className="pt-0.5 font-medium" dir="rtl" style={{ color: FOOTER_BODY }}>
              المقر: شارع المختار ولد داداه، قبالة مسجد قباء
            </div>
            <div className="pt-0.5 font-bold tracking-wide" style={{ color: FOOTER_BODY }}>
              Nouakchott-Mauritanie === نواكشوط-موريتانيا
            </div>
          </div>
        </div>
      </div>
    );
  }
);

PrintableTransitDoc.displayName = 'PrintableTransitDoc';

export interface TransitDetailsForPrint extends ITransit {
  facture?: {
    numero?: string;
    totalFinal?: number;
    totalOperations?: number;
    interet?: number;
  } | null;
}

/** Données pour `generateTransitPdfBuffer` (même logique métier que l’impression navigateur). */
export function buildFicheTransitPdfPayload(data: TransitDetailsForPrint): FicheTransitData {
  const m = buildPrintableTransitModel(data);
  return {
    ficheNumber: m.ficheNumber ?? '',
    declarNumber: m.declarNumber,
    factureNumber: m.factureNum ?? '',
    objet: m.objet ?? '',
    blNumber: m.blNumber ?? '',
    client: m.clientName ?? '',
    date: m.issueDate ?? '',
    lines: m.lines.map((l) => ({
      designation: l.designationNom,
      montant: l.montant,
      responsable: l.responsable ?? '',
      date: l.date ? formatDate(l.date) : '',
    })),
    totalOperations: m.totalOperations,
    interet: m.interet,
    total: m.total,
  };
}

export function buildPrintableTransitModel(data: TransitDetailsForPrint): PrintableTransitModel {
  const designations = data.designations || [];
  const sumOps = designations.reduce((s, d) => s + (d.montant || 0), 0);
  const totalOperations =
    typeof data.facture?.totalOperations === 'number' ? data.facture.totalOperations : sumOps;
  const interet =
    typeof data.facture?.interet === 'number'
      ? data.facture.interet
      : typeof data.interet === 'number'
        ? data.interet
        : 0;
  const total =
    typeof data.facture?.totalFinal === 'number'
      ? data.facture.totalFinal
      : totalOperations + interet;

  return {
    ficheNumber: (data as { ficheNumber?: string }).ficheNumber,
    declarNumber: (data as { declarNumber?: string }).declarNumber,
    factureNum: data.facture?.numero || '',
    blNumber: data.bl || '',
    objet: data.objet || '',
    issueDate: data.date ? formatDate(data.date) : '',
    clientName: typeof data.client === 'string' ? data.client : String(data.client || ''),
    lines: designations.map((d) => ({
      designationNom: d.nom || '',
      montant: d.montant || 0,
      responsable: '—',
      // Date de paiement par le payeur (si déjà payée) — sinon vide.
      date: (d as { paidAt?: Date | string | null }).paidAt || undefined,
    })),
    totalOperations,
    interet,
    total,
  };
}
