import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';

interface OpenShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmOpen: (amount: number) => Promise<void>;
  userName: string;
}

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({ isOpen, onClose, onConfirmOpen, userName }) => {
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const openingAmount = parseFloat(String(amount).replace(',', '.'));
    if (isNaN(openingAmount) || openingAmount < 0) {
      alert('Por favor, ingrese un monto inicial válido.');
      return;
    }
    setIsProcessing(true);
    try {
        await onConfirmOpen(openingAmount);
        // On success, the parent component will handle closing the modal or changing the view.
    } catch(error) {
        console.error("Failed to open shift", error);
        alert(`Error al abrir la caja: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        setIsProcessing(false);
    }
  };
  
  return (
    <Modal isOpen={isOpen} onClose={isProcessing ? () => {} : onClose} title="Abrir Caja">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="text-center">
            <p className="text-lg">Bienvenido, <span className="font-bold">{userName}</span>.</p>
            <p className="text-gray-600">Para comenzar, ingrese el monto inicial de efectivo en caja.</p>
        </div>

        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Monto de Apertura</label>
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
              className="block w-full text-center text-2xl py-2 pl-7 pr-2 border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="0,00"
              required
              autoFocus
              disabled={isProcessing}
            />
          </div>
        </div>
        
        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            className="w-full bg-green-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 text-lg disabled:bg-gray-400"
            disabled={isProcessing}
            >
            {isProcessing ? (
                <>
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                    <span>Procesando...</span>
                </>
            ) : (
                <>
                    <Icon path="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" className="w-6 h-6"/>
                    <span>Confirmar y Abrir Turno</span>
                </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
