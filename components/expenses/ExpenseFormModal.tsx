import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { Expense } from '../../types';

interface ExpenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { id_gastos?: string; detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; tipo: 'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros' }) => Promise<void>;
  expenseToEdit?: Expense | null;
}

const EXPENSE_TYPES: Array<'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros'> = ['Fijos', 'Impuestos', 'Sueldos', 'Proveedores', 'Otros'];

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({ isOpen, onClose, onSave, expenseToEdit }) => {
  const [detail, setDetail] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<'Efectivo' | 'Digital'>('Efectivo');
  const [tipo, setTipo] = useState<'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros'>('Otros');
  const [isSaving, setIsSaving] = useState(false);
  
  const isEditing = !!expenseToEdit;

  useEffect(() => {
    if (isOpen) {
      if (isEditing && expenseToEdit) {
        setDetail(expenseToEdit.Detalle);
        setAmount(String(expenseToEdit.Monto).replace('.', ',')); // Format for es-AR input
        setPaymentType(expenseToEdit.Efectivo > 0 ? 'Efectivo' : 'Digital');
        setTipo(expenseToEdit.Tipo || 'Otros');
      } else {
        setDetail('');
        setAmount('');
        setPaymentType('Efectivo');
        setTipo('Otros');
      }
      setIsSaving(false);
    }
  }, [isOpen, expenseToEdit, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(String(amount).replace(',', '.'));
    if (!detail || isNaN(numericAmount) || numericAmount <= 0) {
      alert('Por favor, complete el detalle y un monto válido.');
      return;
    }
    
    setIsSaving(true);
    try {
        await onSave({
            id_gastos: isEditing ? expenseToEdit.id_gastos : undefined,
            detalle: detail,
            monto: numericAmount,
            paymentType,
          tipo,
        });
    } catch(error) {
        // Parent handles toast, we just need to re-enable the form
    } finally {
        setIsSaving(false);
    }
  };
  
  return (
    <Modal isOpen={isOpen} onClose={isSaving ? () => {} : onClose} title={isEditing ? "Editar Gasto" : "Registrar Nuevo Gasto"}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="detail" className="block text-sm font-medium text-gray-700">Detalle del Gasto</label>
          <input
            type="text"
            id="detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            required
            autoFocus
            disabled={isSaving}
          />
        </div>

        <div>
          <label htmlFor="tipo" className="block text-sm font-medium text-gray-700">Tipo de Gasto</label>
          <select
            id="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as 'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros')}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={isSaving}
          >
            {EXPENSE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Monto</label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">$</span>
            </div>
            <input
              type="text"
              inputMode="decimal"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="block w-full pl-7 pr-2 py-2 border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="0,00"
              required
              disabled={isSaving}
            />
          </div>
        </div>

        <div>
            <span className="block text-sm font-medium text-gray-700">Origen del Dinero</span>
            <div className="mt-2 flex space-x-4">
                <label className="flex items-center space-x-2">
                    <input type="radio" name="paymentType" value="Efectivo" checked={paymentType === 'Efectivo'} onChange={() => setPaymentType('Efectivo')} className="focus:ring-green-500 h-4 w-4 text-green-600 border-gray-300" disabled={isSaving}/>
                    <span className="text-sm">Efectivo (Caja)</span>
                </label>
                 <label className="flex items-center space-x-2">
                    <input type="radio" name="paymentType" value="Digital" checked={paymentType === 'Digital'} onChange={() => setPaymentType('Digital')} className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300" disabled={isSaving}/>
                    <span className="text-sm">Digital (Banco/MP)</span>
                </label>
            </div>
        </div>
        
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors" disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 w-48 disabled:bg-gray-400" disabled={isSaving}>
             {isSaving ? (
                <>
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                    <span>Guardando...</span>
                </>
            ) : (
                <>
                    <Icon path="M4.5 12.75l6 6 9-13.5" className="w-5 h-5"/>
                    <span>{isEditing ? 'Guardar Cambios' : 'Guardar Gasto'}</span>
                </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};