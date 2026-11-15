import type { TextItem } from './layout';

/** The bits of pdf.js this reader uses, so tests can pass the Node build and the browser the web build. */
export interface PdfJs {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean }): { promise: Promise<PdfDoc>; destroy(): Promise<void> };
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
export interface PdfPage {
  getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }> }>;
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: unknown; viewport: unknown; canvas?: unknown }): { promise: Promise<void> };
}

export interface PdfRead {
  items: TextItem[];
  pages: number;
  /** Pages with almost no text: probably scanned images that need OCR. */
  scannedPages: number[];
}

/** Text items with positions from every page (y flipped so it grows downward, like OCR). */
export async function readPdf(bytes: Uint8Array, pdfjs: PdfJs, maxPages = 20): Promise<PdfRead & { doc: { getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> } }> {
  // pdf.js takes ownership of the buffer, so give it a copy.
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true });
  const doc = await task.promise;
  const items: TextItem[] = [];
  const scannedPages: number[] = [];
  const pages = Math.min(doc.numPages, maxPages);
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    let chars = 0;
    for (const it of content.items) {
      if (!it.str || !it.transform) continue;
      const [, , , d, e, f] = it.transform;
      const h = Math.abs(it.height || d || 10);
      chars += it.str.trim().length;
      items.push({ str: it.str, x0: e, x1: e + (it.width ?? it.str.length * h * 0.5), y: vp.height - f - h / 2, h, page: p });
    }
    if (chars < 20) scannedPages.push(p);
  }
  return { items, pages, scannedPages, doc: { getPage: (n) => doc.getPage(n), destroy: () => task.destroy() } };
}

/** Browser: pdf.js with its worker served from /pdfjs (copied there by scripts/copy-assets.mjs). */
export async function browserPdfJs(): Promise<PdfJs> {
  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  return lib as unknown as PdfJs;
}

/** Browser: draw a page onto a canvas for OCR. */
export async function renderPageToCanvas(page: PdfPage, scale = 2.5): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}
