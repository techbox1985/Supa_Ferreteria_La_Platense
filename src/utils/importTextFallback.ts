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

import { normalizeHeader } from './importNormalizer';

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

const HEADER_CODE_ALIASES = ['cod', 'codigo', 'code', 'sku', 'articulo', 'artículo'];
const HEADER_PRICE_ALIASES = ['precio', 'cost', 'costo', 'cost_price', 'price', 'importe'];
const HEADER_NAME_ALIASES = ['descripcion', 'descripción', 'description', 'detalle', 'producto', 'nombre', 'name'];

function hasHtmlTableTags(input: string): boolean {
  const raw = String(input || '').toLowerCase();
  const hasTable = raw.includes('<table');
  const hasTr = raw.includes('<tr');
  const hasTdOrTh = raw.includes('<td') || raw.includes('<th');
  return hasTable && hasTr && hasTdOrTh;
}

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
  };

  return String(text || '')
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_match, entity) => {
      const key = String(entity || '');
      if (key.startsWith('#x') || key.startsWith('#X')) {
        const value = Number.parseInt(key.slice(2), 16);
        return Number.isFinite(value) ? String.fromCharCode(value) : _match;
      }
      if (key.startsWith('#')) {
        const value = Number.parseInt(key.slice(1), 10);
        return Number.isFinite(value) ? String.fromCharCode(value) : _match;
      }
      const decoded = named[key.toLowerCase()];
      return decoded !== undefined ? decoded : _match;
    })
    .replace(/\u00a0/g, ' ');
}

function cleanHtmlCell(rawHtml: string): string {
  const withBreaks = String(rawHtml || '').replace(/<br\s*\/?>/gi, ' ');
  const withoutTags = withBreaks.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

function parseHtmlTableRows(input: string): string[][] {
  const rows: string[][] = [];
  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRegex.exec(input)) !== null) {
    const rowHtml = trMatch[1] || '';
    const cells: string[] = [];
    const cellRegex = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cleanHtmlCell(cellMatch[2] || ''));
    }

    if (cells.some((cell) => cell.length > 0)) {
      rows.push(cells);
    }
  }

  return rows;
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.some((alias) => header.includes(normalizeHeader(alias))));
}

function parseSupplierHtmlTableFallback(input: string): { rows: LineCandidateResult[]; skipped: number } | null {
  if (!hasHtmlTableTags(input)) return null;

  const tableRows = parseHtmlTableRows(input);
  if (tableRows.length === 0) return { rows: [], skipped: 0 };

  const maxHeaderScan = Math.min(tableRows.length, 20);
  let headerRowIndex = -1;
  let codeIndex = -1;
  let priceIndex = -1;
  let nameIndex = -1;

  for (let i = 0; i < maxHeaderScan; i += 1) {
    const normalizedHeaders = tableRows[i].map((cell) => normalizeHeader(cell));
    const candidateCodeIndex = findHeaderIndex(normalizedHeaders, HEADER_CODE_ALIASES);
    const candidatePriceIndex = findHeaderIndex(normalizedHeaders, HEADER_PRICE_ALIASES);

    if (candidateCodeIndex >= 0 && candidatePriceIndex >= 0) {
      headerRowIndex = i;
      codeIndex = candidateCodeIndex;
      priceIndex = candidatePriceIndex;
      nameIndex = findHeaderIndex(normalizedHeaders, HEADER_NAME_ALIASES);
      break;
    }
  }

  if (headerRowIndex < 0 || codeIndex < 0 || priceIndex < 0) {
    return null;
  }

  const rows: LineCandidateResult[] = [];
  let skipped = 0;

  for (let i = headerRowIndex + 1; i < tableRows.length; i += 1) {
    const cols = tableRows[i];
    const code = String(cols[codeIndex] || '').trim();
    const rawPrice = String(cols[priceIndex] || '').trim();
    const detectedPrice = parseCostValueLocal(rawPrice);

    if (!code || !Number.isFinite(detectedPrice) || detectedPrice <= 0) {
      skipped += 1;
      continue;
    }

    const description = nameIndex >= 0 ? String(cols[nameIndex] || '').trim() : '';
    const currencySample = cols.join(' ');
    const detectedCurrency: 'USD' | 'ARS' = USD_KEYWORD_RE.test(currencySample) ? 'USD' : 'ARS';

    rows.push({
      code,
      description,
      detectedCurrency,
      detectedPrice,
      rawLine: cols.join('\t'),
    });
  }

  return { rows, skipped };
}

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
  const htmlResult = parseSupplierHtmlTableFallback(input);
  if (htmlResult && htmlResult.rows.length > 0) {
    return htmlResult;
  }

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
