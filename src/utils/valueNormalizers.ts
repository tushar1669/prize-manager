// src/utils/valueNormalizers.ts
// Value normalization for player import (gender, rating, unrated inference)

/**
 * Normalize gender values to M/F/X
 */
export function normalizeGender(raw: any): 'M' | 'F' | 'Other' | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  
  // Male variants
  if (['m', 'male', 'boy', 'b'].includes(s)) return 'M';
  
  // Female variants (include 'w' for woman, common in international tournaments)
  if (['f', 'female', 'girl', 'g', 'w', 'woman'].includes(s)) return 'F';
  
  // Other/Unknown
  return 'Other';
}

/**
 * Normalize rating values, optionally stripping commas/spaces
 * Returns null for invalid values
 */
export function normalizeRating(raw: any, stripCommas: boolean = true): number | null {
  if (raw == null || raw === '') return null;
  
  let str = String(raw).trim();
  
  // Strip commas and spaces if configured (e.g., "1,800" or "1 800" → "1800")
  if (stripCommas) {
    str = str.replace(/[,\s]/g, '');
  }
  
  const num = parseFloat(str);
  
  // Validate: must be non-negative number
  if (isNaN(num) || num < 0) return null;
  
  return Math.round(num);
}

/**
 * Configuration for unrated inference logic
 */
export interface UnratedInferenceConfig {
  treatEmptyAsUnrated: boolean;    // Treat '', '-', 'NA', 'N/A' as unrated=true
  inferFromMissingRating: boolean; // Infer unrated if rating=0/null AND fide_id missing
}

/**
 * Infer whether a player should be marked as unrated
 * Handles explicit flags + configurable inference from missing data
 */
export function inferUnrated(
  player: { 
    rating?: number | null; 
    fide_id?: string | null; 
    unrated?: any;
  },
  config: UnratedInferenceConfig
): boolean {
  // Check explicit unrated field first
  if (player.unrated != null) {
    const s = String(player.unrated).trim().toLowerCase();
    
    // Explicit truthy values
    if (['y', 'yes', 'true', '1', 'u', 'ur', 'unrated'].includes(s)) {
      return true;
    }
    
    // Configurable: treat empty/dash/NA as unrated
    if (config.treatEmptyAsUnrated && ['', '-', 'na', 'n/a', 'n.a.'].includes(s)) {
      return true;
    }
  }
  
  // Configurable: infer from missing rating + missing FIDE ID
  if (config.inferFromMissingRating) {
    const hasNoRating = !player.rating || player.rating === 0;
    const hasNoFideId = !player.fide_id || player.fide_id.trim() === '';
    
    if (hasNoRating && hasNoFideId) {
      return true;
    }
  }
  
  return false;
}
