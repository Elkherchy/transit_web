/**
 * Génération PDF (React-PDF) côté serveur.
 * Polices Cairo (arabe) : TTF par chemin fichier si présents, sinon WOFF en base64 (fallback / Vercel).
 */
import './react-pdf-patch';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { TRANSIT_LOGO_FILENAME } from '@/lib/transitLogo';
import { renderToBuffer, Font } from '@react-pdf/renderer';
import {
  FicheTransitPDF,
  type FicheTransitData,
} from '@/components/documents/FicheTransitPDF';

export type { FicheTransitData } from '@/components/documents/FicheTransitPDF';

let cairoRegistered = false;

function getWoffPaths(): { regular: string; bold: string } | null {
  const cwd = process.cwd();
  const filesDir = path.join(cwd, 'node_modules', '@fontsource', 'cairo', 'files');
  const regular = path.join(filesDir, 'cairo-arabic-400-normal.woff');
  const bold = path.join(filesDir, 'cairo-arabic-700-normal.woff');
  if (fs.existsSync(regular) && fs.existsSync(bold)) return { regular, bold };
  return null;
}

function registerCairoFont(): void {
  if (cairoRegistered) return;
  const cwd = process.cwd();
  const ttfRegular = path.join(cwd, 'public', 'fonts', 'Cairo-Regular.ttf');
  const ttfBold = path.join(cwd, 'public', 'fonts', 'Cairo-Bold.ttf');

  if (fs.existsSync(ttfRegular) && fs.existsSync(ttfBold)) {
    Font.register({
      family: 'Cairo',
      fonts: [
        { src: ttfRegular },
        { src: ttfBold, fontWeight: 'bold' },
        { src: ttfRegular, fontStyle: 'italic' },
        { src: ttfBold, fontWeight: 'bold', fontStyle: 'italic' },
      ],
    });
  } else {
    const woffPaths = getWoffPaths();
    if (!woffPaths) {
      throw new Error(
        'Polices Cairo introuvables. Ajoutez Cairo-Regular.ttf et Cairo-Bold.ttf dans public/fonts/ ou installez @fontsource/cairo.'
      );
    }
    const regularBase64 = fs.readFileSync(woffPaths.regular, { encoding: 'base64' });
    const boldBase64 = fs.readFileSync(woffPaths.bold, { encoding: 'base64' });
    const regularDataUrl = `data:application/font-woff;base64,${regularBase64}`;
    const boldDataUrl = `data:application/font-woff;base64,${boldBase64}`;
    Font.register({
      family: 'Cairo',
      fonts: [
        { src: regularDataUrl },
        { src: boldDataUrl, fontWeight: 'bold' },
        { src: regularDataUrl, fontStyle: 'italic' },
        { src: boldDataUrl, fontWeight: 'bold', fontStyle: 'italic' },
      ],
    });
  }
  cairoRegistered = true;
}

function normalizeTransitData(data: FicheTransitData | undefined | null): FicheTransitData {
  if (data == null || typeof data !== 'object') {
    throw new Error('FicheTransitData is required');
  }
  const lines = Array.isArray(data.lines) ? data.lines : [];
  return {
    ficheNumber: data.ficheNumber ?? '',
    declarNumber: data.declarNumber,
    factureNumber: data.factureNumber ?? '',
    objet: data.objet ?? '',
    blNumber: data.blNumber ?? '',
    client: data.client ?? '',
    date: data.date ?? '',
    lines: lines.map((l) => {
      const des = l?.designation as unknown;
      const designation =
        typeof des === 'string'
          ? des
          : des != null && typeof des === 'object' && des !== null && 'nom' in des
            ? String((des as { nom: string }).nom)
            : '';
      return {
        designation,
        montant: typeof l?.montant === 'number' ? l.montant : 0,
        responsable: l?.responsable ?? '',
        date: typeof l?.date === 'string' ? l.date : '',
      };
    }),
    totalOperations: typeof data.totalOperations === 'number' ? data.totalOperations : 0,
    interet: typeof data.interet === 'number' ? data.interet : undefined,
    total: typeof data.total === 'number' ? data.total : 0,
  };
}

export async function generateTransitPdfBuffer(data: FicheTransitData): Promise<Buffer> {
  registerCairoFont();
  const safe = normalizeTransitData(data);
  const cwd = process.cwd();
  const headerPath = path.join(cwd, 'public', TRANSIT_LOGO_FILENAME);
  if (!fs.existsSync(headerPath)) {
    throw new Error(`Logo introuvable : ${headerPath}`);
  }
  const element = React.createElement(FicheTransitPDF, {
    data: safe,
    headerImagePath: headerPath,
  });
  return renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
}
