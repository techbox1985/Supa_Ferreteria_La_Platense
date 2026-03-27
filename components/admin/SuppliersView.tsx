import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Supplier, SupplierAccountSummary } from '../../types';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { SupplierFormModal } from './SupplierFormModal';
import { SupplierCuentaCorrienteModal } from './SupplierCuentaCorrienteModal';
import { useToast } from '../../contexts/ToastContext';

interface SuppliersViewProps {
    allSuppliers: Supplier[];
    refreshSuppliers: () => void;
    isLoading: boolean;
}

const formatCurrency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n);

const formatPercent = (n?: number) => `${Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '0.00'}%`;

export const SuppliersView: React.FC<SuppliersViewProps> = ({ allSuppliers, refreshSuppliers, isLoading }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setFormOpen] = useState(false);
    const [supplierToEdit, setSupplierToEdit] = useState<Supplier | null>(null);
    const [ccSupplier, setCcSupplier] = useState<Supplier | null>(null);
    const [accountSummaries, setAccountSummaries] = useState<Map<string, SupplierAccountSummary>>(new Map());
    const [isSummaryLoading, setIsSummaryLoading] = useState(false);
    const { addToast } = useToast();

    const loadAccountSummaries = useCallback(async () => {
        setIsSummaryLoading(true);
        try {
            const summaries = await api.getSupplierAccountSummaries();
            const map = new Map<string, SupplierAccountSummary>();
            summaries.forEach(s => map.set(s.supplier_id, s));
            setAccountSummaries(map);
        } catch {
            // Non-critical — CC data unavailable, table still works
        } finally {
            setIsSummaryLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAccountSummaries();
    }, [loadAccountSummaries]);

    const filteredSuppliers = useMemo(() => {
        return allSuppliers.filter(s =>
            (s.Nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.CUIT || '').includes(searchTerm)
        ).sort((a,b) => (a.Nombre || '').localeCompare(b.Nombre || ''));
    }, [allSuppliers, searchTerm]);
    
    const handleAddNew = () => {
        setSupplierToEdit(null);
        setFormOpen(true);
    };

    const handleEdit = (supplier: Supplier) => {
        setSupplierToEdit(supplier);
        setFormOpen(true);
    };

    const handleSaveSupplier = async (supplierData: Omit<Supplier, 'ID_Proveedor'> | Supplier) => {
        try {
            if ('ID_Proveedor' in supplierData) {
                await api.updateSupplier(supplierData);
            } else {
                await api.addSupplier(supplierData as Omit<Supplier, 'ID_Proveedor'>);
            }
            refreshSuppliers();
            addToast('Proveedor guardado con éxito.', 'success');
            setFormOpen(false);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error.';
            addToast(`Error al guardar: ${errorMessage}`, 'error');
            throw error;
        }
    };

    const handlePaymentRecorded = useCallback(() => {
        loadAccountSummaries();
    }, [loadAccountSummaries]);

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Gestión de Proveedores</h1>
                <button onClick={handleAddNew} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center space-x-2">
                    <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-5 h-5"/>
                    <span>Nuevo Proveedor</span>
                </button>
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="p-4 border-b">
                     <input type="text" placeholder="Buscar por nombre o CUIT..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full max-w-lg pl-4 pr-4 py-2 border border-gray-300 rounded-lg"/>
                </div>
                 <div className="overflow-x-auto">
                    {isLoading ? (<div className="p-10 text-center">Cargando...</div>) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CUIT</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teléfono</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Imp. 1</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Imp. 2</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Imp. 3</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Facturado</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pagado</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                                <th className="relative px-6 py-3"></th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200">
                            {filteredSuppliers.map(s => {
                                const summary = accountSummaries.get(s.ID_Proveedor);
                                return (
                                    <tr key={s.ID_Proveedor} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{s.Nombre}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">{s.CUIT}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">{s.Telefono}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700">{formatPercent(s.tax_1_percent)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700">{formatPercent(s.tax_2_percent)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700">{formatPercent(s.tax_3_percent)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700">
                                            {isSummaryLoading ? '…' : (summary ? formatCurrency(summary.total_facturado) : '—')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-700">
                                            {isSummaryLoading ? '…' : (summary ? formatCurrency(summary.total_pagado) : '—')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold">
                                            {isSummaryLoading ? '…' : (
                                                summary
                                                    ? <span className={summary.saldo_pendiente > 0 ? 'text-red-700' : 'text-gray-600'}>{formatCurrency(summary.saldo_pendiente)}</span>
                                                    : <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${s.Activo === 'SI' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {s.Activo === 'SI' ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex items-center justify-end gap-3">
                                                <button
                                                    onClick={() => setCcSupplier(s)}
                                                    className="text-green-600 hover:text-green-800 text-xs font-semibold underline"
                                                    title="Ver Cuenta Corriente"
                                                >
                                                    CC
                                                </button>
                                                <button onClick={() => handleEdit(s)} className="text-blue-600 hover:text-blue-800" title="Editar Proveedor">
                                                    <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                         </tbody>
                    </table>
                     )}
                 </div>
            </div>
             <SupplierFormModal
                isOpen={isFormOpen}
                onClose={() => setFormOpen(false)}
                onSave={handleSaveSupplier}
                supplierToEdit={supplierToEdit}
            />
            {ccSupplier && (
                <SupplierCuentaCorrienteModal
                    isOpen={!!ccSupplier}
                    onClose={() => setCcSupplier(null)}
                    supplier={ccSupplier}
                    onPaymentRecorded={handlePaymentRecorded}
                />
            )}
        </div>
    );
};