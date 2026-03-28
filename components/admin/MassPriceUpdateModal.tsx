import React, { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { SupplierCostImportPreviewRow, SupplierCostImportRow, SupplierCostImportSummary } from '../../types';

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
type ActionMode = 'mass-update' | 'supplier-import';
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

const normalizeImportKey = (value: string): string => String(value || '').trim().toLowerCase();

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
  const candidates = ['\t', ';', ','];
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
  return /precio|costo|cost|price|importe|tarifa/.test(normalizedHeader);
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

const CODE_HEADER_ALIASES = ['cod', 'codigo', 'código', 'articulo', 'artículo', 'code', 'sku'];
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

  // Fallback: first non-empty row
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
      costIndex = findHeaderIndex(headers, ['cost_price', 'cost', 'costo', 'precio_costo', 'precio de costo', 'precio', 'precio_ars', 'precio_usd']);
    }
  } else {
    costIndex = findHeaderIndex(headers, ['cost_price', 'cost', 'costo', 'precio_costo', 'precio de costo', 'precio', 'precio_ars', 'precio_usd']);
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
  const [supplierImportStep, setSupplierImportStep] = useState<'edit' | 'preview' | 'result'>('edit');
  const [supplierImportProgress, setSupplierImportProgress] = useState<{ stage: SupplierImportProgressStage; percent: number }>({ stage: 'idle', percent: 0 });
  const [isFetchingExchangeRate, setIsFetchingExchangeRate] = useState(false);
  const [exchangeRateWarning, setExchangeRateWarning] = useState('');
  const [exchangeRateSource, setExchangeRateSource] = useState('');
  const [importSummary, setImportSummary] = useState<SupplierCostImportSummary | null>(null);
  const [notFoundCodeSamples, setNotFoundCodeSamples] = useState<string[]>([]);

  const [isProcessingUsdUpdate, setIsProcessingUsdUpdate] = useState(false);
  const [usdUpdateStage, setUsdUpdateStage] = useState<UsdUpdateStage>('idle');
  const [usdUpdatePercent, setUsdUpdatePercent] = useState(0);
  const [usdUpdateResult, setUsdUpdateResult] = useState<{ updated: number } | null>(null);
  const [usdUpdateError, setUsdUpdateError] = useState('');

  const [fileAnalysis, setFileAnalysis] = useState<FileAnalysis | null>(null);
  const [selectedPriceLabel, setSelectedPriceLabel] = useState('');

  const { addToast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    const loadSuppliers = async () => {
      try {
        const raw = await api.getSuppliersSupabase();
        const options = (raw || [])
          .map((item: any) => ({
            id: String(item.id || item.ID_Proveedor || ''),
            name: String(item.name || item.nombre || item.Nombre || 'Proveedor sin nombre'),
            isActive:
              item.is_active !== false &&
              item.activo !== false &&
              String(item.Activo || 'SI').toUpperCase() !== 'NO',
            tax1Percent: Number(item.tax_1_percent ?? 0),
            tax2Percent: Number(item.tax_2_percent ?? 0),
            tax3Percent: Number(item.tax_3_percent ?? 0),
          }))
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
      setIsProcessingUsdUpdate(false);
      setUsdUpdateStage('idle');
      setUsdUpdatePercent(0);
      setUsdUpdateResult(null);
      setUsdUpdateError('');
      setFileAnalysis(null);
      setSelectedPriceLabel('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (mode !== 'supplier-import') return;
    setImportPreviewRows([]);
    setParsedImportRows([]);
    setImportSummary(null);
    setNotFoundCodeSamples([]);
    setSupplierImportStep('edit');
    setSupplierImportProgress({ stage: 'idle', percent: 0 });
    setExchangeRateWarning('');
  }, [selectedSupplierId, importText, fileCurrency, exchangeRate, mode]);

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
    // If multiple candidates → leave selectedPriceLabel empty so user must choose
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

  const handleDownloadTemplate = () => {
    const headers = ['cod', 'cost_price', 'barcode', 'name', 'category', 'sub_category', 'observations', 'cost_currency'];
    const sampleRows = [
      ['A001', '12500', '779000000001', 'Producto ejemplo', 'REPUESTOS', 'MOTORES', 'Fila de ejemplo', 'ARS'],
      ['A002', '12.50', '', '', '', '', '', 'USD'],
    ];
    const csvContent = [headers.join(';'), ...sampleRows.map((row) => row.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'modelo_importacion_costos_proveedor.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePreviewSupplierCosts = async () => {
    setError('');
    setImportSummary(null);
    setNotFoundCodeSamples([]);

    if (!selectedSupplierId) {
      setError('Debe seleccionar un proveedor para importar costos.');
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
    if (parsed.errors.length > 0) {
      setError(parsed.errors.join(' '));
      setSupplierImportProgress({ stage: 'idle', percent: 0 });
      return;
    }

    const parsedExchangeRate = parseFloat(String(exchangeRate).replace(',', '.'));
    if (fileCurrency === 'USD' && (!Number.isFinite(parsedExchangeRate) || parsedExchangeRate <= 0)) {
      setError('Debe ingresar un tipo de cambio válido mayor a 0 para archivos en USD.');
      return;
    }

    setIsProcessing(true);
    try {
      setSupplierImportProgress({ stage: 'building-preview', percent: 55 });
      const preview = await api.previewSupplierCostsSupabase(selectedSupplierId, parsed.rows, {
        fileCurrency,
        exchangeRate: parsedExchangeRate,
      });
      setParsedImportRows(parsed.rows);
      setImportPreviewRows(preview);
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

      if (mergedSummary.notFound > 0) {
        try {
          const allProducts = await api.getProductsSupabase();
          const supplierProducts = allProducts.filter((product) => String(product.supplier_id || '') === selectedSupplierId);

          const supplierKeys = new Set<string>();
          supplierProducts.forEach((product) => {
            const codKey = normalizeImportKey(product.cod);
            const barcodeKey = normalizeImportKey(product['cod.barras'] || '');
            if (codKey) supplierKeys.add(codKey);
            if (barcodeKey) supplierKeys.add(barcodeKey);
          });

          const uniqueCodes = Array.from(
            new Set(parsedImportRows.map((row) => String(row.cod || '').trim()).filter((code) => code.length > 0))
          );

          const missingCodes = uniqueCodes.filter((code) => !supplierKeys.has(normalizeImportKey(code)));
          setNotFoundCodeSamples(missingCodes.slice(0, 8));
        } catch {
          setNotFoundCodeSamples([]);
        }
      }

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
  const previewCounts = {
    found: importPreviewRows.filter((row) => row.status === 'found').length,
    notFound: importPreviewRows.filter((row) => row.status === 'not found').length,
    willUpdate: importPreviewRows.filter((row) => row.result === 'will update').length,
    noChange: importPreviewRows.filter((row) => row.result === 'no change').length,
  };

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
    <Modal isOpen={isOpen} onClose={isProcessing ? () => {} : onClose} title="Acciones Masivas de Precios">
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
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  disabled={fileCurrency !== 'USD'}
                  className={`mt-1 block w-full border-gray-300 rounded-md ${fileCurrency !== 'USD' ? 'bg-gray-100 text-gray-500' : ''}`}
                />
                {fileCurrency === 'USD' && (
                  <p className="mt-1 text-xs text-gray-500">
                    {isFetchingExchangeRate
                      ? 'Obteniendo cotizacion sugerida...'
                      : `Tipo de cambio sugerido: ${exchangeRate || '-'} ARS/USD${exchangeRateSource ? ` (${exchangeRateSource})` : ''}`}
                  </p>
                )}
                {fileCurrency === 'USD' && exchangeRateWarning && (
                  <p className="mt-1 text-xs text-amber-700">{exchangeRateWarning}</p>
                )}
              </div>
            </div>

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

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="bg-slate-100 text-slate-800 px-4 py-2 rounded-lg font-medium hover:bg-slate-200 flex items-center gap-2"
              >
                <Icon path="M12 16.5v-9m0 9l-3.75-3.75M12 16.5l3.75-3.75M3.75 19.5h16.5" className="w-4 h-4" />
                <span>Descargar modelo</span>
              </button>
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
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                <div className="flex items-center justify-between text-sm text-sky-900">
                  <span className="font-medium">{progressLabelByStage[supplierImportProgress.stage]}</span>
                  <span className="font-semibold">{supplierImportProgress.percent}%</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-sky-100 overflow-hidden">
                  <div
                    className="h-full bg-sky-500 transition-all duration-300"
                    style={{ width: `${supplierImportProgress.percent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-sky-800">
                  Etapas: parsear archivo → vista previa → importar filas → finalizar
                </p>
              </div>
            )}

            {supplierImportStep === 'preview' && importPreviewRows.length > 0 && (
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

                <div className="overflow-auto max-h-80 border border-slate-200 rounded-lg">
                  <table className="min-w-[1400px] w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">cod</th>
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-center">Moneda</th>
                        <th className="px-3 py-2 text-right">Costo archivo</th>
                        <th className="px-3 py-2 text-right">TC</th>
                        <th className="px-3 py-2 text-right">Costo convertido (ARS)</th>
                        <th className="px-3 py-2 text-right">Costo actual</th>
                        <th className="px-3 py-2 text-right">Costo nuevo</th>
                        <th className="px-3 py-2 text-center">Imp. 1</th>
                        <th className="px-3 py-2 text-center">Imp. 2</th>
                        <th className="px-3 py-2 text-center">Imp. 3</th>
                        <th className="px-3 py-2 text-right">Precio final actual</th>
                        <th className="px-3 py-2 text-right">Precio final nuevo</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                        <th className="px-3 py-2 text-center">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreviewRows.map((row, index) => (
                        <tr key={`${row.cod}-${index}`} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono">{row.cod}</td>
                          <td className="px-3 py-2">{row.product_name || 'No encontrado'}</td>
                          <td className="px-3 py-2 text-center">{row.input_currency}</td>
                          <td className="px-3 py-2 text-right">{row.input_cost.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2 text-right">{row.exchange_rate.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2 text-right font-semibold">${row.converted_cost_ars.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2 text-right">${row.current_cost.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2 text-right font-semibold">${row.new_cost.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2 text-center">{row.supplier_tax_1_percent.toFixed(2)}%</td>
                          <td className="px-3 py-2 text-center">{row.supplier_tax_2_percent.toFixed(2)}%</td>
                          <td className="px-3 py-2 text-center">{row.supplier_tax_3_percent.toFixed(2)}%</td>
                          <td className="px-3 py-2 text-right">${row.current_final_price.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2 text-right font-semibold">${row.new_calculated_final_price.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${row.status === 'found' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'}`}>
                              {row.status === 'found' ? 'found' : 'not found'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${row.result === 'will update' ? 'bg-green-100 text-green-800' : row.result === 'no change' ? 'bg-slate-100 text-slate-700' : 'bg-rose-100 text-rose-800'}`}>
                              {row.result}
                            </span>
                          </td>
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
                      <p className="text-xs uppercase tracking-wide text-slate-600">Productos existentes del proveedor</p>
                      <p className="text-2xl font-bold text-slate-900">{importSummary.existingSupplierProducts}</p>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-blue-700">Encontrados en archivo</p>
                      <p className="text-2xl font-bold text-blue-900">{importSummary.foundInFile}</p>
                    </div>
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-green-700">Actualizados</p>
                      <p className="text-2xl font-bold text-green-900">{importSummary.updated}</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-amber-700">No encontrados en archivo</p>
                      <p className="text-2xl font-bold text-amber-900">{importSummary.notFoundInFile}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-semibold mb-2">Resumen secundario (archivo)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="rounded-md bg-white/80 p-2">
                      <p className="text-xs text-blue-700">Total filas del archivo</p>
                      <p className="text-lg font-semibold">{importSummary.totalRows}</p>
                    </div>
                    <div className="rounded-md bg-white/80 p-2">
                      <p className="text-xs text-blue-700">Ignorados</p>
                      <p className="text-lg font-semibold">{importSummary.ignored}</p>
                    </div>
                    <div className="rounded-md bg-white/80 p-2">
                      <p className="text-xs text-blue-700">Códigos del archivo no encontrados en base</p>
                      <p className="text-lg font-semibold">{importSummary.notFound}</p>
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

                {importSummary.notFound > 0 && notFoundCodeSamples.length === 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    No se pudo generar una muestra de códigos no encontrados en esta importación, pero el total sigue disponible en el resumen secundario.
                  </div>
                )}
              </div>
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
                      <Icon path="M4.5 12.75l6 6 9-13.5" className="w-4 h-4" />
                      <span>{supplierImportStep === 'preview' ? 'Confirmar importación' : 'Ver vista previa'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
    </Modal>
  );
};
