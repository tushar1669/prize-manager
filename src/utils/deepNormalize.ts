/**
 * Recursively sort object keys for stable comparison
 */
export function deepSortKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepSortKeys(item));
  }
  
  const sorted: Record<string, any> = {};
  Object.keys(obj)
    .sort()
    .forEach(key => {
      sorted[key] = deepSortKeys(obj[key]);
    });
  
  return sorted;
}

/**
 * Normalize criteria for comparison (sort keys + stable array order)
 */
export function normalizeCriteria(value: any): any {
  if (value === null || typeof value !== 'object') return value;
  
  if (Array.isArray(value)) {
    // If array of objects with stable keys, sort by those
    const hasId = value.length > 0 && value[0] && typeof value[0] === 'object' && 'id' in value[0];
    const hasName = value.length > 0 && value[0] && typeof value[0] === 'object' && 'name' in value[0];
    
    if (hasId) {
      return [...value]
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map(item => normalizeCriteria(item));
    }
    
    if (hasName) {
      return [...value]
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map(item => normalizeCriteria(item));
    }
    
    // Otherwise sort by stable JSON string representation
    return [...value]
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      .map(item => normalizeCriteria(item));
  }
  
  return deepSortKeys(value);
}

/**
 * Deep equality check using normalized JSON comparison
 */
export function deepEqualNormalized(a: any, b: any): boolean {
  try {
    const normA = JSON.stringify(normalizeCriteria(a));
    const normB = JSON.stringify(normalizeCriteria(b));
    return normA === normB;
  } catch {
    return false;
  }
}
