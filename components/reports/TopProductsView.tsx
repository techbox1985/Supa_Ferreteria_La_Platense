import React, { useState, useMemo } from 'react';
import { Sale, Product } from '../../types';
import { Icon } from '../ui/Icon';

interface TopProductsViewProps {
  processedSales: Sale[];
  products: Product[];
  isLoading: boolean;
}

interface TopProduct {
  rank: number;
  product: Product;
  netQuantitySold: number;
  totalRevenue: number;
}

export const TopProductsView: React.FC<TopProductsViewProps> = ({ processedSales, products, isLoading }) => {
  const toYYYYMMDD = (d: Date) => d.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return toYYYYMMDD(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    return toYYYYMMDD(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  });

  const topProducts = useMemo((): TopProduct[] => {
    if (isLoading || !processedSales.length || !products.length || !startDate || !endDate) {
      return [];
    }
    
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Mapas para acumular cantidad e ingresos
    const netQuantities = new Map<string, number>();
    const netRevenue = new Map<string, number>();

    // Filtrar ventas por rango de fecha
    const filteredSales = processedSales.filter(sale => {
      const saleDate = new Date(sale.date);
      return saleDate >= start && saleDate <= end;
    });

    // Calcular métricas netas (ventas - devoluciones)
    filteredSales.forEach(sale => {
      if (sale.status !== 'annulled') {
        // Sumar ventas
        sale.items.forEach(item => {
          const cod = item.product.cod;
          const qty = netQuantities.get(cod) || 0;
          const rev = netRevenue.get(cod) || 0;
          netQuantities.set(cod, qty + item.quantity);
          netRevenue.set(cod, rev + (item.quantity * item.price));
        });

        // Restar notas de crédito asociadas a esas ventas
        sale.creditNotes?.forEach(note => {
          note.items?.forEach(item => {
            const cod = item.product.cod;
            const qty = netQuantities.get(cod) || 0;
            const rev = netRevenue.get(cod) || 0;
            netQuantities.set(cod, qty - item.quantity);
            netRevenue.set(cod, rev - (item.quantity * item.price));
          });
        });
      }
    });

    const productsMap = new Map(products.map(p => [p.cod, p]));

    const rankedProducts = Array.from(netQuantities.entries())
      .map(([cod, quantity]) => ({
        product: productsMap.get(cod),
        netQuantitySold: quantity,
        totalRevenue: netRevenue.get(cod) || 0,
      }))
      .filter(item => item.product && item.netQuantitySold > 0)
      .sort((a, b) => b.netQuantitySold - a.netQuantitySold) // Ordenar por más vendidos en cantidad
      .slice(0, 30) // Top 30
      .map((item, index) => ({
        rank: index + 1,
        ...item,
      })) as TopProduct[];
      
    return rankedProducts;

  }, [processedSales, products, isLoading, startDate, endDate]);

  if (isLoading) {
    return (
        <div className="flex-grow flex items-center justify-center h-[calc(100vh-80px)]">
            <div className="text-center">
                <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-12 h-12 text-blue-500 animate-spin mx-auto"/>
                <p className="mt-2 text-gray-600">Procesando métricas...</p>
            </div>
        </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Top Productos</h1>
        <div className="text-sm text-gray-500 bg-white px-3 py-1 rounded-full border shadow-sm">
            {topProducts.length} productos con ventas en este período
        </div>
      </div>

      {/* Filtros de Fecha */}
      <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row md:items-end gap-4 mb-6">
          <div className="flex-grow">
              <label htmlFor="start-date-top-prod" className="block text-sm font-medium text-gray-700">Desde</label>
              <input 
                  type="date" 
                  id="start-date-top-prod"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
          </div>
          <div className="flex-grow">
              <label htmlFor="end-date-top-prod" className="block text-sm font-medium text-gray-700">Hasta</label>
              <input 
                  type="date" 
                  id="end-date-top-prod"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
          </div>
          <button 
            onClick={() => {
                const now = new Date();
                setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
                setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            Mes Actual
          </button>
      </div>
      
      <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          {topProducts.length === 0 ? (
             <div className="text-center py-16 text-gray-500">
                <Icon path="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">No se registraron ventas netas en el período seleccionado.</p>
                <p className="text-sm">Pruebe ajustando el rango de fechas arriba.</p>
             </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-16">#</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Producto</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Código</th>
                  <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Cant. Vendida (Neta)</th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Recaudación (Neta)</th>
                  <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Stock</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {topProducts.map(item => (
                  <tr key={item.product.cod} className="hover:bg-blue-50 transition-colors">
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                        item.rank === 1 ? 'bg-yellow-100 text-yellow-800 ring-2 ring-yellow-400' : 
                        item.rank === 2 ? 'bg-gray-100 text-gray-800 ring-2 ring-gray-400' :
                        item.rank === 3 ? 'bg-orange-100 text-orange-800 ring-2 ring-orange-400' :
                        'bg-white text-gray-600 border'
                      }`}>
                        {item.rank}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{item.product.Producto}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{item.product.cod}</td>
                    <td className="px-6 py-4 text-center">
                        <span className="text-base font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                            {item.netQuantitySold}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-right text-base font-bold text-green-700">
                        ${item.totalRevenue.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-6 py-4 text-center">
                        <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                            item.product.stockk <= item.product.Minimo ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                            {item.product.stockk}
                        </span>
                    </td>
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