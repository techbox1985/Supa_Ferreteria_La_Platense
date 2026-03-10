import React, { useState, useEffect, useMemo } from 'react';
import { Customer, AccountTransaction, Sale } from '../../types';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { generateCustomerStatementHtml, generateReceiptHtml } from '../pos/Receipt';
import { getPrintStyles } from '../../utils/printStyles';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { calculateCustomerBalance } from '../../services/api';

interface CustomerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  allSales: Sale[];
  isAdmin: boolean;
  refreshData: () => void;
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

const getTypeStyle = (type: AccountTransaction['type']) => {
    switch (type) {
        case 'Venta':
            return 'bg-red-100 text-red-800';
        case 'Pago':
            return 'bg-green-100 text-green-800';
        case 'Nota de Crédito':
            return 'bg-orange-100 text-orange-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

export const CustomerStatementModal: React.FC<CustomerStatementModalProps> = ({ isOpen, onClose, customer, allSales, isAdmin, refreshData }) => {
    // Guardar y normalizar el customer recibido
    const safeCustomer: Customer = {
        Id_Cliente: customer?.Id_Cliente || '',
        'Nombre y Apellido': customer?.['Nombre y Apellido'] || '',
        Whatsapp: customer?.Whatsapp || '',
        'Tipo.Documento': customer?.['Tipo.Documento'] || 'N/A',
        Documento: customer?.Documento || '',
        Condicion_IVA: customer?.Condicion_IVA || 'Consumidor Final',
        Deuda: Number(customer?.Deuda ?? 0),
        Pagos: Number(customer?.Pagos ?? 0),
        'Fecha Creacion': customer?.['Fecha Creacion'] || undefined
    };
    const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { addToast } = useToast();
    const [saleToAnnul, setSaleToAnnul] = useState<AccountTransaction | null>(null);
    const [isAnnuling, setIsAnnuling] = useState(false);

    useEffect(() => {
        if (isOpen && safeCustomer && safeCustomer.Id_Cliente) {
            const fetchStatement = async () => {
                setIsLoading(true);
                try {
                    const statement = await api.getCustomerStatement(safeCustomer.Id_Cliente);
                    if (!Array.isArray(statement)) {
                        setTransactions([]);
                    } else {
                        setTransactions(statement.filter(tx => tx && typeof tx === 'object'));
                    }
                } catch (error) {
                    console.error('Failed to fetch customer statement:', error);
                    setTransactions([]);
                    alert('No se pudo cargar el estado de cuenta.');
                } finally {
                    setIsLoading(false);
                }
            };
            fetchStatement();
        } else {
            setTransactions([]);
        }
    }, [isOpen, safeCustomer && safeCustomer.Id_Cliente]);
  
    // Usar el helper para calcular el resumen SOLO desde el ledger
    const summary = useMemo(() => {
        if (!Array.isArray(transactions) || transactions.length === 0) {
            return { totalDebit: 0, totalCredit: 0, finalBalance: 0 };
        }
            const { debt } = calculateCustomerBalance(transactions);
        const totalDebit = transactions.reduce((s, t) => s + Number(t.debit || 0), 0);
        const totalCredit = transactions.reduce((s, t) => s + Number(t.credit || 0), 0);
        return { totalDebit, totalCredit, finalBalance: debt };
    }, [transactions]);

    const handlePrint = () => {
        if (!Array.isArray(transactions) || transactions.length === 0) {
            alert("No hay transacciones para generar el resumen.");
            return;
        }
        const statementHtml = generateCustomerStatementHtml(customer, transactions);
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(statementHtml);
            printWindow.document.close();
            printWindow.focus();
        } else {
            alert("La ventana emergente fue bloqueada. Por favor, habilite las ventanas emergentes para este sitio.");
        }
    };

  const handleViewTicket = (saleId: string) => {
    const sale = allSales.find(s => s.id === saleId);
    if (sale) {
        const printStyles = getPrintStyles();
        const ticketHtml = generateReceiptHtml(sale, printStyles);
        const ticketWindow = window.open('', '_blank', 'width=350,height=650,scrollbars=yes,resizable=yes');
        if (ticketWindow) {
            ticketWindow.document.write(ticketHtml);
            ticketWindow.document.close();
        } else {
            alert("La ventana del ticket fue bloqueada. Por favor, habilite las ventanas emergentes.");
        }
    } else {
        alert('No se encontraron los detalles de la venta original para este movimiento.');
    }
  };
  
  const handleAnnulRequest = (tx: AccountTransaction) => {
    setSaleToAnnul(tx);
  };

  const handleConfirmAnnul = async () => {
    if (!saleToAnnul || !saleToAnnul.originalSaleId) return;

    setIsAnnuling(true);
    try {
        await api.annulSale(saleToAnnul.originalSaleId);
        addToast('Venta anulada con éxito. El stock ha sido revertido.', 'success');
        refreshData();
        onClose();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
        addToast(`Error al anular la venta: ${errorMessage}`, 'error');
    } finally {
        setIsAnnuling(false);
        setSaleToAnnul(null);
    }
  };


  return (
    <>
        <Modal isOpen={isOpen} onClose={onClose} title={`Estado de Cuenta - ${safeCustomer['Nombre y Apellido']}`} size="xl">
        <div className="space-y-4">
            <div className="flex justify-between items-start gap-4 flex-wrap">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-grow">
                    <div className="bg-red-50 p-3 rounded-lg text-center">
                        <p className="text-sm font-medium text-red-700">Total Debe</p>
                        <p className="text-xl font-bold text-red-600">{formatCurrency(summary.totalDebit)}</p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg text-center">
                        <p className="text-sm font-medium text-green-700">Total Haber</p>
                        <p className="text-xl font-bold text-green-600">{formatCurrency(summary.totalCredit)}</p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg text-center">
                        <p className="text-sm font-medium text-blue-700">Saldo Final</p>
                        <p className="text-xl font-bold text-blue-600">{formatCurrency(summary.finalBalance)}</p>
                    </div>
                </div>
                
                <div className="flex-shrink-0">
                    <button
                        onClick={handlePrint}
                        disabled={isLoading || transactions.length === 0}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        <Icon path="M6.75 7.5h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75-.75h-10.5a.75.75 0 01-.75-.75V8.25a.75.75 0 01.75-.75z" className="w-5 h-5"/>
                        <span>Imprimir Resumen</span>
                    </button>
                </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
                        {isLoading ? (
                            <div className="text-center p-8">
                                <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-8 h-8 text-blue-500 animate-spin mx-auto"/>
                                <p className="mt-2 text-gray-600">Cargando transacciones...</p>
                            </div>
                        ) : !Array.isArray(transactions) || transactions.length === 0 ? (
                            <p className="text-center text-gray-500 p-8">No hay transacciones para este cliente.</p>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Debe</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Haber</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Saldo</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {transactions.map((tx, idx) => {
                                        if (!tx || typeof tx !== 'object') return null;
                                        const safeDebit = Number(tx.debit ?? 0) || 0;
                                        const safeCredit = Number(tx.credit ?? 0) || 0;
                                        const safeBalance = Number(tx.balance ?? 0) || 0;
                                        let safeDate: string = 'Fecha Inválida';
                                        try {
                                            safeDate = tx.date ? new Date(tx.date).toLocaleString('es-AR') : 'Fecha Inválida';
                                        } catch {
                                            safeDate = 'Fecha Inválida';
                                        }
                                        return (
                                            <tr key={tx.id || idx}>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-center">
                                                    <div className="flex items-center justify-center space-x-2">
                                                        {tx.type === 'Venta' && tx.originalSaleId && (
                                                            <button
                                                                onClick={() => handleViewTicket(String(tx.originalSaleId || ''))}
                                                                className="text-indigo-600 hover:text-indigo-800"
                                                                title="Ver ticket de venta original"
                                                            >
                                                                <Icon path="M2.036 12.322a1.012 1.012 0 010-.639l4.418-5.523A1.012 1.012 0 017.5 6h9a1.012 1.012 0 01.946.689l4.418 5.523a1.012 1.012 0 010 .639l-4.418 5.523A1.012 1.012 0 0116.5 18h-9a1.012 1.012 0 01-.946-.689L2.036 12.322zM15 12a3 3 0 11-6 0 3 3 0 016 0z" className="w-5 h-5"/>
                                                            </button>
                                                        )}
                                                        {isAdmin && tx.type === 'Venta' && tx.originalSaleId && (
                                                            <button
                                                                onClick={() => handleAnnulRequest(tx)}
                                                                className="text-red-600 hover:text-red-800"
                                                                title="Anular esta venta"
                                                            >
                                                                <Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-5 h-5"/>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm">{safeDate}</td>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm">
                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeStyle(tx.type)}`}>
                                                        {tx.type ? String(tx.type).replace('_', ' ') : ''}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{tx.description || ''}</td>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-red-600">{safeDebit > 0 ? formatCurrency(safeDebit) : '-'}</td>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-green-600">{safeCredit > 0 ? formatCurrency(safeCredit) : '-'}</td>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-medium">{formatCurrency(safeBalance)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
            </div>
        </div>
        </Modal>
        <ConfirmationModal
            isOpen={!!saleToAnnul}
            onClose={() => setSaleToAnnul(null)}
            onConfirm={handleConfirmAnnul}
            title="Anular Venta"
            message={`¿Está seguro de que desea anular la venta ${saleToAnnul?.originalSaleId?.slice(0, 8)}? Esta acción es irreversible, revertirá el stock y ajustará la cuenta corriente.`}
            confirmText="Sí, Anular Venta"
            isProcessing={isAnnuling}
        />
    </>
  );
};
