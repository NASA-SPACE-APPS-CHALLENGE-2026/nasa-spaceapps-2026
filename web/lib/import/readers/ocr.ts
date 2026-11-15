import type { TextItem } from './layout';

/**
 * Optical character recognition for scanned invoices and photos of receipts (tesseract.js, English).
 * In the browser the worker, the engine and the language data are all served from /ocr
 * (copied by scripts/copy-assets.mjs), so images never leave the computer.
 */
export interface OcrResult {
  items: TextItem[];
  /** Mean word confidence, 0–100. */
  confidence: number;
}

type Img = string | Blob | HTMLCanvasElement | Uint8Array | ArrayBuffer;

interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Where the worker, engine and language data are. The browser default is /ocr; Node tests pass a local langPath. */
export interface OcrPaths {
  workerPath?: string;
  corePath?: string;
  langPath?: string;
  /** 'none' stops tesseract caching the language file (Node writes it to the working directory). */
  cacheMethod?: 'none' | 'write' | 'readOnly' | 'refresh';
}

export const BROWSER_OCR_PATHS: OcrPaths = { workerPath: '/ocr/worker.min.js', corePath: '/ocr/', langPath: '/ocr/' };

export async function ocrImages(images: Img[], opts: { paths?: OcrPaths; onProgress?: (p: number) => void } = { paths: BROWSER_OCR_PATHS }): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js');
  const workerOpts: Record<string, unknown> = {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') opts.onProgress?.(m.progress);
    },
  };
  Object.assign(workerOpts, opts.paths ?? {});
  const worker = await createWorker('eng', 1, workerOpts);
  const items: TextItem[] = [];
  let confSum = 0;
  let n = 0;
  try {
    for (let page = 0; page < images.length; page++) {
      const img = images[page] instanceof ArrayBuffer ? new Uint8Array(images[page] as ArrayBuffer) : images[page];
      const { data } = await worker.recognize(img as never, {}, { blocks: true });
      const words: OcrWord[] = (data.blocks ?? []).flatMap((b: { paragraphs: Array<{ lines: Array<{ words: OcrWord[] }> }> }) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
      for (const w of words) {
        if (!w.text.trim() || w.confidence < 30) continue;
        const h = w.bbox.y1 - w.bbox.y0;
        items.push({ str: w.text, x0: w.bbox.x0, x1: w.bbox.x1, y: (w.bbox.y0 + w.bbox.y1) / 2, h, page: page + 1 });
        confSum += w.confidence;
        n++;
      }
    }
  } finally {
    await worker.terminate();
  }
  return { items, confidence: n ? confSum / n : 0 };
}
