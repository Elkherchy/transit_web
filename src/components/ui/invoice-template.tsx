import * as React from 'react';
import { cn } from '@/lib/utils';
import { IFacture, IDesignation } from '@/types';

// Logo SVG Emama Transit
function EmamaLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative">
        <svg 
          width="60" 
          height="60" 
          viewBox="0 0 100 100" 
          className="text-[#02389B]"
          fill="currentColor"
        >
          {/* Globe stylisé */}
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="3" />
          <ellipse cx="50" cy="50" rx="20" ry="45" fill="none" stroke="currentColor" strokeWidth="2" />
          <ellipse cx="50" cy="50" rx="45" ry="20" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="5" y1="50" x2="95" y2="50" stroke="currentColor" strokeWidth="2" />
          <line x1="50" y1="5" x2="50" y2="95" stroke="currentColor" strokeWidth="2" />
          {/* Flèche direction */}
          <path 
            d="M75 25 L85 15 L85 35 Z" 
            fill="currentColor"
          />
        </svg>
      </div>
    </div>
  );
}

interface InvoiceTemplateProps {
  facture: IFacture & {
    client?: string;
    bl?: string;
    objet?: string;
    designations?: IDesignation[];
    produitFacture?: string;
    bankily?: string;
    ficheNumber?: string;
    dateEmission?: Date;
  };
  companyInfo?: {
    name?: string;
    nameAr?: string;
    phone?: string;
    mobile?: string;
    email?: string;
    website?: string;
    address?: string;
    addressAr?: string;
    country?: string;
    countryAr?: string;
  };
}

const defaultCompanyInfo = {
  name: "EMAMA TRANSIT",
  nameAr: "إمامة اترانزيت",
  phone: "+222 45 29 57 23",
  mobile: "36 35 11 98",
  email: "contact@ets-emama.com",
  website: "www.groupe-emama.com",
  address: "Avenue Elmoukhtar Ould DADAH, en face de la Banque mondiale",
  addressAr: "المقر: شارع المختار ولد داداه, قبالة البنك الدولي",
  country: "Nouakchott-Mauritanie",
  countryAr: "نواكشوط موريتانيا",
};

