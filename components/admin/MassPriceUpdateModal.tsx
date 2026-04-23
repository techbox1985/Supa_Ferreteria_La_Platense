import React, { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { SupplierCostImportPreviewRow, SupplierCostImportRow, SupplierCostImportSummary, SupplierMissingProduct, SupplierPriceImportSessionResult, SupplierPriceUpdateResult, SupplierVsExcelSummary } from '../../types';
import { parseSupplierTextFallback } from '../../src/utils/importTextFallback';
import { normalizeProductCode } from '../../src/utils/importNormalizer';

// ...existing code...

interface MassPriceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  providers: string[];
  onUpdate: () => void;
}

type FilterByType = 'All' | 'Categoria' | 'Proveedor';
type UpdateType = 'percentage' | 'fixed';
type TargetPriceType = 'P.Costo' | 'Precio';
type ActionMode = 'mass-update' | 'supplier-import' | 'price-update';
type ImportCurrency = 'ARS' | 'USD';
type SupplierImportProgressStage = 'idle' | 'parsing-file' | 'building-preview' | 'importing-rows' | 'finalizing' | 'done';
type UsdUpdateStage = 'idle' | 'searching' | 'recalculating' | 'saving' | 'finalizing' | 'done' | 'error';

interface PriceColumnCandidate {
  label: string;
  normalizedLabel: string;
  inferredCurrency: 'ARS' | 'USD' | null;
}

interface FileAnalysis {
  headerRowIndex: number;
  priceColumnCandidates: PriceColumnCandidate[];
}

interface SupplierOption {
  id: string;
  name: string;
  isActive: boolean;
  tax1Percent: number;
  tax2Percent: number;
  tax3Percent: number;
}

interface SupplierApiRow {
  id?: string;
  ID_Proveedor?: string;
  name?: string;
  nombre?: string;
  Nombre?: string;
  is_active?: boolean;
  activo?: boolean;
  Activo?: string;
  tax_1_percent?: number;
  tax_2_percent?: number;
  tax_3_percent?: number;
}

interface NotFoundProductRow {
  excel_code: string;
  excel_barcode: string;
  excel_description: string;
  excel_price: number | null;
  system_code: string;
  system_barcode: string;
  search_field: string;
  edit_code: string;
}

const parseCostValue = (value: string): number => {
  const raw = String(value || '').trim();
  if (!raw) return Number.NaN;

  const cleaned = raw.replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
  if (!cleaned) return Number.NaN;

  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');

  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastComma > lastDot) {
      return Number(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    return Number(cleaned.replace(/,/g, ''));
  }

  return Number(cleaned.replace(',', '.'));
};

const getRowKey = (row: SupplierCostImportPreviewRow) => {
  const barcode = (row as SupplierCostImportPreviewRow & { barcode?: string }).barcode;
  return normalizeProductCode((row.cod || barcode || '').toString());
};



const translateStatusLabel = (status: 'found' | 'not found'): string => {
  if (status === 'found') return 'Encontrado';
  return 'No encontrado';
};

const translateResultLabel = (result: 'will update' | 'no change' | 'not found'): string => {
  if (result === 'will update') return 'Se actualizará';
  if (result === 'no change') return 'Sin cambios';
  return 'No encontrado';
};

const translateReasonLabel = (reason: string): string => {
  const reasonMap: Record<string, string> = {
    'exact_code': 'Encontrado por código',
    'exact_barcode': 'Encontrado por barcode',
    'not_found': 'No encontrado',
    'invalid_row': 'Fila inválida',
  };
  return reasonMap[reason] || reason;
};

const mapSupplierOption = (item: SupplierApiRow): SupplierOption => ({
  id: String(item.id || item.ID_Proveedor || ''),
  name: String(item.name || item.nombre || item.Nombre || 'Proveedor sin nombre'),
  isActive:
    item.is_active !== false &&
    item.activo !== false &&
    String(item.Activo || 'SI').toUpperCase() !== 'NO',
  tax1Percent: Number(item.tax_1_percent ?? 0),
  tax2Percent: Number(item.tax_2_percent ?? 0),
  tax3Percent: Number(item.tax_3_percent ?? 0),
});

const normalizeHeader = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()]/g, '')
    .replace(/\./g, '_')
    .replace(/[\s-]+/g, '_')
    .replace(/__+/g, '_');

const splitDelimitedLine = (line: string, delimiter: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
};

const detectDelimiter = (lines: string[]): string => {
  const candidates = ['\t', ';', ',', '|'];
  const sample = lines.slice(0, 5);
  let best = ',';
  let bestScore = -1;

  for (const delimiter of candidates) {
    const counts = sample.map((line) => splitDelimitedLine(line, delimiter).length);
    const min = Math.min(...counts);
    const avg = counts.reduce((acc, n) => acc + n, 0) / Math.max(counts.length, 1);
    const score = min > 1 ? avg : 0;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }

  return best;
};

const findHeaderIndex = (headers: string[], aliases: string[]): number => {
  const aliasSet = new Set(aliases.map((alias) => normalizeHeader(alias)));
  return headers.findIndex((header) => aliasSet.has(header));
};

const isPriceHeader = (normalizedHeader: string): boolean => {
  if (!normalizedHeader) return false;
  return /precio|costo|cost|price|importe|tarifa|pesos/.test(normalizedHeader);
};

const inferCurrencyFromHeader = (normalizedHeader: string): 'ARS' | 'USD' | null => {
  if (/usd|dolar|dollar/.test(normalizedHeader)) return 'USD';
  if (/ars|peso/.test(normalizedHeader)) return 'ARS';
  return null;
};

const findAllPriceColumnCandidates = (rawHeaders: string[], normalizedHeaders: string[]): PriceColumnCandidate[] =>
  normalizedHeaders.reduce<PriceColumnCandidate[]>((acc, h, i) => {
    if (isPriceHeader(h)) {
      acc.push({ label: rawHeaders[i] || h, normalizedLabel: h, inferredCurrency: inferCurrencyFromHeader(h) });
    }
    return acc;
  }, []);

const CODE_HEADER_ALIASES = ['cod', 'codigo', 'código', 'articulo', 'artículo', 'code', 'sku', 'cod. articulo', 'cod articulo', 'cód. artículo', 'cód articulo', 'cod_articulo'];
const DESC_HEADER_ALIASES = ['descripcion', 'descripción', 'description', 'detalle', 'producto', 'nombre', 'name'];

const analyzeImportText = (raw: string): FileAnalysis => {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { headerRowIndex: 0, priceColumnCandidates: [] };

  for (let i = 0; i < Math.min(lines.length, 20); i += 1) {
    for (const delimiter of ['\t', ';', ',', '|']) {
      const rawCells = splitDelimitedLine(lines[i], delimiter);
      if (rawCells.length < 2) continue;
      const normCells = rawCells.map(normalizeHeader);
      const hasCode = findHeaderIndex(normCells, CODE_HEADER_ALIASES) >= 0;
      if (!hasCode) continue;
      const priceCandidates = findAllPriceColumnCandidates(rawCells, normCells);
      const hasDesc = findHeaderIndex(normCells, DESC_HEADER_ALIASES) >= 0;
      if (priceCandidates.length > 0 || hasDesc) {
        return { headerRowIndex: i, priceColumnCandidates: priceCandidates };
      }
    }
  }

  const delimiter = detectDelimiter(lines);
  const rawCells = splitDelimitedLine(lines[0], delimiter);
  const normCells = rawCells.map(normalizeHeader);
  return { headerRowIndex: 0, priceColumnCandidates: findAllPriceColumnCandidates(rawCells, normCells) };
};

const parseSupplierImportRows = (
  raw: string,
  opts?: { headerRowIndex?: number; selectedPriceLabel?: string }
): { rows: SupplierCostImportRow[]; ignored: number; totalRows: number; errors: string[] } => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], ignored: 0, totalRows: 0, errors: ['No hay datos para importar.'] };
  }

  const headerIdx = opts?.headerRowIndex ?? 0;
  const relevantLines = lines.slice(headerIdx);

  if (relevantLines.length === 0) {
    return { rows: [], ignored: 0, totalRows: 0, errors: ['No hay datos después de la fila de cabecera detectada.'] };
  }

  const headerLine = relevantLines[0];
  const delimiter = detectDelimiter(relevantLines);
  const rawHeaders = splitDelimitedLine(headerLine, delimiter);
  const headers = rawHeaders.map((header) => normalizeHeader(header));

  const codIndex = findHeaderIndex(headers, ['cod', 'codigo', 'código', 'articulo', 'artículo', 'code', 'sku']);

  let costIndex: number;
  if (opts?.selectedPriceLabel) {
    costIndex = headers.findIndex((h) => h === normalizeHeader(opts.selectedPriceLabel!));
    if (costIndex < 0) {
      costIndex = findHeaderIndex(headers, ['cost_price', 'cost', 'costo', 'precio_costo', 'precio de costo', 'precio', 'precio_ars', 'precio_usd', 'pesos + iva', 'precio + iva', 'precio final', 'precio con iva']);
    }
  } else {
    costIndex = findHeaderIndex(headers, ['cost_price', 'cost', 'costo', 'precio_costo', 'precio de costo', 'precio', 'precio_ars', 'precio_usd', 'pesos + iva', 'precio + iva', 'precio final', 'precio con iva']);
  }

  const barcodeIndex = findHeaderIndex(headers, ['barcode', 'ean', 'cod_barras', 'codigo de barras', 'código de barras', 'cod.barras']);
  const nameIndex = findHeaderIndex(headers, ['name', 'nombre', 'descripcion', 'descripción', 'description', 'detalle']);
  const categoryIndex = findHeaderIndex(headers, ['category', 'categoria', 'rubro']);
  const subCategoryIndex = findHeaderIndex(headers, ['sub_category', 'subcategoria', 'subrubro']);
  const observationsIndex = findHeaderIndex(headers, ['observations', 'observacion', 'observaciones']);
  const costCurrencyIndex = findHeaderIndex(headers, ['currency', 'moneda', 'cost_currency']);

  if (codIndex < 0 || costIndex < 0) {
    const missing: string[] = [];
    if (codIndex < 0) missing.push('cod/codigo/articulo/code/sku');
    if (costIndex < 0) missing.push('cost_price/costo/precio');

    return {
      rows: [],
      ignored: Math.max(relevantLines.length - 1, 0),
      totalRows: Math.max(relevantLines.length - 1, 0),
      errors: [
        `No se detectaron columnas requeridas: ${missing.join(' y ')}.`,
        `Encabezados detectados: ${rawHeaders.join(', ') || '(vacío)'}.`,
      ],
    };
  }

  const rows: SupplierCostImportRow[] = [];
  let ignored = 0;

  for (let i = 1; i < relevantLines.length; i += 1) {
    const cols = splitDelimitedLine(relevantLines[i], delimiter).map((c) => c.trim());
    const cod = String(cols[codIndex] || '').trim();
    const costValue = String(cols[costIndex] || '').trim();
    const barcode = barcodeIndex >= 0 ? String(cols[barcodeIndex] || '').trim() : '';
    const name = nameIndex >= 0 ? String(cols[nameIndex] || '').trim() : '';
    const category = categoryIndex >= 0 ? String(cols[categoryIndex] || '').trim() : '';
    const sub_category = subCategoryIndex >= 0 ? String(cols[subCategoryIndex] || '').trim() : '';
    const observations = observationsIndex >= 0 ? String(cols[observationsIndex] || '').trim() : '';
    const cost_currency = costCurrencyIndex >= 0 ? String(cols[costCurrencyIndex] || '').trim().toUpperCase() : '';

    if (!cod) {
      ignored += 1;
      continue;
    }

    const cost = parseCostValue(costValue);
    if (!Number.isFinite(cost)) {
      ignored += 1;
      continue;
    }

    rows.push({
      cod,
      cost_price: cost,
      barcode,
      name,
      category,
      sub_category,
      observations,
      cost_currency: cost_currency === 'USD' ? 'USD' : 'ARS',
      line: i + 1,
    });
  }

  return {
    rows,
    ignored,
    totalRows: relevantLines.length - 1,
    errors: [],
  };
};

