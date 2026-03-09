import React, { useState, useMemo } from 'react';
import { Supplier } from '../../types';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { SupplierFormModal } from './SupplierFormModal';
import { useToast } from '../../contexts/ToastContext';

interface SuppliersViewProps {
    allSuppliers: Supplier[];
    refreshSuppliers: () => void;
    isLoading: boolean;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({ allSuppliers, refreshSuppliers, isLoading }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setFormOpen] = useState(false);
    const [supplierToEdit, setSupplierToEdit] = useState<Supplier | null>(null);
    const { addToast } = useToast();

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
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                                <th className="relative px-6 py-3"></th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200">
                            {filteredSuppliers.map(s => (
                                <tr key={s.ID_Proveedor} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{s.Nombre}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{s.CUIT}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{s.Telefono}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{s.Email}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${s.Activo === 'SI' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {s.Activo === 'SI' ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                         <button onClick={() => handleEdit(s)} className="text-blue-600 hover:text-blue-800" title="Editar Proveedor">
                                            <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
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
        </div>
    );
};