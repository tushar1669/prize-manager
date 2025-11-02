// src/utils/featureFlags.ts
// Feature flags for gradual rollout of import v2 enhancements

const logsFlag = import.meta.env?.VITE_IMPORT_LOGS_ENABLED;
export const IMPORT_LOGS_ENABLED = logsFlag ? logsFlag === 'true' : false;

export const IMPORT_V2_FLAGS = {
  /**
   * Enable multi-sheet header detection (scans rows 1-25 instead of hardcoded row 1)
   * Set to false to revert to legacy behavior
   */
  HEADER_DETECTION: true,
  
  /**
   * Enable rating column priority logic (Rtg > IRtg)
   * Set to false to use first-match behavior
   */
  RATING_PRIORITY: true,
  
  /**
   * Enable configurable unrated inference
   * Set to false to disable inference toggles
   */
  UNRATED_INFERENCE: true,
} as const;

export const PUBLISH_V2_ENABLED = true;
export const ENABLE_PDF_EXPORT = true;
export const PUBLIC_DOB_MASKING = true;

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flag: keyof typeof IMPORT_V2_FLAGS): boolean {
  return IMPORT_V2_FLAGS[flag];
}
