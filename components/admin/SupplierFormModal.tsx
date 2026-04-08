import React, { useState, useEffect } from 'react';
import { Supplier } from '../../types';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (supplierData: Omit<Supplier, 'ID_Proveedor'> | Supplier) => Promise<void>;
  supplierToEdit?: Supplier | null;
}

export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({ isOpen, onClose, onSave, supplierToEdit }) => {
  const [formData, setFormData] = useState<Partial<Omit<Supplier, 'ID_Proveedor'>>>({
    Nombre: '',
    CUIT: '',
    Condicion_IVA: 'Responsable Inscripto',
    Email: '',
    Telefono: '',
    Contacto: '',
    Direccion: '',
    tax_1_percent: 0,
    tax_2_percent: 0,
    tax_3_percent: 0,
    tax_4_percent: 0,
    Activo: 'SI',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  
  const isEditing = !!supplierToEdit;
  
  useEffect(() => {
    if (isOpen) {
        if (isEditing && supplierToEdit) {
          setFormData(supplierToEdit);
        } else {
          setFormData({
            Nombre: '', CUIT: '', Condicion_IVA: 'Responsable Inscripto', Email: '',
            Telefono: '', Contacto: '', Direccion: '', tax_1_percent: 0, tax_2_percent: 0, tax_3_percent: 0, tax_4_percent: 0, Activo: 'SI',
          });
        }
        setIsSaving(false);
        setError('');
    }
  }, [isOpen, supplierToEdit, isEditing]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (value.trim() === '') {
      setFormData(prev => ({ ...prev, [name]: 0 }));
      return;
    }
    const parsed = parseFloat(value.replace(',', '.'));
    setFormData(prev => ({ ...prev, [name]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!formData.Nombre || formData.Nombre.trim() === '') {
      setError('El nombre es obligatorio.');
      return;
    }

    setIsSaving(true);
    
    const normalizedTax1 = Number.isFinite(Number(formData.tax_1_percent)) ? Number(formData.tax_1_percent) : 0;
    const normalizedTax2 = Number.isFinite(Number(formData.tax_2_percent)) ? Number(formData.tax_2_percent) : 0;
    const normalizedTax3 = Number.isFinite(Number(formData.tax_3_percent)) ? Number(formData.tax_3_percent) : 0;
    const normalizedTax4 = Number.isFinite(Number(formData.tax_4_percent)) ? formData.tax_4_percent : 0;

    const dataToSave = isEditing 
      ? { ...formData, tax_1_percent: normalizedTax1, tax_2_percent: normalizedTax2, tax_3_percent: normalizedTax3, tax_4_percent: normalizedTax4, ID_Proveedor: supplierToEdit.ID_Proveedor }
      : { ...formData, tax_1_percent: normalizedTax1, tax_2_percent: normalizedTax2, tax_3_percent: normalizedTax3, tax_4_percent: normalizedTax4 };

    try {
        await onSave(dataToSave as Supplier | Omit<Supplier, 'ID_Proveedor'>);
    } catch (err) {
      // Parent will show toast
    } finally {
        setIsSaving(false);
    }
  };
  
  return (
    <Modal isOpen={isOpen} onClose={isSaving ? () => {} : onClose} title={isEditing ? "Editar Proveedor" : "Nuevo Proveedor"} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium">Nombre</label>
                <input type="text" name="Nombre" value={formData.Nombre || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" required disabled={isSaving}/>
            </div>
            <div>
                <label className="block text-sm font-medium">CUIT</label>
                <input type="text" name="CUIT" value={formData.CUIT || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}/>
            </div>
            <div>
                <label className="block text-sm font-medium">Condición IVA</label>
                <select name="Condicion_IVA" value={formData.Condicion_IVA} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                    <option value="Responsable Inscripto">Responsable Inscripto</option>
                    <option value="Responsable Monotributo">Responsable Monotributo</option>
                    <option value="Sujeto Exento">Sujeto Exento</option>
                    <option value="Consumidor Final">Consumidor Final</option>
                    <option value="Sujeto no Categorizado">Sujeto no Categorizado</option>
                    <option value="IVA No Alcanzado">IVA No Alcanzado</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium">Email</label>
                <input type="email" name="Email" value={formData.Email || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}/>
            </div>
            <div>
                <label className="block text-sm font-medium">Teléfono</label>
                <input type="text" name="Telefono" value={formData.Telefono || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}/>
            </div>
            <div>
                <label className="block text-sm font-medium">Contacto</label>
                <input type="text" name="Contacto" value={formData.Contacto || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}/>
            </div>
            <div className="md:col-span-2">
                <label className="block text-sm font-medium">Dirección</label>
                <input type="text" name="Direccion" value={formData.Direccion || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}/>
            </div>
            <div>
              <label className="block text-sm font-medium">Impuesto 1 (%)</label>
              <input
                type="number"
                name="tax_1_percent"
                step="0.01"
                value={formData.tax_1_percent ?? 0}
                onChange={handleTaxChange}
                className="mt-1 block w-full border-gray-300 rounded-md"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Impuesto 2 (%)</label>
              <input
                type="number"
                name="tax_2_percent"
                step="0.01"
                value={formData.tax_2_percent ?? 0}
                onChange={handleTaxChange}
                className="mt-1 block w-full border-gray-300 rounded-md"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Impuesto 3 (%)</label>
              <input
                type="number"
                name="tax_3_percent"
                step="0.01"
                value={formData.tax_3_percent ?? 0}
                onChange={handleTaxChange}
                className="mt-1 block w-full border-gray-300 rounded-md"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Impuesto 4 (%)</label>
              <input
                type="number"
                name="tax_4_percent"
                step="0.01"
                value={formData.tax_4_percent ?? 0}
                onChange={handleTaxChange}
                className="mt-1 block w-full border-gray-300 rounded-md"
                disabled={isSaving}
              />
            </div>
            <div>
                <label className="block text-sm font-medium">Estado</label>
                <select name="Activo" value={formData.Activo} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                    <option value="SI">Activo</option>
                    <option value="NO">Inactivo</option>
                </select>
            </div>
        </div>
        
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300" disabled={isSaving}>Cancelar</button>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center space-x-2 w-48 justify-center disabled:bg-gray-400" disabled={isSaving}>
             {isSaving ? ( <> <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/> <span>Guardando...</span> </> ) 
             : ( <> <Icon path="M4.5 12.75l6 6 9-13.5" className="w-5 h-5"/> <span>Guardar</span> </> )}
          </button>
        </div>
      </form>
    </Modal>
  );
};