export const MassPriceUpdateModal: React.FC<MassPriceUpdateModalProps> = ({
  isOpen,
  onClose,
  categories,
  providers,
  onUpdate
}) => {
    // LOG AL INICIO DEL RENDER DEL COMPONENTE (después de los estados)
  const [mode, setMode] = useState<ActionMode>('mass-update');

  const [filterBy, setFilterBy] = useState<FilterByType>('All');
  const [filterValue, setFilterValue] = useState('');
  const [targetPrice, setTargetPrice] = useState<TargetPriceType>('Precio');
  const [updateType, setUpdateType] = useState<UpdateType>('percentage');
  const [updateValue, setUpdateValue] = useState('');
  
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [importText, setImportText] = useState('');
  const [fileCurrency, setFileCurrency] = useState<ImportCurrency>('ARS');
  const [exchangeRate, setExchangeRate] = useState('1000');
  const [usdUpdateRate, setUsdUpdateRate] = useState('1000');
  const [parsedImportRows, setParsedImportRows] = useState<SupplierCostImportRow[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<SupplierCostImportPreviewRow[]>([]);
    // --- SAFE ARRAY GUARD: All usages must use this guarded array ---
    const safeImportPreviewRows: SupplierCostImportPreviewRow[] = Array.isArray(importPreviewRows) ? importPreviewRows : [];
    // --- Derived map for fast lookup by code ---
  const [supplierImportStep, setSupplierImportStep] = useState<'edit' | 'preview' | 'result'>('edit');
  const [supplierImportProgress, setSupplierImportProgress] = useState<{ stage: SupplierImportProgressStage; percent: number }>({ stage: 'idle', percent: 0 });
  const [isFetchingExchangeRate, setIsFetchingExchangeRate] = useState(false);
  const [exchangeRateWarning, setExchangeRateWarning] = useState('');
  const [exchangeRateSource, setExchangeRateSource] = useState('');
  const [importSummary, setImportSummary] = useState<SupplierCostImportSummary | null>(null);
  const [notFoundCodeSamples, setNotFoundCodeSamples] = useState<string[]>([]);
  const [providerMissingProducts, setProviderMissingProducts] = useState<SupplierMissingProduct[]>([]);
  const [showMissingModal, _setShowMissingModal] = useState(false);
  const [matchedKeysSet, setMatchedKeysSet] = useState<Set<string>>(new Set());

  // Wrappers para logs de estado
  const setShowMissingModal = (val: boolean, origin = '') => {
    const providerMissingLength = providerMissingProducts.length;
    // eslint-disable-next-line no-console
    console.log('[MASS_STATE_FLOW]', {
      action: 'setShowMissingModal',
      origin,
      value: val,
      providerMissingLength,
      showMissingModal: val
    });
    _setShowMissingModal(val);
  };

  // Log de cambios de estado
  useEffect(() => {
    const providerMissingLength = providerMissingProducts.length;
    // eslint-disable-next-line no-console
    console.log('[MASS_STATE_FLOW]', {
      action: 'useEffect',
      providerMissingLength,
      showMissingModal
    });
  }, [providerMissingProducts, showMissingModal]);

  if (typeof window !== 'undefined') {
    const providerMissingLength = providerMissingProducts.length;
    // eslint-disable-next-line no-console
    console.log('[MASS_MODAL_RENDER_ROOT]', {
      render: true,
      showMissingModal,
      providerMissingLength,
    });
  }

  const [isProcessingUsdUpdate, setIsProcessingUsdUpdate] = useState(false);
  const [usdUpdateStage, setUsdUpdateStage] = useState<UsdUpdateStage>('idle');
  const [usdUpdatePercent, setUsdUpdatePercent] = useState(0);
  const [usdUpdateResult, setUsdUpdateResult] = useState<{ updated: number } | null>(null);
  const [usdUpdateError, setUsdUpdateError] = useState('');

  const [fileAnalysis, setFileAnalysis] = useState<FileAnalysis | null>(null);
  const [selectedPriceLabel, setSelectedPriceLabel] = useState('');

  const [notFoundProductRows, setNotFoundProductRows] = useState<NotFoundProductRow[]>([]);
  const [editingNotFoundRows, setEditingNotFoundRows] = useState<Map<string, string>>(new Map());
  const [showRetryAfterEdit, setShowRetryAfterEdit] = useState(false);

  // ─── PROMPT 010: Estados del flujo "Actualización" ─────────────────────────
  type PriceUpdateFlowStep = 'form' | 'uploading' | 'mapping' | 'preview' | 'confirming' | 'result';
  const [puStep, setPuStep] = useState<PriceUpdateFlowStep>('form');
  const [puSupplierId, setPuSupplierId] = useState('');
  const [puCurrency, setPuCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [puExchangeRate, setPuExchangeRate] = useState('1000');
  const [puFilename, setPuFilename] = useState('');
  const [puRawImportText, setPuRawImportText] = useState('');
  const [puHeadersDetected, setPuHeadersDetected] = useState<string[]>([]);
  const [puColumnMapping, setPuColumnMapping] = useState<{ codeColumn: string | null; priceColumn: string | null }>({
    codeColumn: null,
    priceColumn: null,
  });
  const [puSessionResult, setPuSessionResult] = useState<SupplierPriceImportSessionResult | null>(null);
  const [puUpdateResult, setPuUpdateResult] = useState<SupplierPriceUpdateResult | null>(null);
  const [puError, setPuError] = useState('');
  const [puSessionId, setPuSessionId] = useState('');
  const [puMissingProducts, setPuMissingProducts] = useState<SupplierMissingProduct[]>([]);
  const [puShowMissing, setPuShowMissing] = useState(false);
  const [puSupplierTotalProducts, setPuSupplierTotalProducts] = useState(0);
  const [puSupplierTotalLoading, setPuSupplierTotalLoading] = useState(false);
  const [puVsExcelSummary, setPuVsExcelSummary] = useState<SupplierVsExcelSummary | null>(null);
  // ──────────────────────────────────────────────────────────────────────────

  const { addToast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    const loadSuppliers = async () => {
      try {
        const raw = await api.getSuppliersSupabase();
        const options = (raw || [])
          .map((item: SupplierApiRow) => mapSupplierOption(item))
          .filter((s: SupplierOption) => s.id.length > 0);
        setSupplierOptions(options);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudieron cargar proveedores';
        setError(msg);
      }
    };

    loadSuppliers();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setMode('mass-update');
      setError('');
      setStep('form');
      setSelectedSupplierId('');
      setImportText('');
      setFileCurrency('ARS');
      setExchangeRate('1000');
      setUsdUpdateRate('1000');
      setParsedImportRows([]);
      setImportPreviewRows([]);
      setSupplierImportStep('edit');
      setSupplierImportProgress({ stage: 'idle', percent: 0 });
      setIsFetchingExchangeRate(false);
      setExchangeRateWarning('');
      setExchangeRateSource('');
      setImportSummary(null);
      setNotFoundCodeSamples([]);
      setProviderMissingProducts([]);
      setShowMissingModal(false, 'resetSupplierImportFlow');
      setMatchedKeysSet(new Set());
      setIsProcessingUsdUpdate(false);
      setUsdUpdateStage('idle');
      setUsdUpdatePercent(0);
      setUsdUpdateResult(null);
      setUsdUpdateError('');
      setFileAnalysis(null);
      setSelectedPriceLabel('');
      setNotFoundProductRows([]);
      setEditingNotFoundRows(new Map());
      setShowRetryAfterEdit(false);
      // PROMPT 010: reset flujo Actualización
      setPuStep('form');
      setPuSupplierId('');
      setPuCurrency('ARS');
      setPuExchangeRate('1000');
      setPuFilename('');
      setPuRawImportText('');
      setPuHeadersDetected([]);
      setPuColumnMapping({ codeColumn: null, priceColumn: null });
      setPuSessionResult(null);
      setPuVsExcelSummary(null);
      setPuUpdateResult(null);
      setPuError('');
      setPuSessionId('');
      setPuSupplierTotalProducts(0);
      setPuSupplierTotalLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (mode !== 'supplier-import') return;
    setImportPreviewRows([]);
    setParsedImportRows([]);
    setImportSummary(null);
    setNotFoundCodeSamples([]);
    setProviderMissingProducts([]);
    setShowMissingModal(false, 'useEffect mode change');
    setMatchedKeysSet(new Set());
    setSupplierImportStep('edit');
    setSupplierImportProgress({ stage: 'idle', percent: 0 });
    setExchangeRateWarning('');
  }, [selectedSupplierId, importText, fileCurrency, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!importText) {
      setFileAnalysis(null);
      setSelectedPriceLabel('');
      return;
    }
    const analysis = analyzeImportText(importText);
    setFileAnalysis(analysis);
    if (analysis.priceColumnCandidates.length === 1) {
      const candidate = analysis.priceColumnCandidates[0];
      setSelectedPriceLabel(candidate.normalizedLabel);
      if (candidate.inferredCurrency) setFileCurrency(candidate.inferredCurrency);
    } else if (analysis.priceColumnCandidates.length === 0) {
      setSelectedPriceLabel('');
    }
    if (analysis.priceColumnCandidates.length > 1 && !selectedPriceLabel) {
      setSelectedPriceLabel('');
    }
  }, [importText]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchExchangeRateSuggestion = useCallback(async () => {
    setIsFetchingExchangeRate(true);
    setExchangeRateWarning('');
    try {
      const suggestion = await api.fetchUsdArsExchangeRateSuggestion();
      const formatted = String(Number(suggestion.rate.toFixed(2)));
      setExchangeRate(formatted);
      setUsdUpdateRate(formatted);
      setExchangeRateSource(suggestion.source);
    } catch {
      setExchangeRateWarning('No se pudo obtener el dólar actual. Ingresalo manualmente.');
      setExchangeRateSource('');
      if (!exchangeRate) {
        setExchangeRate('');
      }
    } finally {
      setIsFetchingExchangeRate(false);
    }
  }, [exchangeRate]);

  useEffect(() => {
    if (!isOpen) return;
    if (mode !== 'supplier-import') return;
    if (fileCurrency !== 'USD') return;
    fetchExchangeRateSuggestion();
  }, [fileCurrency, fetchExchangeRateSuggestion, isOpen, mode]);

  const resetSupplierImportFlow = () => {
    setImportText('');
    setParsedImportRows([]);
    setImportPreviewRows([]);
    setImportSummary(null);
    setNotFoundCodeSamples([]);
    setProviderMissingProducts([]);
    setShowMissingModal(false);
    setMatchedKeysSet(new Set());
    setSupplierImportStep('edit');
    setSupplierImportProgress({ stage: 'idle', percent: 0 });
    setFileAnalysis(null);
    setSelectedPriceLabel('');
    setError('');
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if ((filterBy !== 'All' && !filterValue) || !updateValue) {
      setError('Todos los campos son obligatorios.');
      return;
    }
    const numValue = parseFloat(String(updateValue).replace(',', '.'));
    if(isNaN(numValue)){
        setError('El valor de actualización debe ser un número.');
        return;
    }
    setStep('confirm');
  };

  const handleConfirmUpdate = async () => {
    setIsProcessing(true);
    setError('');
    try {
        await api.massUpdatePrices({
            filterBy,
            filterValue: filterBy === 'All' ? 'All' : filterValue,
            targetPrice,
            updateType,
            updateValue: parseFloat(String(updateValue).replace(',', '.')),
        });
        addToast("Precios actualizados masivamente con éxito.", 'success');
        onUpdate();
        onClose();
    } catch(err) {
        const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
        console.error("Mass update failed", err);
        setError(`Error: ${errorMessage}`);
    } finally {
        setIsProcessing(false);
        setStep('form');
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    try {
      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          setError('El archivo Excel no tiene hojas.');
          return;
        }
        const worksheet = workbook.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: '' }) as unknown[][];
        if (aoa.length === 0) {
          setError('El archivo Excel está vacío.');
          return;
        }
        const tsv = aoa.map((row) => (row as unknown[]).map((cell) => String(cell ?? '')).join('\t')).join('\n');
        setImportText(tsv);
        setError('');
      } else {
        const text = await file.text();
        setImportText(text);
        setError('');
      }
    } catch {
      setError('No se pudo leer el archivo seleccionado.');
    }
  };

  const handlePreviewSupplierCosts = async () => {
    setError('');
    setImportSummary(null);
    setNotFoundCodeSamples([]);

    if (!selectedSupplierId) {
      setError('Debe seleccionar un proveedor para importar costos.');
      return;
    }

    if (!importText.trim()) {
      setError('Debe cargar un archivo o ingresar datos antes de continuar.');
      return;
    }

    if (fileAnalysis && fileAnalysis.priceColumnCandidates.length > 1 && !selectedPriceLabel) {
      setError('Se detectaron múltiples columnas de precio. Por favor seleccionar cuál usar antes de continuar.');
      return;
    }

    setSupplierImportProgress({ stage: 'parsing-file', percent: 20 });
    const parsed = parseSupplierImportRows(importText, {
      headerRowIndex: fileAnalysis?.headerRowIndex ?? 0,
      selectedPriceLabel: selectedPriceLabel || undefined,
    });

    let resolvedRows = parsed.rows;
    let resolvedCurrency = fileCurrency;

    if (parsed.errors.length > 0) {
      const fallback = parseSupplierTextFallback(importText);

      if (fallback.rows.length === 0) {
        setError(
          'No se detectó estructura tabular ni fue posible reconstruir código/precio desde líneas de texto. ' +
          parsed.errors.join(' '),
        );
        setSupplierImportProgress({ stage: 'idle', percent: 0 });
        setShowMissingModal(false, 'fallback error');
        setMatchedKeysSet(new Set());
        return;
      }

      resolvedRows = fallback.rows.map(
        (row, i): SupplierCostImportRow => ({
          cod: row.code,
          cost_price: row.detectedPrice,
          barcode: '',
          name: row.description,
          category: '',
          sub_category: '',
          observations: '',
          cost_currency: row.detectedCurrency,
          line: i + 1,
        }),
      );

      const hasUsd = fallback.rows.some((r) => r.detectedCurrency === 'USD');
      if (hasUsd) resolvedCurrency = 'USD';
    }

    const parsedExchangeRate = parseFloat(String(exchangeRate).replace(',', '.'));
    if (resolvedCurrency === 'USD' && (!Number.isFinite(parsedExchangeRate) || parsedExchangeRate <= 0)) {
      setError('Debe ingresar un tipo de cambio válido mayor a 0 para archivos en USD.');
      setShowMissingModal(false, 'import error');
      setMatchedKeysSet(new Set());
      return;
    }

    setIsProcessing(true);
    try {
      setSupplierImportProgress({ stage: 'building-preview', percent: 55 });
      const response = await api.previewSupplierCostsSupabase(selectedSupplierId, resolvedRows, {
        fileCurrency: resolvedCurrency,
        exchangeRate: parsedExchangeRate,
      });
      const { previewRows, matchedKeysArray, providerMissingProducts } = response;
      const matchedKeysSet = new Set(matchedKeysArray);
      // eslint-disable-next-line no-console
      console.log('[FINAL_MATCH_FIXED]', {
        arrayLength: matchedKeysArray.length,
        setSize: matchedKeysSet.size,
      });
      setParsedImportRows(resolvedRows);
      setImportPreviewRows(previewRows);
      setProviderMissingProducts(providerMissingProducts);
      setMatchedKeysSet(matchedKeysSet);
      setSupplierImportStep('preview');
      setSupplierImportProgress({ stage: 'done', percent: 100 });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      setError(`Error: ${errorMessage}`);
      setSupplierImportProgress({ stage: 'idle', percent: 0 });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportSupplierCosts = async () => {
    setError('');
    setImportSummary(null);
    setNotFoundCodeSamples([]);
    setShowMissingModal(false, 'handleImportSupplierCosts start');

    if (!selectedSupplierId) {
      setError('Debe seleccionar un proveedor para importar costos.');
      return;
    }

    if (parsedImportRows.length === 0) {
      setError('Primero debe generar la vista previa antes de importar.');
      return;
    }

    const parsedExchangeRate = parseFloat(String(exchangeRate).replace(',', '.'));
    if (fileCurrency === 'USD' && (!Number.isFinite(parsedExchangeRate) || parsedExchangeRate <= 0)) {
      setError('Debe ingresar un tipo de cambio válido mayor a 0 para importar USD.');
      return;
    }

    setIsProcessing(true);
    try {

      setSupplierImportProgress({ stage: 'importing-rows', percent: 70 });
      const summary = await api.importSupplierCostsSupabase(selectedSupplierId, parsedImportRows, {
        fileCurrency,
        exchangeRate: parsedExchangeRate,
      });
      const mergedSummary: SupplierCostImportSummary = {
        ...summary,
        totalRows: parsedImportRows.length + summary.ignored,
        ignored: summary.ignored,
      };

      setImportSummary(mergedSummary);
      setSupplierImportStep('result');
      setSupplierImportProgress({ stage: 'finalizing', percent: 90 });

      addToast('Importación de costos finalizada.', 'success');
      onUpdate();
      setSupplierImportProgress({ stage: 'done', percent: 100 });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      setError(`Error: ${errorMessage}`);
      setSupplierImportProgress({ stage: 'idle', percent: 0 });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateUsdByExchangeRate = async () => {
    setError('');
    setUsdUpdateError('');
    setUsdUpdateResult(null);
    setUsdUpdatePercent(0);
    const nextRate = parseFloat(String(usdUpdateRate).replace(',', '.'));
    if (!Number.isFinite(nextRate) || nextRate <= 0) {
      setUsdUpdateError('Debe ingresar un tipo de cambio válido mayor a 0 para actualizar USD.');
      return;
    }

    setIsProcessingUsdUpdate(true);
    setUsdUpdateStage('searching');
    setUsdUpdatePercent(10);
    try {
      const result = await api.updateUsdProductsByExchangeRateSupabase(nextRate, (stage, percent) => {
        setUsdUpdateStage(stage as UsdUpdateStage);
        setUsdUpdatePercent(percent);
      });
      setUsdUpdateResult(result);
      setUsdUpdateStage('done');
      setUsdUpdatePercent(100);
      addToast(`Actualización USD completada. Productos actualizados: ${result.updated}.`, 'success');
      onUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      setUsdUpdateError(errorMessage);
      setUsdUpdateStage('error');
      setUsdUpdatePercent(0);
    } finally {
      setIsProcessingUsdUpdate(false);
    }
  };

  const handleCopyMissingList = async () => {
    if (providerMissingProducts.length === 0) {
      setShowMissingModal(false, 'handleCopyMissingList');
      return;
    }

    const text = providerMissingProducts
      .map((row) => {
        return [row.cod || '-', row.barcode || '-', row.description || row.cod || '-', row.price != null ? String(row.price) : '-'].join('\t');
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      addToast('Lista copiada al portapapeles.', 'success');
    } catch {
      addToast('No se pudo copiar la lista.', 'error');
    }
  };

  const handleStartEditNotFound = async () => {
    let supplierProducts: any[] = [];
    try {
      const allProducts = await api.getProductsSupabase();
      supplierProducts = allProducts.filter((product) => String(product.supplier_id || '') === selectedSupplierId);
    } catch {
      supplierProducts = [];
    }

    // Preparar fila por fila con la data de búsqueda fallida
    const missingRows = safeImportPreviewRows.filter(
      (row: SupplierCostImportPreviewRow) => !matchedKeysSet.has(getRowKey(row))
    );

    const enrichedRows: NotFoundProductRow[] = missingRows
      .map((row: SupplierCostImportPreviewRow) => {
        const parsedRow = parsedImportRows.find((pr) => String(pr.cod || '') === String(row.cod || ''));
        const excelBarcode = String(parsedRow?.barcode || '').trim();

        const candidate = supplierProducts.find((product) => {
          const productCode = normalizeProductCode(product.cod || '');
          const productBarcode = normalizeProductCode(product['cod.barras'] || '');
          const inputCode = normalizeProductCode(row.cod || '');
          const inputBarcode = normalizeProductCode(excelBarcode || '');
          if (!inputCode && !inputBarcode) return false;
          return (inputBarcode && productCode === inputBarcode) || (inputCode && productBarcode === inputCode);
        });

        return {
          excel_code: row.cod,
          excel_barcode: excelBarcode,
          excel_description: row.product_name || row.cod,
          excel_price: row.input_cost,
          system_code: String(candidate?.cod || '').trim(),
          system_barcode: String(candidate?.['cod.barras'] || '').trim(),
          search_field: (row as any).matchedBy === 'barcode' ? 'Barcode' : 'Código',
          edit_code: row.cod,
        };
      });

    setNotFoundProductRows(enrichedRows);
    const initialEdits = new Map<string, string>();
    enrichedRows.forEach((row) => {
      initialEdits.set(row.excel_code, row.edit_code);
    });
    setEditingNotFoundRows(initialEdits);
    setShowRetryAfterEdit(true);
  };

  const handleEditCodeInNotFound = (excelCode: string, newCode: string) => {
    const updated = new Map(editingNotFoundRows);
    updated.set(excelCode, newCode);
    setEditingNotFoundRows(updated);
  };

  const handleRetryMatchAfterEdit = async () => {
    // Modificar los parsedImportRows con los códigos editados
    const updatedRows = parsedImportRows.map((row) => {
      const newCode = editingNotFoundRows.get(row.cod);
      return newCode ? { ...row, cod: newCode } : row;
    });

    // Regenerar preview con los códigos corregidos
    setError('');
    setShowRetryAfterEdit(false);
    setSupplierImportProgress({ stage: 'building-preview', percent: 55 });
    setIsProcessing(true);
    try {
      const response = await api.previewSupplierCostsSupabase(selectedSupplierId, updatedRows, {
        fileCurrency,
        exchangeRate: parseFloat(String(exchangeRate).replace(',', '.')),
      });
      const { previewRows, matchedKeysArray, providerMissingProducts } = response;
      const matchedKeysSet = new Set(matchedKeysArray);
      // eslint-disable-next-line no-console
      console.log('[FINAL_MATCH_FIXED]', {
        arrayLength: matchedKeysArray.length,
        setSize: matchedKeysSet.size,
      });
      setParsedImportRows(updatedRows);
      setImportPreviewRows(previewRows);
      setProviderMissingProducts(providerMissingProducts);
      setMatchedKeysSet(matchedKeysSet);
      setNotFoundProductRows([]);
      setEditingNotFoundRows(new Map());
      setSupplierImportProgress({ stage: 'done', percent: 100 });
      addToast('Vista previa actualizada con códigos revisados.', 'success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      setError(`Error al regenerar preview: ${errorMessage}`);
      setSupplierImportProgress({ stage: 'idle', percent: 0 });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const renderFilterValueInput = () => {
    if (filterBy === 'Categoria') {
      return (
        <select value={filterValue} onChange={e => setFilterValue(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md" required>
          <option value="">Seleccionar Categoría...</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      );
    }
    if (filterBy === 'Proveedor') {
      return (
        <select value={filterValue} onChange={e => setFilterValue(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md" required>
          <option value="">Seleccionar Proveedor...</option>
          {providers.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      );
    }
    return null;
  };
  
  const confirmationText = `Va a actualizar el campo '${targetPrice === 'Precio' ? 'Precio Base (Lista)' : 'Precio de Costo'}' para todos los productos donde '${filterBy}' es '${filterBy === 'All' ? 'Todos' : filterValue}'. El precio se ${updateType === 'percentage' ? `incrementará en un ${updateValue}%` : `incrementará en $${updateValue}`}.`;
  const selectedSupplier = supplierOptions.find((supplier) => supplier.id === selectedSupplierId) || null;
  const isUsdFileCurrency = fileCurrency === 'USD';
  const totalRows = safeImportPreviewRows.length;
  const foundCount = safeImportPreviewRows.filter(
    (row: SupplierCostImportPreviewRow) => matchedKeysSet.has(getRowKey(row))
  ).length;
  const missingCount = totalRows - foundCount;
  const previewCounts = {
    found: foundCount,
    notFound: missingCount,
    willUpdate: safeImportPreviewRows.filter((row: SupplierCostImportPreviewRow) => row.result === 'will update').length,
    noChange: safeImportPreviewRows.filter((row: SupplierCostImportPreviewRow) => row.result === 'no change').length,
  };
  const providerTotal = importSummary?.existingSupplierProducts ?? 0;
  const providerMissingInFile = providerMissingProducts.length;
  const providerFoundInFile = Math.max(providerTotal - providerMissingInFile, 0);

  const fileProcessed = totalRows;
  const fileFoundInBase = foundCount;
  const fileMissingInBase = missingCount;
  const fileUnmatchedRows = safeImportPreviewRows.filter(
    (row: SupplierCostImportPreviewRow) => !matchedKeysSet.has(getRowKey(row))
  );
  // eslint-disable-next-line no-console
  console.log('[KEY_COMPARE_DEBUG]', {
    samplePreview: safeImportPreviewRows.slice(0, 5).map((r) => getRowKey(r)),
    sampleMatched: Array.from(matchedKeysSet).slice(0, 5),
  });
  const suspiciousMissing = fileUnmatchedRows.filter((r: SupplierCostImportPreviewRow) =>
    ['W180CO112', 'W180CO114', 'W180CO118'].includes(String(r.cod || (r as any).barcode || '').trim())
  );
  // eslint-disable-next-line no-console
  console.log('[MODAL_MISSING_SOURCE]', {
    previewCount: safeImportPreviewRows.length,
    matchedCount: matchedKeysSet.size,
    fileUnmatchedRowsCount: fileUnmatchedRows.length,
    providerMissingProductsCount: providerMissingProducts.length,
    sampleMissing: providerMissingProducts.slice(0, 10).map((r) => r.cod || r.barcode || '')
  });
  if (suspiciousMissing.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[MODAL_SUSPICIOUS_MISSING]', suspiciousMissing);
  }
  // eslint-disable-next-line no-console
  console.log('[FINAL_UI_COUNTS]', {
    totalRows,
    foundCount,
    missingCount,
    matchedSetSize: matchedKeysSet.size,
  });

  // ─── PROMPT 010: Handlers del flujo "Actualización" ───────────────────────
  const extractHeadersForManualMapping = useCallback((rawText: string): string[] => {
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return [];

    const analysis = analyzeImportText(rawText);
    const headerRowIndex = Math.min(Math.max(analysis.headerRowIndex, 0), lines.length - 1);
    const relevantLines = lines.slice(headerRowIndex);
    if (relevantLines.length === 0) return [];

    const delimiter = detectDelimiter(relevantLines);
    return splitDelimitedLine(relevantLines[0], delimiter)
      .map((h) => String(h || '').trim())
      .filter((h) => h.length > 0);
  }, []);

  const parseWithManualMapping = useCallback((rawText: string, codeColumn: string, priceColumn: string) => {
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return { rows: [], ignored: 0, totalRows: 0, errors: ['No hay datos para importar.'] };
    }

    const analysis = analyzeImportText(rawText);
    const headerRowIndex = Math.min(Math.max(analysis.headerRowIndex, 0), lines.length - 1);
    const relevantLines = lines.slice(headerRowIndex);
    if (relevantLines.length === 0) {
      return { rows: [], ignored: 0, totalRows: 0, errors: ['No hay datos después de la fila de cabecera detectada.'] };
    }

    const delimiter = detectDelimiter(relevantLines);
    const sourceHeaders = splitDelimitedLine(relevantLines[0], delimiter).map((h) => String(h || '').trim());
    const normalizedHeaders = sourceHeaders.map((h) => normalizeHeader(h));
    const codeIdx = normalizedHeaders.findIndex((h) => h === normalizeHeader(codeColumn));
    const priceIdx = normalizedHeaders.findIndex((h) => h === normalizeHeader(priceColumn));

    if (codeIdx < 0 || priceIdx < 0) {
      return { rows: [], ignored: 0, totalRows: 0, errors: ['No se pudo aplicar el mapeo manual. Revisá las columnas elegidas.'] };
    }

    const remappedTsv = [
      'cod\tcost_price',
      ...relevantLines.slice(1).map((line) => {
        const cols = splitDelimitedLine(line, delimiter).map((c) => String(c || '').trim());
        return `${cols[codeIdx] || ''}\t${cols[priceIdx] || ''}`;
      }),
    ].join('\n');

    return parseSupplierImportRows(remappedTsv, { headerRowIndex: 0 });
  }, []);

  const fetchSupplierVsExcelSummary = useCallback(async (sessionId: string, supplierId: string): Promise<{ summary: SupplierVsExcelSummary; missingProducts: SupplierMissingProduct[] }> => {
    if (!api.supabase) {
      return {
        summary: { totalSupplier: 0, matchedByCod: 0, matchedByBarcode: 0, missingFromExcel: 0 },
        missingProducts: [],
      };
    }

    const [{ data: tempRows, error: tempErr }, { data: products, error: prodErr }] = await Promise.all([
      api.supabase
        .from('st_supplier_price_import_temp')
        .select('excel_code')
        .eq('import_session_id', sessionId),
      api.supabase
        .from('st_products')
        .select('id, cod, barcode, name, final_price')
        .eq('supplier_id', supplierId)
        .eq('is_deleted', false),
    ]);

    if (tempErr) throw tempErr;
    if (prodErr) throw prodErr;

    const excelCodes = new Set<string>(
      (tempRows || []).map((row: any) => String(row?.excel_code || '').trim().toLowerCase()).filter(Boolean)
    );

    let matchedByCod = 0;
    let matchedByBarcode = 0;
    const missingProducts: SupplierMissingProduct[] = [];

    for (const product of (products || [])) {
      const cod = String(product?.cod || '').trim().toLowerCase();
      const barcode = String(product?.barcode || '').trim().toLowerCase();

      if (cod && excelCodes.has(cod)) {
        matchedByCod += 1;
      } else if (barcode && excelCodes.has(barcode)) {
        matchedByBarcode += 1;
      } else {
        missingProducts.push({
          id: String(product?.id || ''),
          cod: String(product?.cod || '').trim(),
          barcode: String(product?.barcode || '').trim(),
          description: String(product?.name || '').trim(),
          price: Number.isFinite(Number(product?.final_price)) ? Number(product.final_price) : null,
        });
      }
    }

    return {
      summary: {
        totalSupplier: (products || []).length,
        matchedByCod,
        matchedByBarcode,
        missingFromExcel: missingProducts.length,
      },
      missingProducts,
    };
  }, []);

  const uploadParsedRowsToTemp = useCallback(async (rows: SupplierCostImportRow[], sourceFilename: string) => {
    const selectedSupplier = supplierOptions.find((s) => s.id === puSupplierId);
    const supplierName = selectedSupplier?.name ?? '';
    const exchangeRateNum = puCurrency === 'USD' ? Number(puExchangeRate) || 1 : 1;

    // eslint-disable-next-line no-console
    console.log('[PRICE_UPDATE_SUPPLIER_SELECTED]', {
      supplierId: puSupplierId,
      supplierName,
    });

    const sessionId = api.createPriceImportSession();
    setPuSessionId(sessionId);

    try {
      const tempRows = rows.map((row, idx) => ({
        import_session_id: sessionId,
        supplier_id: puSupplierId,
        supplier_name_snapshot: supplierName,
        source_filename: sourceFilename,
        file_currency: puCurrency,
        exchange_rate: exchangeRateNum,
        row_number: idx + 1,
        excel_code: row.cod ?? '',
        excel_name: row.name ?? '',
        excel_price: typeof row.cost_price === 'number' ? row.cost_price : null,
      }));

      const sessionResult = await api.uploadRowsToTempTable(tempRows);
      setPuSessionResult(sessionResult);

      // Resumen desde perspectiva del proveedor (COD-first, sin doble conteo)
      const { summary, missingProducts } = await fetchSupplierVsExcelSummary(sessionId, puSupplierId);
      setPuVsExcelSummary(summary);
      setPuMissingProducts(missingProducts);
      setPuStep('preview');
    } catch (err) {
      try { await api.cleanupTempImportSession(sessionId); } catch { /* ignore cleanup error */ }
      setPuSessionId('');
      throw err;
    }
  }, [puSupplierId, puCurrency, puExchangeRate, supplierOptions, fetchSupplierVsExcelSummary]);

  const handlePriceUpdateFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!puSupplierId) { setPuError('Seleccioná un proveedor antes de subir el archivo.'); return; }
    setPuError('');
    setPuStep('uploading');
    setPuFilename(file.name);
    try {
      // Leer el archivo respetando formato: xlsx/xls via XLSX, resto como texto
      let text: string;
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) { setPuError('El archivo Excel no tiene hojas.'); setPuStep('form'); return; }
        const worksheet = workbook.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: '' }) as unknown[][];
        if (aoa.length === 0) { setPuError('El archivo Excel está vacío.'); setPuStep('form'); return; }
        text = aoa.map((row) => (row as unknown[]).map((cell) => String(cell ?? '')).join('\t')).join('\n');
      } else {
        text = await file.text();
      }
      setPuRawImportText(text);

      const parsed = parseSupplierImportRows(text, {
        headerRowIndex: analyzeImportText(text).headerRowIndex,
      });

      if (parsed.rows.length === 0) {
        const requiresManualMapping = parsed.errors.some((msg) =>
          normalizeHeader(msg).includes('no_se_detectaron_columnas_requeridas')
        );

        if (requiresManualMapping) {
          const detectedHeaders = extractHeadersForManualMapping(text);
          if (detectedHeaders.length > 0) {
            setPuHeadersDetected(detectedHeaders);

            const storageKey = `supplier_column_mapping_${puSupplierId}`;
            let savedCode: string | null = null;
            let savedPrice: string | null = null;
            try {
              const rawSaved = localStorage.getItem(storageKey);
              if (rawSaved) {
                const parsedSaved = JSON.parse(rawSaved) as { codeColumn?: string; priceColumn?: string };
                savedCode = parsedSaved.codeColumn || null;
                savedPrice = parsedSaved.priceColumn || null;
              }
            } catch {
              // ignore invalid localStorage
            }

            setPuColumnMapping({
              codeColumn: savedCode && detectedHeaders.some((h) => normalizeHeader(h) === normalizeHeader(savedCode))
                ? savedCode
                : null,
              priceColumn: savedPrice && detectedHeaders.some((h) => normalizeHeader(h) === normalizeHeader(savedPrice))
                ? savedPrice
                : null,
            });

            setPuStep('mapping');
            return;
          }
        }

        setPuError(parsed.errors.join(' ') || 'No se encontraron filas válidas en el archivo.');
        setPuStep('form');
        return;
      }

      await uploadParsedRowsToTemp(parsed.rows, file.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el archivo';
      setPuError(msg);
      setPuStep('form');
    }
  }, [puSupplierId, extractHeadersForManualMapping, uploadParsedRowsToTemp]);

  const handleConfirmManualMapping = useCallback(async () => {
    if (!puRawImportText) {
      setPuError('No hay archivo cargado para mapear.');
      setPuStep('form');
      return;
    }
    if (!puColumnMapping.codeColumn || !puColumnMapping.priceColumn) {
      setPuError('Seleccioná una columna de código y una de precio.');
      return;
    }

    setPuError('');
    setPuStep('uploading');
    const parsed = parseWithManualMapping(puRawImportText, puColumnMapping.codeColumn, puColumnMapping.priceColumn);

    if (parsed.rows.length === 0) {
      setPuError(parsed.errors.join(' ') || 'No se pudo parsear con el mapeo manual.');
      setPuStep('mapping');
      return;
    }

    try {
      const storageKey = `supplier_column_mapping_${puSupplierId}`;
      localStorage.setItem(storageKey, JSON.stringify(puColumnMapping));
    } catch {
      // ignore localStorage write errors
    }

    try {
      await uploadParsedRowsToTemp(parsed.rows, puFilename || 'archivo_importado');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el archivo';
      setPuError(msg);
      setPuStep('mapping');
    }
  }, [puRawImportText, puColumnMapping, parseWithManualMapping, uploadParsedRowsToTemp, puFilename, puSupplierId]);

  const handlePriceUpdateConfirm = useCallback(async () => {
    if (!puSessionId || !puSupplierId) return;
    setPuStep('confirming');
    setPuError('');
    try {
      const result = await api.executeUpdateFromTempTable(puSessionId, puSupplierId);
      setPuUpdateResult(result);
      await api.cleanupTempImportSession(puSessionId);
      setPuSessionId('');
      setPuStep('result');
      addToast(`Precios actualizados: ${result.updatedCount} productos`, 'success');
      onUpdate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al ejecutar la actualización';
      setPuError(msg);
      setPuStep('preview');
    }
  }, [puSessionId, puSupplierId, addToast, onUpdate]);

  const handlePriceUpdateCancel = useCallback(async () => {
    if (puSessionId) {
      try { await api.cleanupTempImportSession(puSessionId); } catch { /* ignore */ }
      setPuSessionId('');
    }
    setPuStep('form');
    setPuSessionResult(null);
    setPuVsExcelSummary(null);
    setPuUpdateResult(null);
    setPuError('');
    setPuFilename('');
    setPuMissingProducts([]);
    setPuShowMissing(false);
  }, [puSessionId]);

  const fetchSupplierProductCount = useCallback(async (supplierId: string): Promise<number> => {
    if (!api.supabase) return 0;

    const { count, error } = await api.supabase
      .from('st_products')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', supplierId)
      .eq('is_deleted', false);

    if (error) throw error;
    return count ?? 0;
  }, []);

  // Cargar total de productos del proveedor al seleccionarlo en modo Actualización
  useEffect(() => {
    if (!puSupplierId) return;

    setPuSupplierTotalLoading(true);

    fetchSupplierProductCount(puSupplierId)
      .then(count => setPuSupplierTotalProducts(count))
      .catch(() => setPuSupplierTotalProducts(0))
      .finally(() => setPuSupplierTotalLoading(false));
  }, [puSupplierId, fetchSupplierProductCount]);
  // ──────────────────────────────────────────────────────────────────────────

  const progressLabelByStage: Record<SupplierImportProgressStage, string> = {
    idle: 'Listo para iniciar',
    'parsing-file': 'Parseando archivo',
    'building-preview': 'Construyendo vista previa',
    'importing-rows': 'Importando filas',
    finalizing: 'Finalizando importación',
    done: 'Proceso completado',
  };

  const usdUpdateStageLabel: Record<UsdUpdateStage, string> = {
    idle: 'Listo',
    searching: 'Buscando productos USD…',
    recalculating: 'Recalculando precios…',
    saving: 'Guardando cambios…',
    finalizing: 'Finalizando…',
    done: 'Completado',
    error: 'Error',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isProcessing ? () => {} : onClose}
      title="Acciones Masivas de Precios"
      size={mode === 'supplier-import' || mode === 'price-update' ? '5xl' : 'md'}
    >
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setMode('mass-update');
              setError('');
            }}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${mode === 'mass-update' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Ajuste Masivo
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('supplier-import');
              setError('');
            }}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${mode === 'supplier-import' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Importar Lista de Proveedor
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('price-update');
              setError('');
              setPuStep('form');
              setPuSupplierId('');
              setPuSupplierTotalProducts(0);
              setPuSupplierTotalLoading(false);
              setPuError('');
              setPuFilename('');
              setPuSessionResult(null);
              setPuVsExcelSummary(null);
              setPuUpdateResult(null);
              setPuRawImportText('');
              setPuHeadersDetected([]);
              setPuColumnMapping({ codeColumn: null, priceColumn: null });
              setPuMissingProducts([]);
              setPuShowMissing(false);
            }}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${mode === 'price-update' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Actualización
          </button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md mb-4">{error}</p>}

        {mode === 'mass-update' && step === 'form' && (
             <form onSubmit={handleNext} className="space-y-4">
                
                <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">1. Filtrar Productos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium">Filtrar por</label>
                        <select value={filterBy} onChange={e => {setFilterBy(e.target.value as FilterByType); setFilterValue('');}} className="mt-1 block w-full border-gray-300 rounded-md">
                            <option value="All">Todos los Productos</option>
                            <option value="Categoria">Categoría</option>
                            <option value="Proveedor">Proveedor</option>
                        </select>
                    </div>
                    {filterBy !== 'All' && (
                        <div>
                            <label className="block text-sm font-medium">Valor del Filtro</label>
                            {renderFilterValueInput()}
                        </div>
                    )}
                </div>
                
                <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 pt-4">2. Definir Actualización</h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium">Campo de Precio</label>
                        <select value={targetPrice} onChange={e => setTargetPrice(e.target.value as TargetPriceType)} className="mt-1 block w-full border-gray-300 rounded-md">
                            <option value="Precio">Precio Base (Lista)</option>
                            <option value="P.Costo">Precio de Costo</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium">Tipo de Aumento</label>
                        <select value={updateType} onChange={e => setUpdateType(e.target.value as UpdateType)} className="mt-1 block w-full border-gray-300 rounded-md">
                            <option value="percentage">Porcentaje (%)</option>
                            <option value="fixed">Monto Fijo ($)</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium">Valor del Aumento</label>
                        <input type="text" inputMode="decimal" value={updateValue} onChange={e => setUpdateValue(e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md" required/>
                    </div>
                 </div>

                <div className="flex justify-end pt-4 space-x-3">
                    <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300">Cancelar</button>
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center space-x-2">
                        <span>Siguiente</span>
                        <Icon path="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" className="w-4 h-4" />
                    </button>
                </div>
             </form>
        )}
        {mode === 'mass-update' && step === 'confirm' && (
            <div className="space-y-6">
                 <div className="text-center">
                    <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-12 h-12 text-yellow-400 mx-auto" />
                    <h3 className="mt-4 text-xl font-bold">Confirmar Actualización Masiva</h3>
                    <p className="text-gray-600 mt-2 bg-yellow-50 p-3 rounded-lg">{confirmationText}</p>
                    <p className="text-red-600 font-semibold mt-4">Esta acción es irreversible y afectará a múltiples productos.</p>
                </div>
                 <div className="flex justify-end pt-4 space-x-3">
                    <button type="button" onClick={() => setStep('form')} disabled={isProcessing} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50">Volver</button>
                    <button type="button" onClick={handleConfirmUpdate} disabled={isProcessing} className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 flex items-center space-x-2 w-64 justify-center disabled:bg-gray-400">
                        {isProcessing ? (
                             <>
                                <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                                <span>Actualizando Precios...</span>
                            </>
                        ) : (
                            <>
                                <Icon path="M4.5 12.75l6 6 9-13.5" className="w-5 h-5"/>
                                <span>Sí, Confirmar y Actualizar</span>
                            </>
                        )}
                    </button>
                 </div>
            </div>
        )}

        {mode === 'supplier-import' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">Importación de Costos por Proveedor</h3>

            <div>
              <label className="block text-sm font-medium">Proveedor</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md"
              >
                <option value="">Seleccionar proveedor...</option>
                {supplierOptions
                  .filter((s) => s.isActive)
                  .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className={`grid grid-cols-1 ${isUsdFileCurrency ? 'md:grid-cols-2' : ''} gap-4`}>
              <div>
                <label className="block text-sm font-medium">Moneda del archivo</label>
                <select
                  value={fileCurrency}
                  onChange={(e) => setFileCurrency(e.target.value as ImportCurrency)}
                  className="mt-1 block w-full border-gray-300 rounded-md"
                >
                  <option value="ARS">ARS (Pesos argentinos)</option>
                  <option value="USD">USD (Dólares)</option>
                </select>
              </div>
              {isUsdFileCurrency && (
                <div>
                  <label className="block text-sm font-medium">Tipo de cambio (ARS/USD)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={exchangeRate}
                    onChange={(e) => {
                      setExchangeRate(e.target.value);
                      setUsdUpdateRate(e.target.value);
                    }}
                    className="mt-1 block w-full border-gray-300 rounded-md"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {isFetchingExchangeRate
                      ? 'Obteniendo cotizacion sugerida...'
                      : `Tipo de cambio sugerido: ${exchangeRate || '-'} ARS/USD${exchangeRateSource ? ` (${exchangeRateSource})` : ''}`}
                  </p>
                  {exchangeRateWarning && (
                    <p className="mt-1 text-xs text-amber-700">{exchangeRateWarning}</p>
                  )}
                </div>
              )}
            </div>

            {isUsdFileCurrency && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">Actualización manual por dólar</p>
                <p className="text-xs text-amber-800 mt-1">Recalcula solo productos con costo en USD. No modifica offer_price ni overrides manuales.</p>
                <div className="mt-3 flex flex-col md:flex-row md:items-end gap-3">
                  <div className="md:w-64">
                    <label className="block text-xs font-medium text-amber-900">Nuevo tipo de cambio (ARS/USD)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={usdUpdateRate}
                      onChange={(e) => setUsdUpdateRate(e.target.value)}
                      disabled={isProcessingUsdUpdate}
                      className="mt-1 block w-full border-amber-300 rounded-md disabled:bg-amber-100 disabled:text-amber-600"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleUpdateUsdByExchangeRate}
                    disabled={isProcessingUsdUpdate}
                    className="bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-700 disabled:bg-gray-400 flex items-center gap-2"
                  >
                    {isProcessingUsdUpdate ? (
                      <>
                        <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-4 h-4 animate-spin" />
                        <span>Actualizando…</span>
                      </>
                    ) : (
                      <span>Actualizar precios USD</span>
                    )}
                  </button>
                </div>

                {isProcessingUsdUpdate && (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-100 p-3">
                    <div className="flex items-center justify-between text-sm text-amber-900">
                      <span className="font-medium">{usdUpdateStageLabel[usdUpdateStage]}</span>
                      <span className="font-semibold">{usdUpdatePercent}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-amber-200 overflow-hidden">
                      <div
                        className="h-full bg-amber-600 transition-all duration-300"
                        style={{ width: `${usdUpdatePercent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-amber-700">Etapas: buscando → recalculando → guardando → finalizando</p>
                  </div>
                )}

                {usdUpdateStage === 'done' && usdUpdateResult && (
                  <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-green-900 text-sm">Actualización completada</p>
                      <p className="text-sm text-green-800 mt-1">
                        <span className="font-bold">{usdUpdateResult.updated}</span>{' '}
                        producto{usdUpdateResult.updated !== 1 ? 's' : ''} actualizados · TC aplicado:{' '}
                        <span className="font-bold">${Number(usdUpdateRate).toLocaleString('es-AR')} ARS/USD</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUsdUpdateStage('idle');
                        setUsdUpdateResult(null);
                        setUsdUpdateError('');
                        setUsdUpdatePercent(0);
                      }}
                      className="text-xs text-green-700 underline hover:text-green-900 shrink-0 mt-1"
                    >
                      Limpiar
                    </button>
                  </div>
                )}

                {usdUpdateStage === 'error' && usdUpdateError && (
                  <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{usdUpdateError}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium">Archivo (opcional)</label>
              <input
                type="file"
                accept=".csv,.txt,.tsv,.xlsx,.xls"
                onChange={handleImportFile}
                className="mt-1 block w-full text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">Formatos soportados: CSV, TXT, TSV, XLSX. Se usa la primera hoja del archivo Excel.</p>
            </div>

            <div>
              <label className="block text-sm font-medium">Lista tabular (cod, cost_price)</label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={10}
                className="mt-1 block w-full border-gray-300 rounded-md font-mono text-sm"
                placeholder={"cod\tcost_price\tbarcode\tname\tcategory\tsub_category\tobservations\tcost_currency\nA001\t12500\t779000000001\tProducto\tREPUESTOS\tMOTORES\t\tARS\nA002\t12.5\t\t\t\t\t\tUSD"}
              />
            </div>

            {fileAnalysis && fileAnalysis.headerRowIndex > 0 && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
                <p className="font-semibold">Cabecera detectada automáticamente</p>
                <p className="mt-1 text-xs text-teal-700">
                  Fila de datos reales encontrada en la fila <span className="font-bold">{fileAnalysis.headerRowIndex + 1}</span>.
                  Se ignorarán las primeras <span className="font-bold">{fileAnalysis.headerRowIndex}</span> fila(s) decorativas.
                </p>
              </div>
            )}

            {fileAnalysis && fileAnalysis.priceColumnCandidates.length > 1 && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                <p className="text-sm font-semibold text-violet-900">Múltiples columnas de precio detectadas</p>
                <p className="text-xs text-violet-700 mt-1">
                  El archivo tiene {fileAnalysis.priceColumnCandidates.length} columnas de precio. Seleccioná cuál usar como costo de importación.
                </p>
                <select
                  value={selectedPriceLabel}
                  onChange={(e) => {
                    const candidate = fileAnalysis.priceColumnCandidates.find((c) => c.normalizedLabel === e.target.value);
                    setSelectedPriceLabel(e.target.value);
                    if (candidate?.inferredCurrency) setFileCurrency(candidate.inferredCurrency);
                  }}
                  className="mt-2 block w-full border-violet-300 rounded-md text-sm bg-white"
                >
                  <option value="">— Seleccionar columna de precio —</option>
                  {fileAnalysis.priceColumnCandidates.map((c) => (
                    <option key={c.normalizedLabel} value={c.normalizedLabel}>
                      {c.label}{c.inferredCurrency ? ` (${c.inferredCurrency})` : ''}
                    </option>
                  ))}
                </select>
                {!selectedPriceLabel && (
                  <p className="mt-1 text-xs text-amber-700 font-medium">Requerido: seleccioná una columna para continuar.</p>
                )}
                {selectedPriceLabel && (
                  <p className="mt-1 text-xs text-violet-700">
                    Columna seleccionada: <span className="font-bold">{fileAnalysis.priceColumnCandidates.find((c) => c.normalizedLabel === selectedPriceLabel)?.label ?? selectedPriceLabel}</span>
                    {fileAnalysis.priceColumnCandidates.find((c) => c.normalizedLabel === selectedPriceLabel)?.inferredCurrency
                      ? ` → moneda del archivo sincronizada a ${fileAnalysis.priceColumnCandidates.find((c) => c.normalizedLabel === selectedPriceLabel)?.inferredCurrency}`
                      : ''}
                  </p>
                )}
              </div>
            )}

            <div className="bg-blue-50 text-blue-900 text-sm p-3 rounded-md">
              Reglas: solo actualiza productos existentes por cod + proveedor seleccionado. Recalcula final_price solo cuando auto_price = true. No toca offer_price ni crea productos.
            </div>

            {(isProcessing || supplierImportProgress.stage !== 'idle') && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2">
                <div className="flex items-center justify-between text-sm text-sky-900">
                  <div className="flex items-center gap-2">
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-4 h-4 animate-spin text-sky-600" />
                    <span className="font-medium">{progressLabelByStage[supplierImportProgress.stage]}</span>
                  </div>
                  <span className="font-semibold text-sky-700">{supplierImportProgress.percent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-sky-100 overflow-hidden">
                  <div
                    className="h-full bg-sky-500 transition-all duration-300"
                    style={{ width: `${supplierImportProgress.percent}%` }}
                  />
                </div>
                <p className="text-xs text-sky-700 mt-2">
                  {parsedImportRows.length > 0 && (
                    <>
                      Procesando: <span className="font-semibold">{parsedImportRows.length} filas</span>
                      {previewCounts.found > 0 && (
                        <>
                          {' '}· <span className="text-green-700">{translateStatusLabel('found')}: <span className="font-semibold">{previewCounts.found}</span></span>
                        </>
                      )}
                      {previewCounts.notFound > 0 && (
                        <>
                          {' '}· <span className="text-rose-700">{translateStatusLabel('not found')}: <span className="font-semibold">{previewCounts.notFound}</span></span>
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
            )}

            {supplierImportStep === 'preview' && safeImportPreviewRows.length > 0 && (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">Vista previa de importación</p>
                    <p className="text-sm text-slate-600 mt-1">
                      Proveedor: <span className="font-medium">{selectedSupplier?.name || 'Sin proveedor'}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Impuestos aplicados al precio final: {selectedSupplier?.tax1Percent ?? 0}% / {selectedSupplier?.tax2Percent ?? 0}% / {selectedSupplier?.tax3Percent ?? 0}%
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Moneda archivo: {fileCurrency} {fileCurrency === 'USD' ? `| Tipo de cambio: ${exchangeRate || '0'} ARS/USD` : ''}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-slate-50 px-3 py-2"><span className="text-slate-500">Encontrados:</span> <span className="font-semibold">{previewCounts.found}</span></div>
                    <div className="rounded-md bg-slate-50 px-3 py-2"><span className="text-slate-500">No encontrados:</span> <span className="font-semibold">{previewCounts.notFound}</span></div>
                    <div className="rounded-md bg-slate-50 px-3 py-2"><span className="text-slate-500">Actualizarán:</span> <span className="font-semibold">{previewCounts.willUpdate}</span></div>
                    <div className="rounded-md bg-slate-50 px-3 py-2"><span className="text-slate-500">Sin cambios:</span> <span className="font-semibold">{previewCounts.noChange}</span></div>
                  </div>
                </div>

                <div className="overflow-auto max-h-[62vh] border border-slate-200 rounded-lg">
                  <table className="min-w-312.5 w-full text-sm table-fixed">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left w-40">Código Excel</th>
                        <th className="px-3 py-2 text-left w-44">Barcode Excel</th>
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-center w-36">Resultado</th>
                        <th className="px-3 py-2 text-center w-36">Buscado por</th>
                        <th className="px-3 py-2 text-center w-24">Moneda</th>
                        <th className="px-3 py-2 text-right w-36">Costo archivo</th>
                        <th className="px-3 py-2 text-right w-36">Costo actual</th>
                        <th className="px-3 py-2 text-right w-36">Costo nuevo</th>
                        <th className="px-3 py-2 text-right w-40">Precio final nuevo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {safeImportPreviewRows.map((row: SupplierCostImportPreviewRow, index: number) => (
                        <tr key={`${row.cod}-${index}`} className={`border-t border-slate-100 ${row.status === 'not found' ? 'bg-rose-50' : ''}`}>
                          <td className="px-3 py-2 font-mono text-xs font-semibold">{row.cod || '-'}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">{'-'}</td>
                          <td className="px-3 py-2 truncate" title={row.product_name || 'No encontrado'}>{row.product_name || 'No encontrado'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                              row.result === 'will update' 
                                ? 'bg-green-100 text-green-800'
                                : row.result === 'no change'
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {translateResultLabel(row.result)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-slate-600">{translateReasonLabel((row as any).reason || '')}</td>
                          <td className="px-3 py-2 text-center">{row.input_currency}</td>
                          <td className="px-3 py-2 text-right">${row.input_cost.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2 text-right">${row.current_cost.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2 text-right font-semibold">${row.new_cost.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2 text-right font-semibold">${row.new_calculated_final_price.toLocaleString('es-AR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {supplierImportStep === 'result' && importSummary && (
              <div className="space-y-4">
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">
                  <p className="font-semibold">Importación finalizada correctamente</p>
                  <p className="text-sm mt-1">El proceso terminó y el resumen final quedó consolidado. Para volver a importar, usá "Nueva importación".</p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="font-semibold text-gray-900 mb-3">Resumen principal (base proveedor)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-600">Productos del proveedor en sistema</p>
                      <p className="text-2xl font-bold text-slate-900">{providerTotal}</p>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-blue-700">Del proveedor encontrados en archivo</p>
                      <p className="text-2xl font-bold text-blue-900">{providerFoundInFile}</p>
                    </div>
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-green-700">Actualizados</p>
                      <p className="text-2xl font-bold text-green-900">{importSummary.updated}</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-amber-700">Del proveedor no presentes en archivo</p>
                      <p className="text-2xl font-bold text-amber-900">{providerMissingInFile}</p>
                      {providerMissingInFile > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowMissingModal(true, 'Ver detalle btn')}
                          className="mt-3 text-sm font-medium text-amber-900 underline hover:text-amber-700"
                        >
                          Ver detalle
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-semibold mb-2">Resumen secundario (archivo)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="rounded-md bg-white/80 p-2">
                      <p className="text-xs text-blue-700">Filas procesadas del archivo</p>
                      <p className="text-lg font-semibold">{fileProcessed}</p>
                    </div>
                    <div className="rounded-md bg-white/80 p-2">
                      <p className="text-xs text-blue-700">Ignorados</p>
                      <p className="text-lg font-semibold">{importSummary.ignored}</p>
                    </div>
                    <div className="rounded-md bg-white/80 p-2">
                      <p className="text-xs text-blue-700">Códigos del archivo encontrados en base</p>
                      <p className="text-lg font-semibold">{fileFoundInBase}</p>
                    </div>
                    <div className="rounded-md bg-white/80 p-2">
                      <p className="text-xs text-blue-700">Códigos del archivo no encontrados en base</p>
                      <p className="text-lg font-semibold">{fileMissingInBase}</p>
                    </div>
                  </div>
                </div>

                {notFoundCodeSamples.length > 0 && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                    <p className="font-semibold">Ejemplos de códigos del archivo no encontrados en base</p>
                    <p className="text-xs text-rose-700 mt-1 mb-2">Se muestra una muestra breve para revisión rápida.</p>
                    <div className="flex flex-wrap gap-2">
                      {notFoundCodeSamples.map((code) => (
                        <span key={code} className="px-2 py-1 rounded bg-white border border-rose-200 font-mono text-xs">
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {fileMissingInBase > 0 && notFoundCodeSamples.length === 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    No se pudo generar una muestra de códigos no encontrados en esta importación, pero el total sigue disponible en el resumen secundario.
                  </div>
                )}
              </div>
            )}

            {error && supplierImportStep === 'edit' && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded-md">{error}</p>
            )}

            <div className="flex justify-end pt-2 space-x-3">
              <button
                type="button"
                onClick={supplierImportStep === 'preview' ? () => setSupplierImportStep('edit') : onClose}
                disabled={isProcessing}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50"
              >
                {supplierImportStep === 'preview' ? 'Volver' : supplierImportStep === 'result' ? 'Finalizar' : 'Cerrar'}
              </button>
              {supplierImportStep === 'result' && (
                <button
                  type="button"
                  onClick={resetSupplierImportFlow}
                  disabled={isProcessing}
                  className="bg-slate-100 text-slate-800 px-4 py-2 rounded-lg font-medium hover:bg-slate-200 disabled:opacity-50"
                >
                  Nueva importación
                </button>
              )}
              {supplierImportStep !== 'result' && (
                <button
                  type="button"
                  onClick={supplierImportStep === 'preview' ? handleImportSupplierCosts : handlePreviewSupplierCosts}
                  disabled={isProcessing}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-4 h-4 animate-spin" />
                      <span>{supplierImportStep === 'preview' ? 'Importando...' : 'Procesando...'}</span>
                    </>
                  ) : (
                    <>
                      <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" className="w-4 h-4" />
                      <span>{supplierImportStep === 'preview' ? 'Confirmar importación' : 'Ver vista previa'}</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <Modal
              isOpen={showMissingModal}
              onClose={() => setShowMissingModal(false, 'Modal close')}
              title="Productos no encontrados"
              size="5xl"
            >
              <div style={{background: '#ffeeba', color: '#b94a48', fontWeight: 'bold', padding: 8, fontSize: 18, textAlign: 'center'}}>
                DEBUG MASS MODAL REAL
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    Se muestran los productos del proveedor que no hicieron match con las filas importadas.
                    Revisa si necesitas actualizar códigos en tu proveedor.
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyMissingList}
                    disabled={providerMissingProducts.length === 0}
                    className="bg-slate-100 text-slate-800 px-4 py-2 rounded-lg font-medium hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Copiar lista
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="max-h-[50vh] overflow-auto">
                    <table className="w-full text-sm min-w-225 table-fixed">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left w-44">Código</th>
                          <th className="px-3 py-2 text-left w-52">Barcode</th>
                          <th className="px-3 py-2 text-left">Descripción</th>
                          <th className="px-3 py-2 text-right w-32">Precio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {providerMissingProducts.map((row, index) => {
                          // [REAL_NOT_FOUND_TABLE_ROW] log por fila
                          // eslint-disable-next-line no-console
                          console.log('[REAL_NOT_FOUND_TABLE_ROW]', { index, row });
                          return (
                            <tr key={`${row.id || row.cod}-${index}`} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-mono text-xs">{row.cod || '-'}</td>
                              <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.barcode || '-'}</td>
                              <td className="px-3 py-2 truncate" title={row.description || row.cod || '-'}>{row.description || row.cod || '-'}</td>
                              <td className="px-3 py-2 text-right text-xs">
                                {row.price != null ? `$${row.price.toLocaleString('es-AR')}` : '-'}
                              </td>
                            </tr>
                          );
                        })}
                        {providerMissingProducts.length === 0 && (
                          <tr>
                            <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                              No hay detalle disponible para esta importación.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  {previewCounts.notFound > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMissingModal(false, 'Revisar y corregir códigos btn');
                        handleStartEditNotFound();
                      }}
                      className="bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-700 flex items-center gap-2"
                    >
                      <Icon path="M11 4a1 1 0 011 1v14a1 1 0 11-2 0V5a1 1 0 011-1m5-1a1 1 0 011 1v14a1 1 0 11-2 0V4a1 1 0 011-1M7 7a1 1 0 011 1v10a1 1 0 11-2 0V8a1 1 0 011-1z" className="w-4 h-4" />
                      Revisar y corregir códigos
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowMissingModal(false, 'Cerrar btn')}
                    className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </Modal>

            <Modal
              isOpen={showRetryAfterEdit}
              onClose={() => {
                setShowRetryAfterEdit(false);
                setNotFoundProductRows([]);
                setEditingNotFoundRows(new Map());
              }}
              title="Corregir códigos y reintentar match"
              size="5xl"
            >
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Edita los códigos de los productos no encontrados. Una vez corregidos, haz clic en "Reintentar" 
                  para buscar nuevamente en tu base de datos sin resubir el archivo.
                </p>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="max-h-[60vh] overflow-auto">
                    <table className="w-full text-sm min-w-325 table-fixed">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left w-44">Código Excel</th>
                          <th className="px-3 py-2 text-left w-52">Barcode Excel</th>
                          <th className="px-3 py-2 text-left">Descripción Excel</th>
                          <th className="px-3 py-2 text-right w-32">Precio Excel</th>
                          <th className="px-3 py-2 text-left w-44">Código sistema</th>
                          <th className="px-3 py-2 text-left w-52">Barcode sistema</th>
                          <th className="px-3 py-2 text-left w-36">Buscado por</th>
                          <th className="px-3 py-2 text-left w-48">Código corregido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {notFoundProductRows.map((row, index) => (
                          <tr key={`${row.excel_code}-${index}`} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono text-xs text-slate-900 font-semibold">{row.excel_code || '-'}</td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.excel_barcode || '-'}</td>
                            <td className="px-3 py-2 text-sm truncate" title={row.excel_description}>{row.excel_description}</td>
                            <td className="px-3 py-2 text-right text-xs text-slate-600">
                              {row.excel_price != null ? `$${row.excel_price.toLocaleString('es-AR')}` : '-'}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{row.system_code || '-'}</td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.system_barcode || '-'}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">{row.search_field}</td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={editingNotFoundRows.get(row.excel_code) || row.edit_code}
                                onChange={(e) => handleEditCodeInNotFound(row.excel_code, e.target.value)}
                                className="w-full px-2 py-1 border border-amber-300 rounded text-xs font-mono bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-400"
                                placeholder={row.excel_code}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  <p className="font-semibold">💡 Consejo</p>
                  <p className="mt-1 text-xs">
                    Revisa si los códigos en tu proveedor coinciden exactamente con los del archivo. 
                    Cambios como espacios, mayúsculas o caracteres especiales pueden causar que no se encuentre el match.
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRetryAfterEdit(false);
                      setNotFoundProductRows([]);
                      setEditingNotFoundRows(new Map());
                    }}
                    disabled={isProcessing}
                    className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleRetryMatchAfterEdit}
                    disabled={isProcessing}
                    className="bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-700 disabled:bg-gray-400 flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-4 h-4 animate-spin" />
                        <span>Reintentando match…</span>
                      </>
                    ) : (
                      <>
                        <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" className="w-4 h-4" />
                        <span>Reintentar match</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </Modal>
          </div>
        )}

        {/* ─── PROMPT 010: Flujo "Actualización" ─────────────────────────── */}
        {mode === 'price-update' && (
          <div className="space-y-4">
            {puError && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{puError}</p>}

            {puSupplierId && (
              <div className="bg-slate-100 border border-slate-300 rounded-lg p-4">
                <p className="text-sm font-medium text-slate-600">Total productos del proveedor</p>
                <p className="text-4xl font-bold text-slate-800 mt-1">
                  {puSupplierTotalLoading ? 'Cargando...' : puSupplierTotalProducts}
                </p>
              </div>
            )}

            {/* FORMULARIO */}
            {puStep === 'form' && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Actualización masiva por proveedor</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
                  <select
                    value={puSupplierId}
                    onChange={(e) => { setPuSupplierId(e.target.value); setPuError(''); }}
                    className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">— Seleccioná un proveedor —</option>
                    {[...supplierOptions]
                      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
                      .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Moneda del archivo</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1 text-sm">
                      <input type="radio" name="pu-currency" value="ARS" checked={puCurrency === 'ARS'} onChange={() => setPuCurrency('ARS')} /> ARS
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="radio" name="pu-currency" value="USD" checked={puCurrency === 'USD'} onChange={() => setPuCurrency('USD')} /> USD
                    </label>
                  </div>
                </div>
                {puCurrency === 'USD' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de cambio (ARS por USD)</label>
                    <input
                      type="number"
                      min="1"
                      value={puExchangeRate}
                      onChange={(e) => setPuExchangeRate(e.target.value)}
                      className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="Ej: 1000"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Archivo (Excel / CSV / TXT)</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt,.tsv"
                    disabled={!puSupplierId}
                    onChange={handlePriceUpdateFileChange}
                    className="block w-full text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-green-50 file:text-green-700 hover:file:bg-green-100 disabled:opacity-50"
                  />
                  {!puSupplierId && <p className="text-xs text-gray-500 mt-1">Seleccioná un proveedor para habilitar la carga de archivo.</p>}
                </div>
              </div>
            )}

            {/* SUBIENDO */}
            {puStep === 'uploading' && (
              <div className="py-8 text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-3" />
                <p className="text-sm">Subiendo filas a tabla temporal…</p>
                {puFilename && <p className="text-xs text-gray-400 mt-1">{puFilename}</p>}
              </div>
            )}

            {/* MAPE0 MANUAL */}
            {puStep === 'mapping' && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Mapeo manual de columnas</h3>
                <p className="text-sm text-gray-600">
                  No se pudieron detectar automáticamente las columnas requeridas. Seleccioná manualmente código y precio para continuar.
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Seleccionar columna de código</label>
                  <select
                    value={puColumnMapping.codeColumn || ''}
                    onChange={(e) => setPuColumnMapping((prev) => ({ ...prev, codeColumn: e.target.value || null }))}
                    className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">— Elegir columna —</option>
                    {puHeadersDetected.map((header) => (
                      <option key={`code-${header}`} value={header}>{header}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Seleccionar columna de precio</label>
                  <select
                    value={puColumnMapping.priceColumn || ''}
                    onChange={(e) => setPuColumnMapping((prev) => ({ ...prev, priceColumn: e.target.value || null }))}
                    className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">— Elegir columna —</option>
                    {puHeadersDetected.map((header) => (
                      <option key={`price-${header}`} value={header}>{header}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handlePriceUpdateCancel}
                    className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmManualMapping}
                    disabled={!puColumnMapping.codeColumn || !puColumnMapping.priceColumn}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    Confirmar mapeo
                  </button>
                </div>
              </div>
            )}

            {/* PREVIEW / RESUMEN DE MATCH */}
            {puStep === 'preview' && puSessionResult && puVsExcelSummary && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Resumen antes de actualizar</h3>
                <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
                  <p><span className="text-gray-500">Archivo:</span> <span className="font-medium">{puSessionResult.sourceFilename}</span></p>
                  <p><span className="text-gray-500">Proveedor:</span> <span className="font-medium">{puSessionResult.supplierName}</span></p>
                  <p><span className="text-gray-500">Moneda:</span> <span className="font-medium">{puSessionResult.fileCurrency}{puSessionResult.fileCurrency === 'USD' ? ` (× ${puSessionResult.exchangeRate})` : ''}</span></p>
                </div>
                {/* 4 tarjetas perspectiva proveedor */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-100 rounded p-3 text-center">
                    <p className="text-2xl font-bold text-gray-800">{puVsExcelSummary.totalSupplier}</p>
                    <p className="text-xs text-gray-600 mt-1">Total productos del proveedor</p>
                  </div>
                  <div className="bg-green-50 rounded p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{puVsExcelSummary.matchedByCod}</p>
                    <p className="text-xs text-gray-600 mt-1">Encontrados por COD</p>
                  </div>
                  <div className="bg-blue-50 rounded p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">{puVsExcelSummary.matchedByBarcode}</p>
                    <p className="text-xs text-gray-600 mt-1">Encontrados por BARCODE</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPuShowMissing(v => !v)}
                    className="bg-orange-50 rounded p-3 text-center hover:bg-orange-100 transition-colors w-full"
                  >
                    <p className="text-2xl font-bold text-orange-700">{puVsExcelSummary.missingFromExcel}</p>
                    <p className="text-xs text-gray-600 mt-1">No presentes en el Excel</p>
                    {puVsExcelSummary.missingFromExcel > 0 && (
                      <p className="text-xs text-orange-600 mt-0.5 underline">{puShowMissing ? 'Ocultar detalle' : 'Ver detalle'}</p>
                    )}
                  </button>
                </div>
                {/* Listado expandible de productos no en Excel */}
                {puShowMissing && puMissingProducts.length > 0 && (
                  <div className="border border-orange-200 rounded bg-white max-h-52 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-orange-100 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1 font-medium text-orange-800">Cód</th>
                          <th className="text-left px-2 py-1 font-medium text-orange-800">Barcode</th>
                          <th className="text-left px-2 py-1 font-medium text-orange-800">Nombre</th>
                        </tr>
                      </thead>
                      <tbody>
                        {puMissingProducts.map((p, i) => (
                          <tr key={p.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-orange-50'}>
                            <td className="px-2 py-1 text-gray-700">{p.cod || '—'}</td>
                            <td className="px-2 py-1 text-gray-700">{p.barcode || '—'}</td>
                            <td className="px-2 py-1 text-gray-700">{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-gray-500">Solo se actualizarán los productos encontrados por COD o BARCODE. No se crean productos nuevos.</p>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handlePriceUpdateCancel}
                    className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handlePriceUpdateConfirm}
                    disabled={puVsExcelSummary.matchedByCod + puVsExcelSummary.matchedByBarcode === 0}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    Confirmar actualización ({puVsExcelSummary.matchedByCod + puVsExcelSummary.matchedByBarcode} productos)
                  </button>
                </div>
              </div>
            )}

            {/* PROCESANDO */}
            {puStep === 'confirming' && (
              <div className="py-8 text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-3" />
                <p className="text-sm">Actualizando precios…</p>
              </div>
            )}

            {/* RESULTADO FINAL */}
            {puStep === 'result' && puUpdateResult && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Resultado de la actualización</h3>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-1">
                  <p className="text-green-800 font-semibold">✓ Proceso completado</p>
                  <p><span className="text-gray-600">Productos actualizados:</span> <span className="font-bold text-green-700">{puUpdateResult.updatedCount}</span></p>
                  <p><span className="text-gray-600">Sin cambios / omitidos:</span> <span className="font-medium">{puUpdateResult.skippedCount}</span></p>
                  <p><span className="text-gray-600">No encontrados:</span> <span className="font-medium">{puUpdateResult.notFoundCount}</span></p>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setPuStep('form'); setPuSessionResult(null); setPuVsExcelSummary(null); setPuUpdateResult(null); setPuFilename(''); setPuMissingProducts([]); setPuShowMissing(false); }}
                    className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
                  >
                    Nueva actualización
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* ─────────────────────────────────────────────────────────────────── */}
    </Modal>
  );
};
