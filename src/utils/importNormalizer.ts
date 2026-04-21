/**
 * Normaliza códigos de producto para matching robusto entre sistema y Excel.
 * - trim
 * - mayúsculas
 * - múltiples espacios → uno solo
 * - guiones raros a '-'
 * - elimina caracteres invisibles comunes
 */
export function normalizeProductCode(str: string): string {
  return String(str || '')
    .replace(/[‐‑‒–—―−﹘﹣－]/g, '-') // guiones raros a '-'
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '') // caracteres invisibles
    .replace(/\s+/g, ' ') // múltiples espacios a uno
    .trim()
    .toUpperCase();
}

/**
 * importNormalizer.ts
 * Utility for normalizing messy Excel/CSV headers and detecting column types
 * for supplier import flows (e.g. ANSAL-like files).
 *
 * SAFE: read-only analysis layer — does NOT modify import logic or DB.
 */

// ---------------------------------------------------------------------------
// Header keyword maps
// ---------------------------------------------------------------------------

const CODE_KEYWORDS = ['cod', 'codigo', 'item', 'sku'];
const DESC_KEYWORDS = ['descripcion', 'detalle', 'producto', 'nombre'];
const PRICE_KEYWORDS = ['precio', 'lista', 'costo', 'importe', 'valor'];

// ---------------------------------------------------------------------------
// normalizeHeader
// ---------------------------------------------------------------------------

/**
 * Strips accents, special chars, and whitespace from a header string so it can
 * be compared against keyword lists regardless of source formatting.
 */
export function normalizeHeader(header: string): string {
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[()]/g, '')
    .replace(/\./g, '_')
    .replace(/[\s-]+/g, '_')
    .replace(/__+/g, '_');
}

/**
 * Infers a semantic type for a header based on keyword matching.
 * Returns 'unknown' when no keyword matches.
 */
export function detectHeaderType(
  normalizedHeader: string,
): 'code' | 'description' | 'price' | 'unknown' {
  if (CODE_KEYWORDS.some((k) => normalizedHeader.includes(k))) return 'code';
  if (DESC_KEYWORDS.some((k) => normalizedHeader.includes(k))) return 'description';
  if (PRICE_KEYWORDS.some((k) => normalizedHeader.includes(k))) return 'price';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// detectColumnType
// ---------------------------------------------------------------------------

/**
 * Analyses up to 20 cell values from a column and infers the column's semantic
 * type based on value characteristics.
 *
 * Rules (in priority order):
 *  1. ≥ 80 % of non-empty values are numeric               → 'price'
 *  2. average string length < 15 AND ≥ 70 % alphanumeric  → 'code'
 *  3. average string length > 20                           → 'description'
 *  4. otherwise                                            → 'unknown'
 */
export function detectColumnType(
  values: unknown[],
): 'code' | 'description' | 'price' | 'unknown' {
  const nonEmpty = values
    .map((v) => String(v ?? '').trim())
    .filter((v) => v.length > 0);

  if (nonEmpty.length === 0) return 'unknown';

  // Rule 1 – numeric ratio
  const numericCount = nonEmpty.filter((v) => {
    const cleaned = v.replace(/[$\s]/g, '').replace(/[.,]/g, '');
    return cleaned.length > 0 && !Number.isNaN(Number(cleaned));
  }).length;

  if (numericCount / nonEmpty.length >= 0.8) return 'price';

  // Rule 2 – short alphanumeric → code
  const lengths = nonEmpty.map((v) => v.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const alphanumericCount = nonEmpty.filter((v) => /^[a-zA-Z0-9\-_./ ]{1,14}$/.test(v)).length;

  if (avgLength < 15 && alphanumericCount / nonEmpty.length >= 0.7) return 'code';

  // Rule 3 – long strings → description
  if (avgLength > 20) return 'description';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// computeConfidenceScore
// ---------------------------------------------------------------------------

/**
 * Returns a 0–1 confidence score for how strongly the sampled values support
 * the given detected type.
 */
export function computeConfidenceScore(
  values: unknown[],
  detectedType: 'code' | 'description' | 'price' | 'unknown',
): number {
  const nonEmpty = values
    .map((v) => String(v ?? '').trim())
    .filter((v) => v.length > 0);

  if (nonEmpty.length === 0 || detectedType === 'unknown') return 0;

  if (detectedType === 'price') {
    const numericCount = nonEmpty.filter((v) => {
      const cleaned = v.replace(/[$\s]/g, '').replace(/[.,]/g, '');
      return cleaned.length > 0 && !Number.isNaN(Number(cleaned));
    }).length;
    return numericCount / nonEmpty.length;
  }

  if (detectedType === 'code') {
    const alphanumericCount = nonEmpty.filter((v) => /^[a-zA-Z0-9\-_./ ]{1,14}$/.test(v)).length;
    return alphanumericCount / nonEmpty.length;
  }

  if (detectedType === 'description') {
    const longCount = nonEmpty.filter((v) => v.length > 20).length;
    return longCount / nonEmpty.length;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface DetectedColumn {
  columnIndex: number;
  originalHeader: string;
  normalizedHeader: string;
  detectedType: 'code' | 'description' | 'price' | 'unknown';
  confidenceScore: number;
}
