import './react-pdf-patch';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToBuffer } from '@react-pdf/renderer';
import { TRANSIT_LOGO_FILENAME } from '@/lib/transitLogo';
import {
  ClientOperationsPDF,
  type ClientOperationsData,
} from '@/components/documents/ClientOperationsPDF';
// Réutilise le même registre de polices que le PDF Transit pour rester
// cohérent (Cairo pour le support des caractères arabes / accentués).
import { generateTransitPdfBuffer } from './transitPdfBuffer';

void generateTransitPdfBuffer;

export async function generateClientOperationsPdfBuffer(
  data: ClientOperationsData
): Promise<Buffer> {
  // S'assure que la police Cairo est enregistrée — on appelle un buffer
  // factice pour bénéficier de la même initialisation. En pratique on
  // pourrait dupliquer registerCairoFont, mais comme transitPdfBuffer
  // l'expose déjà côté load on profite de l'effet de bord d'import.
  // (registerCairoFont est appelée à l'intérieur de generateTransitPdfBuffer ;
  // l'import seul du module ne suffit pas — on force ici l'enregistrement.)
  await ensureCairoRegistered();

  const cwd = process.cwd();
  const headerPath = path.join(cwd, 'public', TRANSIT_LOGO_FILENAME);
  const headerImagePath = fs.existsSync(headerPath) ? headerPath : undefined;

  const element = React.createElement(ClientOperationsPDF, {
    data,
    headerImagePath,
  });
  return renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
}

let cairoLoaded = false;
async function ensureCairoRegistered() {
  if (cairoLoaded) return;
  cairoLoaded = true;
  // Délègue à transitPdfBuffer qui sait charger les polices Cairo (TTF
  // ou WOFF fallback). On génère un mini-payload vide pour déclencher
  // l'enregistrement, on jette le buffer résultant.
  try {
    const { Font } = await import('@react-pdf/renderer');
    const cwd = process.cwd();
    const ttfRegular = path.join(cwd, 'public', 'fonts', 'Cairo-Regular.ttf');
    const ttfBold = path.join(cwd, 'public', 'fonts', 'Cairo-Bold.ttf');
    if (fs.existsSync(ttfRegular) && fs.existsSync(ttfBold)) {
      Font.register({
        family: 'Cairo',
        fonts: [
          { src: ttfRegular },
          { src: ttfBold, fontWeight: 'bold' },
        ],
      });
      return;
    }
    // Fallback WOFF base64 (idem transitPdfBuffer).
    const filesDir = path.join(
      cwd,
      'node_modules',
      '@fontsource',
      'cairo',
      'files'
    );
    const regularWoff = path.join(filesDir, 'cairo-arabic-400-normal.woff');
    const boldWoff = path.join(filesDir, 'cairo-arabic-700-normal.woff');
    if (fs.existsSync(regularWoff) && fs.existsSync(boldWoff)) {
      const regularBase64 = fs.readFileSync(regularWoff, {
        encoding: 'base64',
      });
      const boldBase64 = fs.readFileSync(boldWoff, { encoding: 'base64' });
      Font.register({
        family: 'Cairo',
        fonts: [
          { src: `data:application/font-woff;base64,${regularBase64}` },
          {
            src: `data:application/font-woff;base64,${boldBase64}`,
            fontWeight: 'bold',
          },
        ],
      });
    }
  } catch (e) {
    console.error('Cairo registration error (clientOperations):', e);
  }
}
