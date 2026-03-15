import React, { useMemo } from 'react';
import { Product } from '../../types';
import { Icon } from '../ui/Icon';

interface LowStockViewProps {
    products: Product[];
    isLoading: boolean;
}

export const LowStockView: React.FC<LowStockViewProps> = ({ products, isLoading }) => {
    
    const lowStockProducts = useMemo(() => {
        return products
                        .filter(p => {
                            const minimo = p.Minimo ?? 0;
                            const stock = p.stockk ?? 0;
                            return p.Activo && minimo > 0 && stock < minimo;
                        })
                        .sort((a, b) => {
                            const aStock = a.stockk ?? 0;
                            const aMin = a.Minimo ?? 1;
                            const bStock = b.stockk ?? 0;
                            const bMin = b.Minimo ?? 1;
                            return (aStock / aMin) - (bStock / bMin);
                        }); // Sort by urgency (percentage of stock left)
    }, [products]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-80px)]">
                <div className="text-center">
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-12 h-12 text-blue-500 animate-spin mx-auto"/>
                    <p className="mt-2 text-gray-600">Cargando productos...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-r-lg">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="h-5 w-5 text-orange-400"/>
                    </div>
                    <div className="ml-3">
                        <h3 className="text-lg font-bold text-orange-800">B.stock</h3>
                        <div className="mt-2 text-sm text-orange-700">
                            <p>Esta es una lista de productos cuyo stock actual es inferior al mínimo configurado. Úsela para planificar sus próximos pedidos.</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[calc(100vh-250px)]">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Actual</th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Mínimo</th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Faltante para Mínimo</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {lowStockProducts.length > 0 ? lowStockProducts.map(product => {
                                const minimo = product.Minimo ?? 0;
                                const stock = product.stockk ?? 0;
                                const needed = minimo - stock;
                                return (
                                <tr key={product.cod} className="hover:bg-orange-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{product.Producto}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{product.cod}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-red-600">{product.stockk}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{product.Minimo}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-blue-600">{needed}</td>
                                </tr>
                                )})
                             : (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-gray-500">
                                        <div className="flex flex-col items-center">
                                            <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-12 h-12 text-green-400 mb-2"/>
                                            <p className="font-semibold">¡Excelente!</p>
                                            <p>No hay productos por debajo del stock mínimo.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
