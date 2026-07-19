/**
 * Page-at-a-time PDF rasterization for the image pass-1 mode.
 *
 * Rendering every page before sending any of them costs roughly a megabyte of PNG per page plus a
 * third again as base64, and the Edge worker is killed for exceeding its memory limit long before
 * a ten-page brochure finishes. So the document is opened once and pages are pulled one at a time:
 * the caller renders a page, sends it, and drops it before asking for the next. Peak memory is one
 * page, not the whole document — which a measured probe showed is the difference between a worker
 * that survives and one that does not.
 *
 * mupdf is imported dynamically. It is WASM-backed and does initialise in this runtime (verified),
 * but a static import would still take the working PDF path down with it on any future breakage.
 */

const RASTER_DPI = 150;
const PDF_USER_SPACE_DPI = 72;

export class RasterError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RasterError";
    this.code = code;
  }
}

export type RasterSession = {
  pageCount: number;
  /** Renders one page to a base64 PNG, freeing the WASM-side bitmap before returning. */
  renderPage(index: number): { data: string; bytes: number };
  close(): void;
};

type MupdfModule = {
  Document: { openDocument(buffer: Uint8Array, magic: string): MupdfDocument };
  Matrix: { scale(x: number, y: number): unknown };
  ColorSpace: { DeviceRGB: unknown };
};
type MupdfDocument = {
  countPages(): number;
  loadPage(index: number): MupdfPage;
  destroy?(): void;
};
type MupdfPage = {
  toPixmap(matrix: unknown, colorspace: unknown, alpha: boolean, showExtras: boolean): MupdfPixmap;
  destroy?(): void;
};
type MupdfPixmap = { asPNG(): Uint8Array; destroy?(): void };

export async function openPdfForRaster(
  bytes: Uint8Array,
  encode: (png: Uint8Array) => string,
): Promise<RasterSession> {
  let mupdf: MupdfModule;
  try {
    mupdf = await import("npm:mupdf@1.26.4") as unknown as MupdfModule;
  } catch (err) {
    throw new RasterError(
      "raster_library_unavailable",
      `mupdf failed to load: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`,
    );
  }

  let doc: MupdfDocument;
  try {
    doc = mupdf.Document.openDocument(bytes, "application/pdf");
  } catch (err) {
    throw new RasterError("raster_open_failed", `Could not open PDF: ${err instanceof Error ? err.message : String(err)}`);
  }

  const scale = RASTER_DPI / PDF_USER_SPACE_DPI;

  return {
    pageCount: doc.countPages(),
    renderPage(index: number) {
      let page: MupdfPage | null = null;
      let pixmap: MupdfPixmap | null = null;
      try {
        page = doc.loadPage(index);
        pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
        const png = pixmap.asPNG();
        return { data: encode(png), bytes: png.byteLength };
      } catch (err) {
        throw new RasterError(
          "raster_page_failed",
          `Page ${index + 1} failed to render: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        // The WASM heap is outside the JS GC's reach; without an explicit free every page leaks
        // until the worker dies, which is exactly the failure this module exists to avoid.
        try {
          pixmap?.destroy?.();
          page?.destroy?.();
        } catch (_) { /* freeing must never mask a render error */ }
      }
    },
    close() {
      try {
        doc.destroy?.();
      } catch (_) { /* ignore */ }
    },
  };
}
