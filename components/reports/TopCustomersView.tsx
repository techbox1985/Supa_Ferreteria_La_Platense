import React, { useState, useMemo } from 'react';
import { Sale, Customer } from '../../types';
import { Icon } from '../ui/Icon';

interface TopCustomersViewProps {
  processedSales: Sale[];
  customers: Customer[];
  isLoading: boolean;
}

interface TopCustomer {
  rank: number;
  customer: Customer;
  totalPurchased: number;
  totalCash: number;
  totalDigital: number;
  cashSavings: number;
}

const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const TopCustomersView: React.FC<TopCustomersViewProps> = ({ processedSales, customers, isLoading }) => {
    const toYYYYMMDD = (d: Date) => d.toISOString().split('T')[0];
    
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        return toYYYYMMDD(new Date(now.getFullYear(), now.getMonth(), 1));
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        return toYYYYMMDD(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    });

    const topCustomers = useMemo((): TopCustomer[] => {
        if (isLoading || !processedSales.length || !customers.length || !startDate || !endDate) {
            return [];
        }

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const salesInDateRange = processedSales.filter(sale => {
            const saleDate = new Date(sale.date);
            return saleDate >= start && saleDate <= end && sale.status !== 'annulled';
        });

        const customerTotals = new Map<string, { totalPurchased: number; totalCash: number; totalDigital: number; cashSavings: number }>();

        salesInDateRange.forEach(sale => {
            if (!sale.customer || sale.customer.Id_Cliente === '0') return; // Skip 'Consumidor Final'

            const customerId = sale.customer.Id_Cliente;
            const current = customerTotals.get(customerId) || { totalPurchased: 0, totalCash: 0, totalDigital: 0, cashSavings: 0 };

            current.totalPurchased += sale.total;
            current.totalCash += sale.payment.cash;
            // FIX: Sum the amounts from the `echeqs` array instead of using the non-existent `echeq` property.
            current.totalDigital += sale.payment.digital + (sale.payment.echeqs?.reduce((eSum, e) => eSum + e.amount, 0) || 0); // Summing digital methods
            
            // Calculate cash savings: if there's a discount (negative adjustment) and a cash payment was made
            if (sale.adjustmentAmount && sale.adjustmentAmount < 0 && sale.payment.cash > 0) {
                current.cashSavings += Math.abs(sale.adjustmentAmount);
            }
            
            customerTotals.set(customerId, current);
        });

        const customersMap = new Map(customers.map(c => [c.Id_Cliente, c]));

        const rankedCustomers = Array.from(customerTotals.entries())
            .map(([id, totals]) => ({
                customer: customersMap.get(id),
                ...totals,
            }))
            .filter((item): item is { customer: Customer, totalPurchased: number, totalCash: number, totalDigital: number, cashSavings: number } => 
                !!item.customer && (item.totalCash > 0 || item.totalDigital > 0)
            )
            .sort((a, b) => b.totalPurchased - a.totalPurchased)
            .slice(0, 10)
            .map((item, index) => ({
                rank: index + 1,
                ...item,
            }));

        return rankedCustomers;

    }, [processedSales, customers, isLoading, startDate, endDate]);

    if (isLoading) {
        return (
            <div className="flex-grow flex items-center justify-center h-[calc(100vh-80px)]">
                <div className="text-center">
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-12 h-12 text-blue-500 animate-spin mx-auto"/>
                    <p className="mt-2 text-gray-600">Calculando reporte...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Top Clientes</h1>

            <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row md:items-end gap-4 mb-6">
                <div className="flex-grow">
                    <label htmlFor="start-date-top-cust" className="block text-sm font-medium text-gray-700">Desde</label>
                    <input 
                        type="date" 
                        id="start-date-top-cust"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div className="flex-grow">
                    <label htmlFor="end-date-top-cust" className="block text-sm font-medium text-gray-700">Hasta</label>
                    <input 
                        type="date" 
                        id="end-date-top-cust"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
            </div>
            
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    {topCustomers.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">
                            <p>No hay suficientes datos de ventas para generar este reporte en el período seleccionado.</p>
                        </div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">#</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Comprado</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Pago Efectivo</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Pago Digital</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ahorro en Efectivo (Est.)</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {topCustomers.map(item => (
                                <tr key={item.customer.Id_Cliente} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-center">
                                        <span className="text-lg font-bold text-gray-700">{item.rank}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.customer['Nombre y Apellido']}</td>
                                    <td className="px-6 py-4 text-right text-lg font-bold text-blue-600">{formatCurrency(item.totalPurchased)}</td>
                                    <td className="px-6 py-4 text-right text-sm">{formatCurrency(item.totalCash)}</td>
                                    <td className="px-6 py-4 text-right text-sm">{formatCurrency(item.totalDigital)}</td>
                                    <td className="px-6 py-4 text-right text-sm font-semibold text-green-600">{formatCurrency(item.cashSavings)}</td>
                                </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