export function InvoiceTemplate({ 
  facture, 
  companyInfo = defaultCompanyInfo 
}: InvoiceTemplateProps) {
  const total = facture.designations?.reduce((sum, d) => sum + (d.montant || 0), 0) || 
                facture.totalFinal || 
                0;

  return (
    <div 
      className={cn(
        "bg-white text-black font-sans",
        "w-full max-w-[210mm] mx-auto",
        "p-8 md:p-12",
        "print:p-8 print:max-w-none print:shadow-none print:m-0"
      )}
      style={{ 
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '12pt',
        lineHeight: '1.4'
      }}
    >
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        {/* Left - French */}
        <div className="flex items-center gap-3">
          <EmamaLogo />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-black">
              ÉMAMA TRANSIT
            </h1>
            <p className="text-sm text-gray-600">EMAMA TRANSIT</p>
          </div>
        </div>

        {/* Center - Logo Globe */}
        <div className="flex items-center">
          <svg 
            width="80" 
            height="50" 
            viewBox="0 0 100 60" 
            className="text-[#02389B]"
          >
            {/* Globe stylisé avec flèche */}
            <circle cx="50" cy="30" r="25" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <ellipse cx="50" cy="30" rx="12" ry="25" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <ellipse cx="50" cy="30" rx="25" ry="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <line x1="25" y1="30" x2="75" y2="30" stroke="currentColor" strokeWidth="1.5" />
            <line x1="50" y1="5" x2="50" y2="55" stroke="currentColor" strokeWidth="1.5" />
            {/* Flèche */}
            <path 
              d="M65 15 L78 8 L75 22 Z" 
              fill="currentColor"
            />
            <path 
              d="M60 12 Q75 5, 80 20" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
          </svg>
        </div>

        {/* Right - Arabic */}
        <div className="text-right">
          <h1 className="text-2xl font-bold text-black" style={{ fontFamily: 'Arial, sans-serif' }}>
            إمامة اترانزيت
          </h1>
          <p className="text-sm text-gray-600">EMAMA TRANSIT</p>
        </div>
      </header>

      {/* Info Table - Top */}
      <div className="mb-4 border border-black">
        <table className="w-full border-collapse">
          <tbody>
            {/* First Row */}
            <tr className="border-b border-black">
              <td className="border-r border-black px-3 py-2 w-[20%] font-semibold bg-gray-50">
                Produit facturé :
              </td>
              <td className="border-r border-black px-3 py-2 w-[35%]">
                {facture.produitFacture || facture.objet || "—"}
              </td>
              <td className="border-r border-black px-3 py-2 w-[10%] font-semibold bg-gray-50">
                BL:
              </td>
              <td className="border-r border-black px-3 py-2 w-[20%]">
                {facture.bl || "—"}
              </td>
              <td className="border-r border-black px-3 py-2 w-[8%] font-semibold bg-gray-50">
                Date
              </td>
              <td className="px-3 py-2 w-[17%]">
                {facture.dateEmission ? new Date(facture.dateEmission).toLocaleDateString('fr-FR') : 
                 new Date().toLocaleDateString('fr-FR')}
              </td>
            </tr>
            {/* Second Row */}
            <tr className="border-b border-black">
              <td className="border-r border-black px-3 py-2 font-semibold bg-gray-50">
                Facture N°
              </td>
              <td className="border-r border-black px-3 py-2 font-semibold text-center">
                {facture.numero || facture._id?.slice(-5) || "—"}
              </td>
              <td colSpan={2} className="border-r border-black px-3 py-2 text-center">
                {facture.bankily && (
                  <span className="font-semibold">Bankily, Masrivi : {facture.bankily}</span>
                )}
              </td>
              <td className="border-r border-black px-3 py-2 font-semibold bg-gray-50">
                Fiche N° :
              </td>
              <td className="px-3 py-2 text-center font-semibold">
                {facture.ficheNumber || facture.numero || "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Client */}
      <div className="mb-6">
        <span className="font-semibold">Client : </span>
        <span className="border-b-2 border-black px-2 pb-1 font-semibold text-lg">
          {facture.client || facture.transitClient || "—"}
        </span>
      </div>

      {/* Designations Table */}
      <table className="w-full border-collapse border border-black mb-6">
        <thead>
          <tr className="bg-gray-50">
            <th className="border border-black px-3 py-2 text-center font-semibold w-[50%]">
              Désignation
            </th>
            <th className="border border-black px-3 py-2 text-center font-semibold w-[15%]">
              Quantité
            </th>
            <th className="border border-black px-3 py-2 text-center font-semibold w-[17%]">
              Prix Unitaire<br/>(en N-UM)
            </th>
            <th className="border border-black px-3 py-2 text-center font-semibold w-[18%]">
              Prix Total<br/>(en N-UM)
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Render designations */}
          {facture.designations && facture.designations.length > 0 ? (
            facture.designations.map((des, index) => (
              <tr key={index} className="h-10">
                <td className="border border-black px-3 py-2 text-center">
                  {des.nom}
                </td>
                <td className="border border-black px-3 py-2 text-center">
                  {/* Quantité si disponible */}
                </td>
                <td className="border border-black px-3 py-2 text-center">
                  {/* Prix unitaire si disponible */}
                </td>
                <td className="border border-black px-3 py-2 text-right font-semibold pr-4">
                  {des.montant?.toLocaleString('fr-FR') || "—"}
                </td>
              </tr>
            ))
          ) : (
            <tr className="h-10">
              <td className="border border-black px-3 py-2 text-center">
                {facture.objet || facture.produitFacture || "—"}
              </td>
              <td className="border border-black px-3 py-2 text-center"></td>
              <td className="border border-black px-3 py-2 text-center"></td>
              <td className="border border-black px-3 py-2 text-right font-semibold pr-4">
                {total.toLocaleString('fr-FR')}
              </td>
            </tr>
          )}
          
          {/* Empty rows to match template (minimum 10 rows) */}
          {Array.from({ length: Math.max(0, 10 - (facture.designations?.length || 1)) }).map((_, i) => (
            <tr key={`empty-${i}`} className="h-10">
              <td className="border border-black px-3 py-2"></td>
              <td className="border border-black px-3 py-2"></td>
              <td className="border border-black px-3 py-2"></td>
              <td className="border border-black px-3 py-2"></td>
            </tr>
          ))}
          
          {/* Total Row */}
          <tr className="bg-gray-50">
            <td colSpan={3} className="border border-black px-3 py-2"></td>
            <td className="border border-black px-3 py-2 text-right font-bold text-lg pr-4">
              {total.toLocaleString('fr-FR')}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Signature Section */}
      <div className="flex justify-end mb-8 mt-12">
        <div className="text-center">
          <p className="font-semibold mb-2">Le Directeur</p>
          
          {/* Stamp */}
          <div className="relative w-32 h-32 mx-auto">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {/* Outer circle */}
              <circle 
                cx="50" 
                cy="50" 
                r="45" 
                fill="none" 
                stroke="#c41e3a" 
                strokeWidth="2"
              />
              {/* Inner circle */}
              <circle 
                cx="50" 
                cy="50" 
                r="38" 
                fill="none" 
                stroke="#c41e3a" 
                strokeWidth="1"
              />
              {/* Text on top arc */}
              <path 
                id="stampCurveTop" 
                d="M 20,50 A 30,30 0 0,1 80,50" 
                fill="none"
              />
              <text 
                fill="#c41e3a" 
                fontSize="8" 
                fontWeight="bold"
                textAnchor="middle"
              >
                <textPath href="#stampCurveTop" startOffset="50%">
                  EMAMA TRANSIT
                </textPath>
              </text>
              {/* Text on bottom arc */}
              <path 
                id="stampCurveBottom" 
                d="M 20,50 A 30,30 0 0,0 80,50" 
                fill="none"
              />
              <text 
                fill="#c41e3a" 
                fontSize="7" 
                fontWeight="bold"
                textAnchor="middle"
              >
                <textPath href="#stampCurveBottom" startOffset="50%">
                  Le Directeur
                </textPath>
              </text>
              {/* Center icon */}
              <circle cx="50" cy="48" r="8" fill="#c41e3a" opacity="0.2"/>
            </svg>
            
            {/* Signature line */}
            <svg 
              className="absolute bottom-4 left-1/2 -translate-x-1/2 w-20 h-8" 
              viewBox="0 0 80 30"
            >
              <path 
                d="M5,20 Q20,5 35,20 T65,15 T75,20" 
                fill="none" 
                stroke="black" 
                strokeWidth="1.5"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs space-y-1 mt-8 pt-4 border-t border-gray-300">
        {/* Contact Info */}
        <p className="font-medium">
          <span>Tél.(الهاتف) : {companyInfo.phone}</span>
          <span className="mx-3">---</span>
          <span>mobile : {companyInfo.mobile}</span>
          <span className="mx-2">✚</span>
          <span>📱</span>
        </p>
        
        <p>
          <span>E-mail (البريد الإلكتروني) : {companyInfo.email}</span>
          <span className="mx-2">-</span>
          <span>site web (الموقع) : {companyInfo.website}</span>
        </p>
        
        <p className="font-medium">
          Siège : {companyInfo.address}
        </p>
        
        <p style={{ fontFamily: 'Arial, sans-serif', direction: 'rtl' }}>
          {companyInfo.addressAr}
        </p>
        
        <p className="font-medium">
          {companyInfo.country} === {companyInfo.countryAr}
        </p>
      </footer>

      {/* Print Button - Hidden when printing */}
      <div className="mt-8 flex justify-center gap-3 print:hidden">
        <button
          onClick={() => window.print()}
          className={cn(
            "px-6 py-2.5 rounded-lg font-medium",
            "bg-[#02389B] text-white hover:bg-[#012a73]",
            "transition-colors shadow-sm"
          )}
        >
          Imprimer la facture
        </button>
        <button
          onClick={() => window.close()}
          className={cn(
            "px-6 py-2.5 rounded-lg font-medium",
            "border border-gray-300 hover:bg-gray-50",
            "transition-colors"
          )}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

// Simplified version for modal/preview
export function InvoiceSimple({ 
  facture, 
  companyInfo = defaultCompanyInfo 
}: InvoiceTemplateProps) {
  const total = facture.totalFinal || 
                facture.designations?.reduce((sum, d) => sum + (d.montant || 0), 0) || 
                0;

  return (
    <div className="bg-white p-6 text-black font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b-2 border-black pb-4">
        <div>
          <h1 className="text-xl font-bold">ÉMAMA TRANSIT</h1>
          <p className="text-xs text-gray-600">{companyInfo.nameAr}</p>
        </div>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-[#02389B] flex items-center justify-center">
            <span className="text-[#02389B] text-xs">🌍</span>
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-xl font-bold">{companyInfo.nameAr}</h1>
          <p className="text-xs text-gray-600">EMAMA TRANSIT</p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-sm border border-black">
        <div className="border-r border-black p-2">
          <span className="font-semibold">Produit:</span> {facture.objet || "—"}
        </div>
        <div className="border-r border-black p-2">
          <span className="font-semibold">BL:</span> {facture.bl || "—"}
        </div>
        <div className="p-2">
          <span className="font-semibold">Date:</span> {new Date().toLocaleDateString('fr-FR')}
        </div>
        <div className="border-r border-t border-black p-2">
          <span className="font-semibold">Facture N°:</span> {facture.numero || "—"}
        </div>
        <div className="border-r border-t border-black p-2">
          {facture.bankily && <span>Bankily: {facture.bankily}</span>}
        </div>
        <div className="border-t border-black p-2">
          <span className="font-semibold">Fiche N°:</span> {facture.ficheNumber || "—"}
        </div>
      </div>

      {/* Client */}
      <div className="mb-4">
        <span className="font-semibold">Client: </span>
        <span className="border-b border-black px-2">{facture.client || facture.transitClient || "—"}</span>
      </div>

      {/* Table */}
      <table className="w-full border-collapse border border-black mb-4">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-2 text-left">Désignation</th>
            <th className="border border-black p-2 text-center w-24">Qté</th>
            <th className="border border-black p-2 text-right w-32">Prix Total</th>
          </tr>
        </thead>
        <tbody>
          {facture.designations?.map((des, i) => (
            <tr key={i}>
              <td className="border border-black p-2">{des.nom}</td>
              <td className="border border-black p-2 text-center"></td>
              <td className="border border-black p-2 text-right font-semibold">
                {des.montant?.toLocaleString('fr-FR')}
              </td>
            </tr>
          ))}
          <tr className="bg-gray-50">
            <td colSpan={2} className="border border-black p-2 text-right font-bold">TOTAL</td>
            <td className="border border-black p-2 text-right font-bold text-lg">
              {total.toLocaleString('fr-FR')}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <div className="text-center text-xs text-gray-600 mt-8">
        <p>{companyInfo.phone} | {companyInfo.email}</p>
        <p>{companyInfo.address}</p>
      </div>
    </div>
  );
}

// Print-specific styles
export const InvoicePrintStyles = () => (
  <style>{`
    @media print {
      @page {
        size: A4;
        margin: 10mm;
      }
      
      body {
        background: white;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      
      .print\\:hidden {
        display: none !important;
      }
      
      .print\\:p-8 {
        padding: 8mm !important;
      }
      
      .print\\:shadow-none {
        box-shadow: none !important;
      }
      
      .print\\:m-0 {
        margin: 0 !important;
      }
      
      table {
        page-break-inside: auto;
      }
      
      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
    }
  `}</style>
);
