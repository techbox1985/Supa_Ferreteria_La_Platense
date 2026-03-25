import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { SupplierCostImportSummary } from '../../types';

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

interface SupplierOption {
  id: string;
  name: string;
  isActive: boolean;
}

const parseCostValue = (value: string): number => {
  const raw = String(value || '').trim();
  if (!raw) return Number.NaN;

  const hasDot = raw.includes('.');
  const hasComma = raw.includes(',');

  if (hasDot && hasComma) {
    return Number(raw.replace(/\./g, '').replace(',', '.'));
  }

  return Number(raw.replace(',', '.'));
};

const parseSupplierImportRows = (raw: string): { rows: { cod: string; cost_price: number; line: number }[]; ignored: number; totalRows: number; errors: string[] } => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], ignored: 0, totalRows: 0, errors: ['No hay datos para importar.'] };
  }

  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t') ? '\t' : headerLine.includes(';') ? ';' : ',';
  const headers = headerLine
    .split(delimiter)
    .map((h) => h.trim().toLowerCase());

  const codIndex = headers.findIndex((h) => h === 'cod');
  const costIndex = headers.findIndex((h) => h === 'cost_price' || h === 'costprice' || h === 'cost' || h === 'costo');

  if (codIndex < 0 || costIndex < 0) {
    return {
      rows: [],
      ignored: Math.max(lines.length - 1, 0),
      totalRows: Math.max(lines.length - 1, 0),
      errors: ['La tabla debe incluir encabezados con al menos: cod y cost_price.'],
    };
  }

  const rows: { cod: string; cost_price: number; line: number }[] = [];
  let ignored = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(delimiter).map((c) => c.trim());
    const cod = String(cols[codIndex] || '').trim();
    const costValue = String(cols[costIndex] || '').trim();

    if (!cod) {
      ignored += 1;
      continue;
    }

    const cost = parseCostValue(costValue);
    if (!Number.isFinite(cost)) {
      ignored += 1;
      continue;
    }

    rows.push({ cod, cost_price: cost, line: i + 1 });
  }

  return {
    rows,
    ignored,
    totalRows: lines.length - 1,
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
  const [importSummary, setImportSummary] = useState<SupplierCostImportSummary | null>(null);

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
      setImportSummary(null);
    }
  }, [isOpen]);

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

    try {
      const text = await file.text();
      setImportText(text);
      setError('');
    } catch {
      setError('No se pudo leer el archivo seleccionado.');
    }
  };

  const handleImportSupplierCosts = async () => {
    setError('');
    setImportSummary(null);

    if (!selectedSupplierId) {
      setError('Debe seleccionar un proveedor para importar costos.');
      return;
    }

    const parsed = parseSupplierImportRows(importText);
    if (parsed.errors.length > 0) {
      setError(parsed.errors.join(' '));
      return;
    }

    setIsProcessing(true);
    try {
      const summary = await api.importSupplierCostsSupabase(selectedSupplierId, parsed.rows);
      const mergedSummary: SupplierCostImportSummary = {
        ...summary,
        totalRows: parsed.totalRows,
        ignored: summary.ignored + parsed.ignored,
      };

      setImportSummary(mergedSummary);
      addToast('Importación de costos finalizada.', 'success');
      onUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      setError(`Error: ${errorMessage}`);
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

            <div>
              <label className="block text-sm font-medium">Archivo (opcional)</label>
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleImportFile}
                className="mt-1 block w-full text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Lista tabular (cod, cost_price)</label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={10}
                className="mt-1 block w-full border-gray-300 rounded-md font-mono text-sm"
                placeholder={"cod\tcost_price\nA001\t12500\nA002\t21000"}
              />
            </div>

            <div className="bg-blue-50 text-blue-900 text-sm p-3 rounded-md">
              Reglas: solo actualiza productos existentes por cod + proveedor seleccionado. Recalcula final_price solo cuando auto_price = true. No toca offer_price ni crea productos.
            </div>

            {importSummary && (
              <div className="bg-gray-50 rounded-md p-4 text-sm space-y-1">
                <p><strong>Total filas:</strong> {importSummary.totalRows}</p>
                <p><strong>Productos encontrados:</strong> {importSummary.found}</p>
                <p><strong>Productos actualizados:</strong> {importSummary.updated}</p>
                <p><strong>No encontrados:</strong> {importSummary.notFound}</p>
                <p><strong>Ignorados:</strong> {importSummary.ignored}</p>
              </div>
            )}

            <div className="flex justify-end pt-2 space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleImportSupplierCosts}
                disabled={isProcessing}
                className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-4 h-4 animate-spin" />
                    <span>Importando...</span>
                  </>
                ) : (
                  <>
                    <Icon path="M4.5 12.75l6 6 9-13.5" className="w-4 h-4" />
                    <span>Importar Costos</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
    </Modal>
  );
};
