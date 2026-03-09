import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

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

export const MassPriceUpdateModal: React.FC<MassPriceUpdateModalProps> = ({
  isOpen,
  onClose,
  categories,
  providers,
  onUpdate
}) => {
  const [filterBy, setFilterBy] = useState<FilterByType>('All');
  const [filterValue, setFilterValue] = useState('');
  const [targetPrice, setTargetPrice] = useState<TargetPriceType>('Precio');
  const [updateType, setUpdateType] = useState<UpdateType>('percentage');
  const [updateValue, setUpdateValue] = useState('');
  
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useToast();

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
    <Modal isOpen={isOpen} onClose={isProcessing ? () => {} : onClose} title="Actualización Masiva de Precios">
        {step === 'form' && (
             <form onSubmit={handleNext} className="space-y-4">
                {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}
                
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
        {step === 'confirm' && (
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
    </Modal>
  );
};
