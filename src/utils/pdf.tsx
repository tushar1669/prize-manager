// Re-export PDF functionality
// Note: downloadPlayersPdf is disabled as @react-pdf/renderer is not installed
// If PDF generation is needed, install @react-pdf/renderer and restore the experimental/reactPdf.tsx file
export { maskDobForPublic } from "@/utils/print";

// Placeholder for downloadPlayersPdf
export async function downloadPlayersPdf(_options: {
  tournamentId: string;
  maskDob?: boolean;
  client?: unknown;
}): Promise<void> {
  throw new Error("PDF generation is not available. Install @react-pdf/renderer to enable this feature.");
}
