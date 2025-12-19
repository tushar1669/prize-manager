/**
 * Regression test: Import should default `name` to FULL name column
 * when multiple Name columns exist (Swiss-Manager style exports).
 */
import { describe, it, expect } from 'vitest';
import { detectFullVsAbbrevName } from '../src/utils/importSchema';

describe('Name column priority detection', () => {
  it('detects abbreviated vs full name columns correctly', () => {
    const sampleRows = [
      { 'Name': 'Prakhar Tripathi', 'Name (2)': 'T. Prakhar' },
      { 'Name': 'Arun Kumar Singh', 'Name (2)': 'S. Arun Kumar' },
      { 'Name': 'Rajesh Sharma', 'Name (2)': 'S. Rajesh' },
      { 'Name': 'Sunil Verma', 'Name (2)': 'V. Sunil' },
      { 'Name': 'Amit Patel', 'Name (2)': 'P. Amit' },
    ];

    const result = detectFullVsAbbrevName(sampleRows, 'Name', 'Name (2)');
    
    expect(result).not.toBeNull();
    expect(result!.fullNameColumn).toBe('Name');
    expect(result!.shortNameColumn).toBe('Name (2)');
  });

  it('detects when columns are in reverse order', () => {
    const sampleRows = [
      { 'Name': 'T. Prakhar', 'Name (2)': 'Prakhar Tripathi' },
      { 'Name': 'S. Arun', 'Name (2)': 'Arun Kumar Singh' },
      { 'Name': 'V. Rajesh', 'Name (2)': 'Rajesh Sharma' },
      { 'Name': 'P. Sunil', 'Name (2)': 'Sunil Verma' },
    ];

    const result = detectFullVsAbbrevName(sampleRows, 'Name', 'Name (2)');
    
    expect(result).not.toBeNull();
    expect(result!.fullNameColumn).toBe('Name (2)');
    expect(result!.shortNameColumn).toBe('Name');
  });

  it('uses length heuristic when no clear abbreviation pattern', () => {
    const sampleRows = [
      { 'Name': 'Prakhar Tripathi Kumar', 'Name (2)': 'Prakhar T' },
      { 'Name': 'Arun Kumar Singh Verma', 'Name (2)': 'Arun S' },
      { 'Name': 'Rajesh Sharma Patel', 'Name (2)': 'Rajesh P' },
      { 'Name': 'Sunil Verma Kumar', 'Name (2)': 'Sunil V' },
    ];

    const result = detectFullVsAbbrevName(sampleRows, 'Name', 'Name (2)');
    
    expect(result).not.toBeNull();
    // Longer column should be detected as full name
    expect(result!.fullNameColumn).toBe('Name');
    expect(result!.shortNameColumn).toBe('Name (2)');
  });

  it('returns null when columns are too similar to distinguish', () => {
    const sampleRows = [
      { 'Name': 'Prakhar', 'Name (2)': 'Prakhar' },
      { 'Name': 'Arun', 'Name (2)': 'Arun' },
      { 'Name': 'Rajesh', 'Name (2)': 'Rajesh' },
    ];

    const result = detectFullVsAbbrevName(sampleRows, 'Name', 'Name (2)');
    
    // Should return null when can't distinguish
    expect(result).toBeNull();
  });

  it('requires minimum 3 valid samples', () => {
    const sampleRows = [
      { 'Name': 'Prakhar Tripathi', 'Name (2)': 'T. Prakhar' },
      { 'Name': '', 'Name (2)': '' },
    ];

    const result = detectFullVsAbbrevName(sampleRows, 'Name', 'Name (2)');
    
    expect(result).toBeNull();
  });
});
