/**
 * importTextFallback.ts
 * Heuristic line-by-line parser for messy supplier price lists that cannot be
 * parsed as standard tabular CSV/TSV (e.g. ANSAL-like plain-text files).
 *
 * SAFE: read-only analysis → never writes to DB.
 * Only activated when the tabular parser fails to find required columns.
 *
 * Example line handled:
 *   100675 BOMBA DE CONDENSADO-MPC ORANGE/RE 100675 DOLARES 65.72 79.52
 *   → code: "100675", description: "BOMBA DE CONDENSADO-MPC ORANGE/RE",
 *     currency: "USD", price: 79.52
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LineCandidateResult {
  code: string;
  description: string;
  detectedCurrency: 'USD' | 'ARS';
  detectedPrice: number;
  rawLine: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Leading token that qualifies as a product code (alphanumeric, ≤ 15 chars) */
const CODE_RE = /^([A-Z0-9][A-Z0-9\-_.\/]{0,14})/i;

/** Decimal number anywhere in text (handles both . and , as decimal separator) */
const DECIMAL_NUM_RE = /\b\d{1,10}[.,]\d{1,4}\b/g;

/** Currency keywords indicating USD */
const USD_KEYWORD_RE = /\b(D[OÓ]LARES?|DOLAR|USD)\b/i;

/** Currency keywords indicating ARS */
const ARS_KEYWORD_RE = /\b(PESOS?|ARS)\b/i;

/** Pure-integer tokens (≥ 4 digits) to strip from descriptions (repeated codes) */
const STANDALONE_INT_RE = /\b\d{4,}\b/g;

// ---------------------------------------------------------------------------
// parseCostValueLocal
// Mirrors the parseCostValue logic already in MassPriceUpdateModal without
// importing it (keeping the fallback self-contained).
// ---------------------------------------------------------------------------
function parseCostValueLocal(raw: string): number {
  const cleaned = raw.replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
  if (!cleaned) return Number.NaN;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    return lastComma > lastDot
      ? Number(cleaned.replace(/\./g, '').replace(',', '.'))
      : Number(cleaned.replace(/,/g, ''));
  }
  return Number(cleaned.replace(',', '.'));
}

// ---------------------------------------------------------------------------
// extractLineCandidate
// ---------------------------------------------------------------------------

/**
 * Attempts to extract a structured product record from a single text line.
 * Returns null when the line cannot be reliably parsed.
 *
 * Algorithm:
 *  1. Require a leading alphanumeric code token.
 *  2. Collect all decimal-number tokens in the line (these are price candidates).
 *  3. Use the LAST decimal number as the price (final/retail price in most
 *     supplier formats; the penultimate would be the unit/list cost).
 *  4. Detect currency from keywords (DOLARES/DOLAR/USD → USD, else ARS).
 *  5. Build description from the text between the code and the
 *     currency-keyword / first-price zone, stripping repeated integer codes.
 */
export function extractLineCandidate(line: string): LineCandidateResult | null {
  const trimmed = line.trim();

  // Minimum: something worth parsing
  if (trimmed.length < 6) return null;

  // 1. Must start with a code-like token
  const codeMatch = CODE_RE.exec(trimmed);
  if (!codeMatch) return null;
  const code = codeMatch[1];

  // 2. Collect all decimal numbers in the line
  const decimalNumbers: string[] = [];
  let m: RegExpExecArray | null;
  const numRe = new RegExp(DECIMAL_NUM_RE.source, 'g');
  while ((m = numRe.exec(trimmed)) !== null) {
    decimalNumbers.push(m[0]);
  }

  // Need at least one price token
  if (decimalNumbers.length === 0) return null;

  // 3. Price = last decimal number
  const rawPrice = decimalNumbers[decimalNumbers.length - 1];
  const detectedPrice = parseCostValueLocal(rawPrice);
  if (!Number.isFinite(detectedPrice) || detectedPrice <= 0) return null;

  // 4. Currency detection
  const detectedCurrency: 'USD' | 'ARS' = USD_KEYWORD_RE.test(trimmed) ? 'USD' : 'ARS';

  // 5. Description = text after the code, up to the currency keyword or first decimal
  const afterCode = trimmed.slice(code.length).trimStart();

  // Find boundary: currency keyword position or first number position
  let descEnd = afterCode.length;

  const currencyMatchUsd = USD_KEYWORD_RE.exec(afterCode);
  const currencyMatchArs = ARS_KEYWORD_RE.exec(afterCode);
  const currencyMatch = currencyMatchUsd ?? currencyMatchArs;

  if (currencyMatch) {
    descEnd = currencyMatch.index;
  } else {
    // No currency keyword → cut at the first decimal number
    const firstNumRe = new RegExp(DECIMAL_NUM_RE.source);
    const firstNumMatch = firstNumRe.exec(afterCode);
    if (firstNumMatch) descEnd = firstNumMatch.index;
  }

  // Raw description (may contain repeated product code integers)
  let description = afterCode.slice(0, descEnd).trim();

  // Strip standalone pure-integer tokens ≥ 4 digits (repeated codes)
  description = description.replace(STANDALONE_INT_RE, '').replace(/\s{2,}/g, ' ').trim();

  if (!description) return null;

  return { code, description, detectedCurrency, detectedPrice, rawLine: line };
}

// ---------------------------------------------------------------------------
// parseSupplierTextFallback
// ---------------------------------------------------------------------------

/**
 * Processes all non-empty lines in the input string through `extractLineCandidate`.
 * Lines that don't meet minimum requirements (code + description + price > 0) are
 * counted as skipped.
 */
export function parseSupplierTextFallback(
  input: string,
): { rows: LineCandidateResult[]; skipped: number } {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows: LineCandidateResult[] = [];
  let skipped = 0;

  for (const line of lines) {
    const candidate = extractLineCandidate(line);
    if (candidate && candidate.code && candidate.description && candidate.detectedPrice > 0) {
      rows.push(candidate);
    } else {
      skipped += 1;
    }
  }

  return { rows, skipped };
}
