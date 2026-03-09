import React, { useState, useMemo, useCallback } from 'react';
import { Product } from '../../types';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

interface QuickPriceEditorViewProps {
    products: Product[];
    refreshData: () => void;
    isLoading: boolean;
}

const formatValue = (value: number | undefined): string => {
    if (value === undefined || value === null) return '';
    // Evita mostrar 0 cuando el campo está vacío o recién inicializado.
    if (value === 0) return ''; 
    return String(value).replace('.', ',');
};

const EditableCell: React.FC<{
    value: number | undefined;
    onChange: (newValue: string) => void;
    isSaving: boolean;
    placeholder?: string;
    className?: string;
}> = React.memo(({ value, onChange, isSaving, placeholder, className='' }) => (
    <input
        type="text"
        inputMode="decimal"
        value={formatValue(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={isSaving}
        placeholder={placeholder}
        className={`w-full text-right bg-transparent border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none ${className}`}
    />
));
EditableCell.displayName = 'EditableCell';


export const QuickPriceEditorView: React.FC<QuickPriceEditorViewProps> = ({ products, refreshData, isLoading }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [providerFilter, setProviderFilter] = useState('All');

    // State holds only the changes. `stockAdjustment` is the delta.
    const [editedProducts, setEditedProducts] = useState<Record<string, { 'P.Costo'?: number; 'Precio'?: number; stockAdjustment?: number }>>({});
    const [isSaving, setIsSaving] = useState(false);
    const { addToast } = useToast();

    const { categories, providers } = useMemo(() => {
        const uniqueCategories = new Set(products.map(p => p.Categoria).filter(Boolean));
        const uniqueProviders = new Set(products.map(p => p.Proveedor).filter(Boolean));
        return {
            categories: ['All', ...Array.from(uniqueCategories).sort()],
            providers: ['All', ...Array.from(uniqueProviders).sort()]
        };
    }, [products]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => (
            (categoryFilter === 'All' || p.Categoria === categoryFilter) &&
            (providerFilter === 'All' || p.Proveedor === providerFilter) &&
            (
                String(p.Producto || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                String(p.cod || '').toLowerCase().includes(searchTerm.toLowerCase())
            )
        )).sort((a,b) => (a.Producto || '').localeCompare(b.Producto || ''));
    }, [products, searchTerm, categoryFilter, providerFilter]);

    const handleFieldChange = useCallback((cod: string, field: 'P.Costo' | 'Precio' | 'stockAdjustment', value: string) => {
        const numericValue = value === '' ? 0 : parseFloat(value.replace(',', '.')) || 0;
        setEditedProducts(prev => ({
            ...prev,
            [cod]: {
                ...prev[cod],
                [field]: numericValue
            }
        }));
    }, []);

    const handleSaveChanges = async () => {
        const updatesToSave = Object.entries(editedProducts)
            .map(([cod, edits]) => {
                const originalProduct = products.find(p => p.cod === cod);
                if (!originalProduct) return null;

                const payload: Partial<Product> & { cod: string } = { cod };
                let hasChanges = false;

                if (edits['P.Costo'] !== undefined) {
                    payload['P.Costo'] = edits['P.Costo'];
                    hasChanges = true;
                }
                if (edits['Precio'] !== undefined) {
                    payload.Precio = edits['Precio'];
                    hasChanges = true;
                }
                // FIX: Cast `edits` to `any` to resolve incorrect 'unknown' type error from TypeScript compiler.
                if ((edits as any).stockAdjustment !== undefined && (edits as any).stockAdjustment !== 0) {
                    // Calculate the new total 'Ingresos' value by applying the adjustment
                    // FIX: Cast `edits` to `any` to resolve incorrect 'unknown' type error from TypeScript compiler.
                    payload.Ingresos = (originalProduct.Ingresos || 0) + (edits as any).stockAdjustment;
                    hasChanges = true;
                }

                return hasChanges ? payload : null;
            })
            .filter((p): p is Partial<Product> & { cod: string } => p !== null);

        if (updatesToSave.length === 0) {
            addToast('No hay cambios para guardar.', 'info');
            return;
        }

        setIsSaving(true);
        try {
            await Promise.all(updatesToSave.map(update => api.updateProduct(update)));
            
            addToast(`${updatesToSave.length} producto(s) actualizado(s) con éxito.`, 'success');
            setEditedProducts({});
            refreshData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            addToast(`Error al guardar los cambios: ${errorMessage}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscardChanges = () => {
        if (window.confirm("¿Está seguro que desea descartar todos los cambios no guardados?")) {
            setEditedProducts({});
            addToast('Cambios descartados.', 'info');
        }
    };

    const hasChanges = Object.keys(editedProducts).length > 0;

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="flex justify-between items-center flex-wrap gap-4 mb-4">
                <h1 className="text-3xl font-bold text-gray-800">Edición Rápida de Precios y Stock</h1>
                <div className="flex items-center gap-4">
                    <button onClick={handleDiscardChanges} disabled={!hasChanges || isSaving} className="bg-white text-gray-700 px-4 py-2 rounded-lg font-medium border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
                        Descartar Cambios ({Object.keys(editedProducts).length})
                    </button>
                    <button onClick={handleSaveChanges} disabled={!hasChanges || isSaving} className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 flex items-center space-x-2">
                         {isSaving ? (
                            <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                        ) : (
                            <Icon path="M4.5 12.75l6 6 9-13.5" className="w-5 h-5"/>
                        )}
                        <span>Guardar Cambios</span>
                    </button>
                </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row gap-4 mb-4">
                <input
                    type="text" placeholder="Buscar producto o código..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    className="w-full md:flex-grow border-gray-300 rounded-md shadow-sm"
                />
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="w-full md:w-auto border-gray-300 rounded-md shadow-sm">
                    {categories.map(c => <option key={c} value={c}>{c === 'All' ? 'Todas las Categorías' : c}</option>)}
                </select>
                <select value={providerFilter} onChange={e => setProviderFilter(e.target.value)} className="w-full md:w-auto border-gray-300 rounded-md shadow-sm">
                    {providers.map(p => <option key={p} value={p}>{p === 'All' ? 'Todos los Proveedores' : p}</option>)}
                </select>
            </div>

            <div className="flex-grow bg-white shadow-md rounded-lg overflow-hidden flex flex-col">
                <div className="overflow-y-auto">
                    {isLoading ? (
                        <div className="p-10 text-center text-gray-500">Cargando productos...</div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Código</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-1/3">Producto</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-40" title="Precio de Costo">P. Costo</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-40" title="Precio de Venta Base (de Lista)">Precio Base (Lista)</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-32" title="Stock actual según la fórmula de la hoja de cálculo. No editable.">Stock (Sheet)</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase" title="Muestra cómo quedará el stock si se modifica el campo de ajuste.">Stock Proyectado</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-40" title="Ajuste manual para sumar (10) o restar (-5) unidades de stock.">Ajuste Stock (+/-)</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredProducts.map(product => {
                                    const edited = editedProducts[product.cod];
                                    const hasChanged = !!edited;
                                    
                                    const costValue = edited?.['P.Costo'] ?? product['P.Costo'];
                                    const priceValue = edited?.Precio ?? product.Precio;
                                    const stockAdjustment = edited?.stockAdjustment ?? 0;

                                    const projectedStock = (product.stockk || 0) + stockAdjustment;

                                    return (
                                        <tr key={product.cod} className={`transition-colors ${hasChanged ? 'bg-yellow-50' : ''}`}>
                                            <td className="px-4 py-2 text-sm text-gray-500 font-mono">{product.cod}</td>
                                            <td className="px-4 py-2 text-sm font-medium text-gray-900 truncate" title={product.Producto}>{product.Producto}</td>
                                            <td className="px-4 py-2">
                                                <EditableCell value={costValue} onChange={(val) => handleFieldChange(product.cod, 'P.Costo', val)} isSaving={isSaving} />
                                            </td>
                                            <td className="px-4 py-2">
                                                <EditableCell value={priceValue} onChange={(val) => handleFieldChange(product.cod, 'Precio', val)} isSaving={isSaving} />
                                            </td>
                                            <td className="px-4 py-2 text-center text-sm font-semibold text-gray-500">{product.stockk}</td>
                                            <td className={`px-4 py-2 text-center text-sm font-bold ${projectedStock < 0 ? 'text-red-600' : 'text-gray-800'}`}>{projectedStock}</td>
                                            <td className="px-4 py-2">
                                                <EditableCell
                                                    value={edited?.stockAdjustment}
                                                    onChange={(val) => handleFieldChange(product.cod, 'stockAdjustment', val)}
                                                    isSaving={isSaving}
                                                    placeholder="0"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                     { !isLoading && filteredProducts.length === 0 && (
                        <p className="p-10 text-center text-gray-500">No se encontraron productos con los filtros actuales.</p>
                    )}
                </div>
            </div>
        </div>
    );
};
