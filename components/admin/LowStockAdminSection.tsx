
import React, { useState, useMemo } from 'react';
import { Product, Supplier } from '../../types';
import { Icon } from '../ui/Icon';
import { StatCard } from '../dashboard/StatCard';
import { Modal } from '../ui/Modal';

interface LowStockAdminSectionProps {
  products: Product[];
  suppliers: Supplier[];
}

export const LowStockAdminSection: React.FC<LowStockAdminSectionProps> = ({ products }) => {
  const [providerFilter, setProviderFilter] = useState('All');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Filtrar productos que están bajo stock o sin stock
  const allLowStockProducts = useMemo(() => {
    return products.filter(p => {
      const stock = p.stockk ?? 0;
      const min = p.Minimo ?? 0;
      return p.Activo && (stock <= min || stock <= 0);
    });
  }, [products]);

  // Aplicar filtro de proveedor
  const filteredLowStock = useMemo(() => {
    const filtered = providerFilter === 'All'
      ? allLowStockProducts
      : allLowStockProducts.filter(p => p.Proveedor === providerFilter);

    return [...filtered].sort((a, b) => {
      const aStock = a.stockk ?? 0;
      const bStock = b.stockk ?? 0;

      if (aStock !== bStock) {
        return aStock - bStock;
      }

      return String(a.Producto || '').localeCompare(String(b.Producto || ''));
    });
  }, [allLowStockProducts, providerFilter]);

  const activeProviders = useMemo(() => {
    const providerNames = new Set(allLowStockProducts.map(p => p.Proveedor).filter(Boolean));
    return ['All', ...Array.from(providerNames).sort()];
  }, [allLowStockProducts]);

  const downloadExcel = (onlyFiltered: boolean) => {
    const dataToExport = onlyFiltered ? filteredLowStock : allLowStockProducts;
    
    if (dataToExport.length === 0) {
      alert("No hay productos para exportar.");
      return;
    }

    // Generar CSV (Excel compatible)
    const headers = ['Producto', 'Código', 'Proveedor', 'Stock Actual', 'Mínimo', 'Estado'];
    const rows = dataToExport.map(p => {
      const stock = p.stockk ?? 0;
      return [
        p.Producto,
        p.cod,
        p.Proveedor || 'Sin proveedor',
        stock,
        p.Minimo ?? 0,
        stock <= 0 ? 'SIN STOCK' : 'BAJO STOCK'
      ];
    });

    const csvContent = [
      headers.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bajo_Stock_${onlyFiltered ? providerFilter : 'Total'}_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportModalOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-6 h-6 text-orange-500" />
            Productos bajo stock / sin stock
          </h2>
          <p className="text-sm text-gray-500 mt-1">Control operativo de mercadería crítica</p>
        </div>

        <div className="flex items-center gap-3">
          <select 
            value={providerFilter} 
            onChange={(e) => setProviderFilter(e.target.value)}
            className="border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="All">Todos los proveedores</option>
            {activeProviders.filter(p => p !== 'All').map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          
          <button 
            onClick={() => setIsExportModalOpen(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center space-x-2 text-sm shadow-sm"
          >
            <Icon path="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-4 h-4" />
            <span>Descargar Excel</span>
          </button>
        </div>
      </div>

      <div className="max-w-xs">
        <StatCard 
          title={`Bajos de Stock ${providerFilter !== 'All' ? `(${providerFilter})` : ''}`}
          value={filteredLowStock.length.toString()}
          iconPath="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
          iconBgColor="bg-orange-500"
          description="Productos que requieren reposición inmediata"
        />
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Stock mínimo</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Stock actual</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLowStock.length > 0 ? filteredLowStock.map((p) => {
                const stock = p.stockk ?? 0;
                const min = p.Minimo ?? 0;

                return (
                  <tr key={p.cod} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.Producto}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{p.Proveedor || 'Sin proveedor'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{min}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-bold ${stock <= 0 ? 'text-red-600' : 'text-orange-600'}`}>{stock}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-gray-500">
                    No hay productos críticos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title="Exportar a Excel" size="sm">
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">¿Querés descargar el Excel del proveedor seleccionado o de todos los productos bajo stock?</p>
          <div className="flex flex-col gap-2">
            {providerFilter !== 'All' && (
              <button 
                onClick={() => downloadExcel(true)}
                className="w-full bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                Solo de &quot;{providerFilter}&quot;
              </button>
            )}
            <button 
              onClick={() => downloadExcel(false)}
              className="w-full bg-gray-200 text-gray-800 py-2 rounded-md font-medium hover:bg-gray-300"
            >
              Todos los productos bajo stock
            </button>
            <button 
              onClick={() => setIsExportModalOpen(false)}
              className="w-full text-gray-500 text-sm hover:underline py-1"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
