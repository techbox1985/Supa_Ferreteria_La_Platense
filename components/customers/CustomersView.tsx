
import React, { useState, useMemo, ReactNode, useCallback, useContext } from 'react';
import { Customer, Product, CartItem, AccountTransaction } from '../../types';
import { Icon } from '../ui/Icon';
import { CustomerFormModal } from './CustomerFormModal';
import { PaymentModal } from './PaymentModal';
import { CreditNoteModal } from './CreditNoteModal'; 
import * as api from '../../services/api';
import { StatCard } from '../dashboard/StatCard';
import { useToast } from '../../contexts/ToastContext';
import { AuthContext } from '../../contexts/AuthContext';
import { ConfirmationModal } from '../ui/ConfirmationModal';

const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const CustomerRow: React.FC<{ 
    customer: Customer; 
    onEdit: (customer: Customer) => void;
    onAddPayment: (customer: Customer) => void;
    onViewStatement: (customer: Customer) => void;
    onAddCreditNote: (customer: Customer) => void;
    onClearBalance: (customer: Customer) => void;
}> = React.memo(({ customer, onEdit, onAddPayment, onViewStatement, onAddCreditNote, onClearBalance }) => {
    const debtColor = customer.Deuda > 0 ? 'text-red-600' : 'text-green-600';
    const isConsumidorFinal = customer.Id_Cliente === '0';
    const hasCreditBalance = customer.Deuda < 0;

    return (
        <tr className="hover:bg-gray-50 transition-colors">
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{customer['Nombre y Apellido']}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.Whatsapp || '-'}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.Condicion_IVA || 'N/A'}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer['Tipo.Documento'] || '-'}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.Documento || '-'}</td>
            <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${debtColor}`}>${customer.Deuda.toLocaleString('es-AR')}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${customer.Pagos.toLocaleString('es-AR')}</td>
            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                {!isConsumidorFinal && (
                    <>
                        <button onClick={() => onViewStatement(customer)} className="text-indigo-600 hover:text-indigo-800" title="Ver Estado de Cuenta">
                            <Icon path="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6.75A2.25 2.25 0 014.5 4.5h15A2.25 2.25 0 0121.75 6.75v3.026"/>
                        </button>
                        {hasCreditBalance && (
                            <button onClick={() => onClearBalance(customer)} className="text-purple-600 hover:text-purple-800" title="Limpiar Saldo a Favor">
                                <Icon path="M12 9.75L16.25 15m-4.25-5.25L7.75 15m4.25-5.25V21m-6-10.5h12m1.5 0H21m-16.5 0H3" />
                            </button>
                        )}
                        <button onClick={() => onAddPayment(customer)} className="text-green-600 hover:text-green-800" title="Registrar Pago">
                            <Icon path="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.826-2.997.11-2.003 1.189z"/>
                        </button>
                         <button onClick={() => onAddCreditNote(customer)} className="text-orange-600 hover:text-orange-800" title="Generar Nota de Crédito">
                            <Icon path="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                         </button>
                        <button onClick={() => onEdit(customer)} className="text-blue-600 hover:text-blue-800" title="Editar Cliente">
                            <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </button>
                    </>
                )}
            </td>
        </tr>
    );
});
CustomerRow.displayName = 'CustomerRow';


interface CustomersViewProps {
  products: Product[];
  customers: Customer[];
  refreshData: () => void;
  isLoading: boolean;
  onViewStatement: (customer: Customer) => void;
}

const manualCreditNoteInitialItems: CartItem[] = [];
const manualCreditNoteSales: AccountTransaction[] = [];

export const CustomersView: React.FC<CustomersViewProps> = ({ products, customers, refreshData, isLoading, onViewStatement }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setFormOpen] = useState(false);
  const [isPaymentOpen, setPaymentOpen] = useState(false);
  const [isCreditNoteOpen, setCreditNoteOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [customerForPayment, setCustomerForPayment] = useState<Customer | null>(null);
  const [customerForCreditNote, setCustomerForCreditNote] = useState<Customer | null>(null);
  const [customerToClear, setCustomerToClear] = useState<Customer | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const { addToast } = useToast();
  const { activeShift } = useContext(AuthContext);

  const realCustomers = useMemo(() => {
    return customers.filter(c => c['Nombre y Apellido']?.toLowerCase() !== 'consumidor final');
  }, [customers]);

  const stats = useMemo(() => {
    const totalDebt = realCustomers.reduce((sum, c) => sum + c.Deuda, 0);
    const customersWithDebt = realCustomers.filter(c => c.Deuda > 0).length;
    return { totalDebt, customersWithDebt, totalCustomers: realCustomers.length };
  }, [realCustomers]);

  const filteredCustomers = useMemo(() => {
    return realCustomers.filter(c => 
      (c['Nombre y Apellido'] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.Documento || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.Whatsapp || '').toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a,b) => a['Nombre y Apellido'].localeCompare(b['Nombre y Apellido']));
  }, [realCustomers, searchTerm]);

  const handleAddNew = useCallback(() => {
    setCustomerToEdit(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((customer: Customer) => {
    setCustomerToEdit(customer);
    setFormOpen(true);
  }, []);
  
  const handleAddPayment = useCallback((customer: Customer) => {
    setCustomerForPayment(customer);
    setPaymentOpen(true);
  }, []);
  
  const handleAddCreditNote = useCallback((customer: Customer) => {
      setCustomerForCreditNote(customer);
      setCreditNoteOpen(true);
  }, []);

  const handleClearBalanceRequest = useCallback((customer: Customer) => {
    setCustomerToClear(customer);
  }, []);

  const handleConfirmClearBalance = useCallback(async () => {
    if (!customerToClear || !activeShift) return;
    setIsClearing(true);
    try {
        const amountToAdjust = customerToClear.Deuda; 
        await api.recordPayment(
            customerToClear.Id_Cliente, 
            amountToAdjust, 
            "Ajuste automático para limpiar saldo a favor", 
            "Digital", 
            activeShift.ID_Turno
        );
        addToast(`Saldo de ${customerToClear['Nombre y Apellido']} limpiado con éxito.`, 'success');
        refreshData();
    } catch (error) {
        console.error("Error clearing balance:", error);
        addToast("No se pudo limpiar el saldo.", 'error');
    } finally {
        setIsClearing(false);
        setCustomerToClear(null);
    }
  }, [customerToClear, activeShift, refreshData, addToast]);

  const handleSaveCustomer = useCallback(async (customerData: Omit<Customer, 'Id_Cliente'> | Customer) => {
      try {
          if ('Id_Cliente' in customerData) {
              await api.updateCustomer(customerData);
          } else {
              await api.addCustomer(customerData);
          }
          refreshData();
          setFormOpen(false);
          addToast('Cliente guardado con éxito.', 'success');
      } catch (error) {
          console.error('Failed to save customer:', error);
          addToast(`Error al guardar el cliente: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'error');
          throw error; 
      }
  }, [refreshData, addToast]);
  
  const handleSavePayment = useCallback(async (paymentData: {amount: number; description: string; paymentMethod: 'Efectivo' | 'Digital'; shiftId: string}) => {
    if(!customerForPayment) return;
    if(!activeShift) {
        addToast("Error: No hay un turno activo para registrar el pago.", 'error');
        throw new Error("No active shift");
    }
    try {
        await api.recordPayment(customerForPayment.Id_Cliente, paymentData.amount, paymentData.description, paymentData.paymentMethod, activeShift.ID_Turno);
        refreshData();
        setPaymentOpen(false);
        addToast("Pago registrado con éxito.", 'success');
    } catch(error) {
        console.error("Failed to record payment:", error);
        addToast(`Error al registrar el pago: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'error');
        throw error; 
    }
  }, [customerForPayment, refreshData, addToast, activeShift]);
  
  const handleSaveCreditNote = useCallback(async (data: { items: CartItem[], description: string, total: number }) => {
    if (!customerForCreditNote) throw new Error("Cliente no seleccionado para la nota de crédito.");
    if(!activeShift) {
        addToast("Error: No hay un turno activo para crear la nota de crédito.", 'error');
        throw new Error("No active shift");
    }

    try {
        await api.createCreditNote({
            customerId: customerForCreditNote.Id_Cliente,
            originalSaleId: `manual-credit-${crypto.randomUUID().slice(0, 8)}`, 
            shiftId: activeShift.ID_Turno,
            ...data
        });
        addToast('Nota de crédito manual creada con éxito.', 'success');
        refreshData(); 
        setCreditNoteOpen(false);
    } catch(error) {
        throw new Error(`No se pudo procesar la nota de crédito. ${error instanceof Error ? error.message : ''}`, { cause: error });
    }
  }, [customerForCreditNote, refreshData, addToast, activeShift]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Gestión de Clientes</h1>
        <button onClick={handleAddNew} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2">
            <Icon path="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" className="w-5 h-5"/>
            <span>Nuevo Cliente</span>
        </button>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard 
                title="Deuda Total" 
                value={formatCurrency(stats.totalDebt)} 
                iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75m-15.75 0v-2.25a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121.75 16.5v2.25"
                iconBgColor="bg-red-500"
            />
            <StatCard 
                title="Clientes con Deuda" 
                value={stats.customersWithDebt.toLocaleString('es-AR')} 
                iconPath="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.231 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.67c.12-.24.232-.487.335-.737m-3.05-2.828c.328.316.63.645.913.985"
                iconBgColor="bg-orange-500"
            />
            <StatCard 
                title="Total de Clientes" 
                value={stats.totalCustomers.toLocaleString('es-AR')} 
                iconPath="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.512 2.72a9.094 9.094 0 013.741-.479 3 3 0 01-4.682-2.72M13.5 3A3.375 3.375 0 0010.125 6.375v3.75c0 .621.504 1.125 1.125 1.125h.375m0 0c-.375.621.504 1.125 1.125 1.125h.375m0 0c.621-.504 1.125-1.125 1.125-1.125v-3.75A3.375 3.375 0 0013.5 3z"
                iconBgColor="bg-blue-500"
            />
       </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="p-4 border-b">
          <input
            type="text"
            placeholder="Buscar por nombre, documento o WhatsApp..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-lg pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="overflow-x-auto max-h-[60vh]">
          {isLoading ? (
            <div className="p-10 text-center text-gray-500">Cargando clientes...</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre y Apellido</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WhatsApp</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Condición IVA</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo Doc.</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deuda</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pagos</th>
                  <th scope="col" className="relative px-6 py-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCustomers.map(customer => (
                    <CustomerRow 
                        key={customer.Id_Cliente}
                        customer={customer}
                        onEdit={handleEdit}
                        onAddPayment={handleAddPayment}
                        onViewStatement={onViewStatement}
                        onAddCreditNote={handleAddCreditNote}
                        onClearBalance={handleClearBalanceRequest}
                    />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      {isFormOpen && (
        <CustomerFormModal
            isOpen={isFormOpen}
            onClose={() => setFormOpen(false)}
            onSave={handleSaveCustomer}
            customers={customers}
            customerToEdit={customerToEdit}
        />
      )}
      
      {isPaymentOpen && customerForPayment && (
        <PaymentModal
            isOpen={isPaymentOpen}
            onClose={() => setPaymentOpen(false)}
            customer={customerForPayment}
            onSave={handleSavePayment}
        />
      )}

      {isCreditNoteOpen && customerForCreditNote && (
          <CreditNoteModal
            isOpen={isCreditNoteOpen}
            onClose={() => setCreditNoteOpen(false)}
            customer={customerForCreditNote}
            products={products}
            onSave={handleSaveCreditNote}
            initialItems={manualCreditNoteInitialItems}
            allCreditNotesForSale={manualCreditNoteSales}
          />
      )}

      {customerToClear && (
          <ConfirmationModal
            isOpen={!!customerToClear}
            onClose={() => setCustomerToClear(null)}
            onConfirm={handleConfirmClearBalance}
            title="Limpiar Saldo a Favor"
            message={`¿Está seguro que desea limpiar el saldo a favor de ${customerToClear['Nombre y Apellido']}? Se registrará un movimiento de $${Math.abs(customerToClear.Deuda).toLocaleString('es-AR')} para dejar la cuenta en $0.`}
            confirmText="Sí, Limpiar"
            isProcessing={isClearing}
          />
      )}

    </div>
  );
};
