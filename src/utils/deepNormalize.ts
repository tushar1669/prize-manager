/**
 * Recursively sort object keys for stable comparison
 */
export function deepSortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepSortKeys(item));
  }
  
  const sorted: Record<string, unknown> = {};
  Object.keys(obj)
    .sort()
    .forEach(key => {
      sorted[key] = deepSortKeys((obj as Record<string, unknown>)[key]);
    });
  
  return sorted;
}

/**
 * Normalize criteria for comparison (sort keys + stable array order)
 */
export function normalizeCriteria(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  
  if (Array.isArray(value)) {
    // If array of objects with stable keys, sort by those
    const first = value[0];
    const hasId = value.length > 0 && first && typeof first === 'object' && 'id' in first;
    const hasName = value.length > 0 && first && typeof first === 'object' && 'name' in first;
    
    if (hasId) {
      return [...value]
        .sort((a, b) => {
          const aId = typeof a === 'object' && a && 'id' in a ? (a as { id: unknown }).id : '';
          const bId = typeof b === 'object' && b && 'id' in b ? (b as { id: unknown }).id : '';
          return String(aId).localeCompare(String(bId));
        })
        .map(item => normalizeCriteria(item));
    }
    
    if (hasName) {
      return [...value]
        .sort((a, b) => {
          const aName = typeof a === 'object' && a && 'name' in a ? (a as { name: unknown }).name : '';
          const bName = typeof b === 'object' && b && 'name' in b ? (b as { name: unknown }).name : '';
          return String(aName).localeCompare(String(bName));
        })
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
export function deepEqualNormalized(a: unknown, b: unknown): boolean {
  try {
    const normA = JSON.stringify(normalizeCriteria(a));
    const normB = JSON.stringify(normalizeCriteria(b));
    return normA === normB;
  } catch {
    return false;
  }
}
