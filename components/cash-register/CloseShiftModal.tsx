import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { Shift, Sale, Expense } from '../../types';
import * as api from '../../services/api';

interface CloseShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmClose: (closingAmount: number) => Promise<void>;
  activeShift: Shift;
  allSales: Sale[];
  allExpenses: Expense[];
}

const formatCurrency = (value: number | undefined | null) => {
  if (typeof value !== 'number' || isNaN(value)) {
    return '$ -';
  }
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({ isOpen, onClose, onConfirmClose, activeShift }) => {
  const [closingAmount, setClosingAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  // Cobros de deuda del turno
  const [shiftPaymentsCash, setShiftPaymentsCash] = useState(0);
  const [shiftPaymentsDigital, setShiftPaymentsDigital] = useState(0);
  const [shiftPaymentsTotal, setShiftPaymentsTotal] = useState(0);

  // Cargar cobros de deuda cuando se abre el modal
  useEffect(() => {
    if (!isOpen || !activeShift) return;
    let cancelled = false;
    const fetchPayments = async () => {
      try {
        const payments = await api.getPaymentsForShift(activeShift.ID_Turno);
        if (cancelled) return;
        const cash = payments.filter(p => p.payment_method === 'efectivo').reduce((s, p) => s + p.credit, 0);
        const digital = payments.filter(p => p.payment_method === 'digital').reduce((s, p) => s + p.credit, 0);
        setShiftPaymentsCash(cash);
        setShiftPaymentsDigital(digital);
        setShiftPaymentsTotal(cash + digital);
      } catch {
        // No crítico — el resumen sigue funcionando sin este dato
      }
    };
    fetchPayments();
    return () => { cancelled = true; };
  }, [isOpen, activeShift]);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setClosingAmount('');
      setIsProcessing(false);
      setStep('input');
      setShiftPaymentsCash(0);
      setShiftPaymentsDigital(0);
      setShiftPaymentsTotal(0);
    }
  }

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const closingAmountNumber = parseFloat(String(closingAmount).replace(',', '.'));
    if (isNaN(closingAmountNumber) || closingAmountNumber < 0) {
      alert('Por favor, ingrese un monto de cierre válido.');
      return;
    }
    setStep('confirm');
  };

  const handleFinalConfirm = async () => {
    setIsProcessing(true);
    try {
        await onConfirmClose(parseFloat(String(closingAmount).replace(',', '.')));
        // The parent component will handle closing the modal and logging out.
    } catch(error) {
        console.error("Failed to close shift", error);
        alert(`Error al cerrar la caja: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        setIsProcessing(false); // Allow user to try again if closing fails
    }
  };
  
  return (
    <Modal isOpen={isOpen} onClose={isProcessing ? () => {} : onClose} title="Cerrar Caja">
      {step === 'input' && (
        <form onSubmit={handleProceedToConfirm} className="space-y-6">
          <div className="text-center">
              <h3 className="text-xl font-bold">Resumen del Turno</h3>
              <p className="text-gray-600">Confirme los montos y declare el efectivo final.</p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-lg">
                  <span className="font-medium">Monto de Apertura:</span>
                  <span className="font-bold">{formatCurrency(activeShift.Monto_Apertura)}</span>
              </div>
              {shiftPaymentsTotal > 0 && (
                <div className="border-t pt-2 space-y-1">
                  <div className="flex justify-between text-base text-teal-700">
                    <span className="font-medium">Cobros de deuda (este turno):</span>
                    <span className="font-bold">{formatCurrency(shiftPaymentsTotal)}</span>
                  </div>
                  {shiftPaymentsCash > 0 && (
                    <div className="flex justify-between text-sm text-gray-600 pl-2">
                      <span>Efectivo:</span>
                      <span>{formatCurrency(shiftPaymentsCash)}</span>
                    </div>
                  )}
                  {shiftPaymentsDigital > 0 && (
                    <div className="flex justify-between text-sm text-gray-600 pl-2">
                      <span>Digital:</span>
                      <span>{formatCurrency(shiftPaymentsDigital)}</span>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-500 text-center pt-2">
                  El total de ventas, gastos y el balance final se calcularán al confirmar el cierre.
              </p>
          </div>

          <div>
            <label htmlFor="closingAmount" className="block text-sm font-medium text-gray-700">Monto de Cierre (Efectivo Contado)</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                type="text"
                inputMode="decimal"
                id="closingAmount"
                value={closingAmount}
                onChange={(e) => setClosingAmount(e.target.value)}
                className="block w-full text-center text-2xl py-2 pl-7 pr-2 border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="0,00"
                required
                autoFocus
              />
            </div>
          </div>
          
          <div className="flex justify-end pt-4 space-x-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors">
              Cancelar
            </button>
            <button 
              type="submit" 
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 w-56">
                <span>Continuar a Confirmación</span>
                <Icon path="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" className="w-5 h-5" />
            </button>
          </div>
        </form>
      )}

      {step === 'confirm' && (
        <div className="space-y-6">
            <div className="text-center">
                <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-12 h-12 text-yellow-400 mx-auto" />
                <h3 className="mt-4 text-xl font-bold">¿Está seguro?</h3>
                <p className="text-gray-600 mt-2">
                    Va a cerrar el turno con un monto declarado de <span className="font-bold">{formatCurrency(parseFloat(String(closingAmount).replace(',', '.')))}</span>.
                </p>
                <p className="text-gray-600 font-semibold">Esta acción es irreversible.</p>
            </div>
             <div className="flex justify-end pt-4 space-x-3">
                <button 
                    type="button" 
                    onClick={() => setStep('input')} 
                    className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                    disabled={isProcessing}
                    >
                    Volver
                </button>
                <button 
                    type="button" 
                    onClick={handleFinalConfirm}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center justify-center space-x-2 w-56 disabled:bg-gray-400"
                    disabled={isProcessing}
                    >
                    {isProcessing ? (
                        <>
                            <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                            <span>Cerrando Turno...</span>
                        </>
                    ) : (
                        <>
                            <Icon path="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" className="w-5 h-5" />
                            <span>Sí, Cerrar y Salir</span>
                        </>
                    )}
                </button>
             </div>
        </div>
      )}
    </Modal>
  );
};