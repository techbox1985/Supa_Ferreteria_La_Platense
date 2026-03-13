// ...
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Customer, Product } from '../../types';
import { Icon } from '../ui/Icon';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerStatementModal } from './CustomerStatementModal';
import * as api from '../../services/api';
import { StatCard } from '../dashboard/StatCard';
import { useToast } from '../../contexts/ToastContext';

const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const CustomerRow: React.FC<{ 
  customer: Customer; 
  onEdit: (customer: Customer) => void;
  onViewStatement: (customer: Customer) => void;
}> = React.memo(({ customer, onEdit, onViewStatement }) => {
  const debtColor = customer.Deuda > 0 ? 'text-red-600' : 'text-green-600';
  const isConsumidorFinal = customer['Nombre y Apellido']?.toLowerCase() === 'consumidor final' || customer.Id_Cliente === '0';

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-2 py-3 whitespace-nowrap text-left text-sm font-medium space-x-1 min-w-[70px] max-w-[80px]">
        {!isConsumidorFinal && (
          <>
            <button onClick={() => onViewStatement(customer)} className="text-green-600 hover:text-green-800" title="Cuenta Corriente">
              <Icon path="M3 6h18M3 12h18M3 18h18" />
            </button>
            <button onClick={() => onEdit(customer)} className="text-blue-600 hover:text-blue-800" title="Editar Cliente">
              <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </button>
          </>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 min-w-[160px] max-w-[260px]">{customer['Nombre y Apellido']}</td>
      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500 min-w-[110px] max-w-[150px]">{customer.Whatsapp || '-'}</td>
      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500 min-w-[90px] max-w-[120px]">{customer.Condicion_IVA || 'N/A'}</td>
      <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 min-w-[70px] max-w-[90px]">{customer['Tipo.Documento'] || '-'}</td>
      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500 min-w-[100px] max-w-[130px]">{customer.Documento || '-'}</td>
      <td className={`px-2 py-3 whitespace-nowrap text-sm font-semibold ${debtColor} min-w-[80px] max-w-[90px]`}>${customer.Deuda.toLocaleString('es-AR')}</td>
      <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 min-w-[80px] max-w-[90px]">${customer.Pagos.toLocaleString('es-AR')}</td>
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

export const CustomersView: React.FC<CustomersViewProps> = ({ products, customers, refreshData, isLoading, onViewStatement }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setFormOpen] = useState(false);
    const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
    const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
    const { addToast } = useToast();

    // Usar los customers enriquecidos que vienen por props
    const realCustomers = useMemo(() => {
      return (customers || []).filter(c => c['Nombre y Apellido']?.toLowerCase() !== 'consumidor final');
    }, [customers]);

    // Stats SOLO desde los props enriquecidos (ledger)
    const stats = useMemo(() => {
      const totalDebt = realCustomers.reduce((sum, c) => sum + (c.Deuda || 0), 0);
      const customersWithDebt = realCustomers.filter(c => (c.Deuda || 0) > 0).length;
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

    const handleViewStatement = useCallback((customer: Customer) => {
      // Normalizar y proteger el objeto customer antes de abrir el modal
      if (!customer || typeof customer !== 'object') return;
      // Asegurar que los campos mínimos existen
      const safeCustomer: Customer = {
        Id_Cliente: customer.Id_Cliente || customer.id || '',
        'Nombre y Apellido': customer['Nombre y Apellido'] || customer.name || '',
        Whatsapp: customer.Whatsapp || customer.whatsapp || '',
        'Tipo.Documento': customer['Tipo.Documento'] || customer.document_type || '',
        Documento: customer.Documento || customer.document_number || '',
        Condicion_IVA: customer.Condicion_IVA || customer.iva_condition || 'Consumidor Final',
        Deuda: Number(customer.Deuda ?? 0),
        Pagos: Number(customer.Pagos ?? 0),
        'Fecha Creacion': customer['Fecha Creacion'] || customer.created_at || undefined
      };
      setStatementCustomer(safeCustomer);
    }, []);

    // El guardado de clientes sigue usando la API, pero refresca usando refreshData de props
    const handleSaveCustomer = useCallback(async (customerData: Omit<Customer, 'Id_Cliente'> | Customer) => {
        try {
            if ('Id_Cliente' in customerData && customerData.Id_Cliente) {
                await api.updateCustomerSupabase(customerData);
            } else {
                await api.addCustomerSupabase(customerData);
            }
            await refreshData();
            setFormOpen(false);
            addToast('Cliente guardado con éxito en Supabase.', 'success');
        } catch (error) {
            console.error('Failed to save customer to Supabase:', error);
            addToast(`Error al guardar el cliente: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'error');
            throw error; 
        }
    }, [refreshData, addToast]);
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">Gestión de Clientes (Supabase)</h1>
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
              <div className="p-10 text-center text-gray-500">Cargando clientes de Supabase...</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th scope="col" className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[70px] max-w-[80px]">Acciones</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[160px] max-w-[260px]">Nombre y Apellido</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[110px] max-w-[150px]">WhatsApp</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[90px] max-w-[120px]">Condición IVA</th>
                    <th scope="col" className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[70px] max-w-[90px]">Tipo Doc.</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] max-w-[130px]">Documento</th>
                    <th scope="col" className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] max-w-[90px]">Deuda</th>
                    <th scope="col" className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] max-w-[90px]">Pagos</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCustomers.map(customer => (
                      <CustomerRow 
                          key={customer.Id_Cliente}
                          customer={customer}
                          onEdit={handleEdit}
                          onViewStatement={handleViewStatement}
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
              customers={localCustomers}
              customerToEdit={customerToEdit}
          />
        )}

        {statementCustomer && (
          <CustomerStatementModal
            isOpen={!!statementCustomer}
            onClose={() => setStatementCustomer(null)}
            customer={statementCustomer}
            allSales={[]}
            isAdmin={true}
            refreshData={refreshData}
          />
        )}
      </div>
    );
  };

export default CustomersView;
