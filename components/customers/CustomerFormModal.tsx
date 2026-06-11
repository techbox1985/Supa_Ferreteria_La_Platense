

import React, { useState, useEffect } from 'react';
import { Customer } from '../../types';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (customerData: any) => Promise<void>;
  customers: Customer[];
  customerToEdit?: Customer | null;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  customerToEdit,
}) => {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [docType, setDocType] = useState('DNI');
  const [docNumber, setDocNumber] = useState('');
  const [ivaCondition, setIvaCondition] = useState<Customer['Condicion_IVA']>('Consumidor Final');
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  
  const isEditing = !!customerToEdit;
  
  useEffect(() => {
    if (isOpen) {
        if (isEditing) {
          setName(customerToEdit['Nombre y Apellido']);
          setWhatsapp(customerToEdit.Whatsapp);
          setDocType(customerToEdit['Tipo.Documento'] || 'DNI');
          setDocNumber(customerToEdit.Documento || '');
          setIvaCondition(customerToEdit.Condicion_IVA || 'Consumidor Final');
          setDiscountPct(customerToEdit.discount_percentage ?? 0);
        } else {
          // Reset for new customer
          setName('');
          setWhatsapp('');
          setDocType('DNI');
          setDocNumber('');
          setIvaCondition('Consumidor Final');
          setDiscountPct(0);
        }
        setIsSaving(false); // Reset saving state when modal opens
    }
  }, [isOpen, customerToEdit, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      alert('El nombre y apellido son obligatorios.');
      return;
    }

    if (!whatsapp) {
      alert('El número de WhatsApp es obligatorio.');
      return;
    }

    const whatsappRegex = /^\d{10,}$/; // Allow 10 or more digits
    if (!whatsappRegex.test(whatsapp)) {
        alert('El número de WhatsApp debe tener al menos 10 dígitos (ejemplo: 2215383755). No incluya prefijos, espacios ni símbolos.');
        return;
    }
    
    if (ivaCondition === 'Responsable Inscripto' && docType !== 'CUIT') {
        alert('Para un "Responsable Inscripto", el tipo de documento debe ser CUIT.');
        return;
    }

    setIsSaving(true);
    
    const customerData = {
      'Nombre y Apellido': name,
      Whatsapp: whatsapp,
      'Tipo.Documento': docType,
      Documento: docNumber,
      Condicion_IVA: ivaCondition,
      Deuda: isEditing ? customerToEdit.Deuda : 0,
      Pagos: isEditing ? customerToEdit.Pagos : 0,
      discount_percentage: Math.min(100, Math.max(0, Number(discountPct) || 0)),
      ...(isEditing && { Id_Cliente: customerToEdit.Id_Cliente })
    };

    try {
        await onSave(customerData);
    } catch (error) {
        // Parent component handles alert, we just need to reset the form's state
    } finally {
        setIsSaving(false);
    }
  };
  
  return (
    <Modal isOpen={isOpen} onClose={isSaving ? () => {} : onClose} title={isEditing ? "Editar Cliente" : "Nuevo Cliente"}>
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nombre y Apellido</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            required
            disabled={isSaving}
          />
        </div>
        <div>
          <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-700">WhatsApp (Obligatorio - 10 dígitos, ej: 2215383755)</label>
          <input
            type="text"
            id="whatsapp"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            required
            disabled={isSaving}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ivaCondition" className="block text-sm font-medium text-gray-700">Condición ante el IVA</label>
              <select 
                id="ivaCondition" 
                value={ivaCondition} 
                onChange={e => setIvaCondition(e.target.value as Customer['Condicion_IVA'])} 
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                disabled={isSaving}
                required
              >
                <option>Consumidor Final</option>
                <option>Responsable Inscripto</option>
                <option>Responsable Monotributo</option>
                <option>Sujeto Exento</option>
                <option>Sujeto no Categorizado</option>
                <option>IVA No Alcanzado</option>
              </select>
            </div>
            <div>
              <label htmlFor="docType" className="block text-sm font-medium text-gray-700">Tipo de Documento</label>
              <select 
                id="docType" 
                value={docType} 
                onChange={e => setDocType(e.target.value)} 
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                disabled={isSaving}
              >
                <option>DNI</option>
                <option>CUIT</option>
                <option>CUIL</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="docNumber" className="block text-sm font-medium text-gray-700">Número de Documento</label>
              <input
                type="text"
                id="docNumber"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                disabled={isSaving}
              />
            </div>
        </div>
        <div>
          <label htmlFor="discountPct" className="block text-sm font-medium text-gray-700">Descuento automático (%)</label>
          <input
            type="number"
            id="discountPct"
            min={0}
            max={100}
            step={0.01}
            value={discountPct}
            onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            disabled={isSaving}
          />
          <p className="mt-1 text-xs text-gray-500">Se aplicará automáticamente en el punto de venta para este cliente.</p>
        </div>
        <div className="flex justify-end space-x-3 pt-4">
          <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors disabled:opacity-50" disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 w-48 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled={isSaving}>
             {isSaving ? (
                <>
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                    <span>Guardando...</span>
                </>
            ) : (
                <>
                    <Icon path="M4.5 12.75l6 6 9-13.5" className="w-5 h-5"/>
                    <span>Guardar Cliente</span>
                </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};