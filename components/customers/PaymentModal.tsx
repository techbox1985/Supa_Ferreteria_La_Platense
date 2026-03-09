import React, { useState, useEffect, useContext } from 'react';
import { Customer } from '../../types';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { useToast } from '../../contexts/ToastContext';
import { AuthContext } from '../../contexts/AuthContext';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  onSave: (paymentData: { amount: number, description: string, paymentMethod: 'Efectivo' | 'Digital', shiftId: string }) => Promise<void>;
}

// Helper robusto para interpretar números en formato es-AR (ej: "1.234,56")
const parseLocaleNumber = (value: string): number => {
    if (typeof value !== 'string' || !value) {
        return 0;
    }
    // Para es-AR: '.' es un separador de miles, ',' es el decimal.
    // 1. Quitar todos los puntos.
    // 2. Reemplazar la coma con un punto.
    // 3. Interpretar como número flotante.
    const sanitizedValue = value.replace(/\./g, '').replace(',', '.');
    const number = parseFloat(sanitizedValue);
    return isNaN(number) ? 0 : number;
};


export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, customer, onSave }) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('Pago de cuenta corriente');
  const [paymentMethod, setPaymentMethod] = useState<'Efectivo' | 'Digital'>('Efectivo');
  const [isSaving, setIsSaving] = useState(false);
  const { addToast } = useToast();
  const { activeShift } = useContext(AuthContext);

  useEffect(() => {
    if (isOpen) {
      // Reset fields when modal opens
      setAmount('');
      setDescription('Pago de cuenta corriente');
      setPaymentMethod('Efectivo');
      setIsSaving(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const paymentAmount = parseLocaleNumber(amount);
    if (paymentAmount <= 0) {
      addToast('Por favor, ingrese un monto válido.', 'error');
      return;
    }
    if (!activeShift) {
        addToast('Error: No se puede registrar un pago sin un turno activo.', 'error');
        return;
    }
    if (paymentAmount > customer.Deuda) {
        if(!window.confirm(`El monto ingresado ($${paymentAmount.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}) es mayor a la deuda actual ($${customer.Deuda.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}). ¿Desea registrarlo como un pago a favor?`)){
            return;
        }
    }
    
    setIsSaving(true);
    try {
      await onSave({ amount: paymentAmount, description, paymentMethod, shiftId: activeShift.ID_Turno });
    } catch (error) {
        // The parent component shows the toast. We just need to ensure the form is re-enabled.
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Modal isOpen={isOpen} onClose={isSaving ? () => {} : onClose} title={`Registrar Pago para ${customer['Nombre y Apellido']}`}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-gray-50 p-4 rounded-lg text-center">
          <p className="text-sm text-gray-600">Deuda Actual</p>
          <p className="text-3xl font-bold text-red-600">${customer.Deuda.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
        </div>

        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Monto del Pago</label>
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
              className="block w-full pl-7 pr-2 py-2 border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              placeholder="0,00"
              required
              autoFocus
              disabled={isSaving}
            />
          </div>
        </div>
        
        <div>
            <span className="block text-sm font-medium text-gray-700">Método de Pago</span>
            <div className="mt-2 flex space-x-4">
                <label className="flex items-center space-x-2">
                    <input type="radio" name="paymentMethod" value="Efectivo" checked={paymentMethod === 'Efectivo'} onChange={() => setPaymentMethod('Efectivo')} className="focus:ring-green-500 h-4 w-4 text-green-600 border-gray-300" disabled={isSaving}/>
                    <span className="text-sm">Efectivo</span>
                </label>
                 <label className="flex items-center space-x-2">
                    <input type="radio" name="paymentMethod" value="Digital" checked={paymentMethod === 'Digital'} onChange={() => setPaymentMethod('Digital')} className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300" disabled={isSaving}/>
                    <span className="text-sm">Digital (Banco/MP)</span>
                </label>
            </div>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">Descripción (Opcional)</label>
          <input
            type="text"
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            disabled={isSaving}
          />
        </div>
        
        <div className="flex justify-end space-x-3 pt-4">
          <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors disabled:opacity-50" disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 w-48 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled={isSaving}>
            {isSaving ? (
                <>
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                    <span>Procesando...</span>
                </>
            ) : (
                <>
                    <Icon path="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.826-2.997.11-2.003 1.189z" className="w-5 h-5"/>
                    <span>Confirmar Pago</span>
                </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};