
import React, { useState, useMemo } from 'react';
import { Sale, Product, Customer, User, Shift } from '../../types';
import { Icon } from '../ui/Icon';
import { SalesDashboard } from '../shared/SalesDashboard';


interface SalesHistoryViewProps {
    processedSales: Sale[];
    products: Product[];
    customers: Customer[];
    allUsers: User[];
    shifts: Shift[];
    isLoading: boolean;
    refreshData: () => void;
}

const SalesHistoryView: React.FC<SalesHistoryViewProps> = ({ processedSales, products, customers, allUsers, shifts, isLoading, refreshData }) => {
    // Helper para obtener YYYY-MM-DD en hora local
    const getLocalDateString = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        // Primer día del mes actual
        return getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
    });
    
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        // Último día del mes actual
        return getLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    });

    const [sellerFilter, setSellerFilter] = useState('All');
    
    const shiftUserMap = useMemo(() => {
        return new Map(shifts.map(shift => [shift.ID_Turno, shift.ID_Usuario]));
    }, [shifts]);

    const salesInDateRange = useMemo(() => {
        console.log('[HIST] Filtering sales. Total processedSales:', processedSales.length);
        console.log('[HIST] Date Range:', startDate, 'to', endDate);

        if (!startDate || !endDate || !processedSales.length) return [];
        
        // Parsear manualmente para asegurar hora local (YYYY, MM-1, DD)
        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
        const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
        
        const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
        const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

        console.log('[HIST] Parsed Range (Local):', start.toString(), ' - ', end.toString());

        const filtered = processedSales.filter(sale => {
            const saleDate = new Date(sale.date);
            // Comparación inclusiva
            const isInDateRange = saleDate >= start && saleDate <= end;
            
            if (!isInDateRange) return false;

            if (sellerFilter === 'All') {
                return true;
            }

            const saleUserId = shiftUserMap.get(sale.shiftId || '');
            return saleUserId === sellerFilter;
        });
        
        console.log('[HIST] Filtered count:', filtered.length);
        return filtered;
    }, [processedSales, startDate, endDate, sellerFilter, shiftUserMap]);


     if (isLoading) {
        return (
            <div className="flex-grow flex items-center justify-center h-[calc(100vh-80px)]">
                <div className="text-center">
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-12 h-12 text-blue-500 animate-spin mx-auto"/>
                    <p className="mt-2 text-gray-600">Cargando historial y estadísticas...</p>
                </div>
            </div>
        );
    }
    
    // Filtros y buscador reales integrados visualmente
    const [searchTerm, setSearchTerm] = useState('');
    const filtersAndSearch = (
        <div className="bg-white p-2 md:p-4 rounded-lg shadow-md flex flex-col md:flex-row md:items-end gap-2 md:gap-4 mt-2 md:mt-4">
            <div className="flex-grow">
                <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">Desde</label>
                <input 
                    type="date" 
                    id="start-date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div className="flex-grow">
                <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">Hasta</label>
                <input 
                    type="date" 
                    id="end-date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div className="flex-grow">
                <label htmlFor="seller-filter" className="block text-sm font-medium text-gray-700">Vendedor</label>
                <select 
                    id="seller-filter"
                    value={sellerFilter}
                    onChange={e => setSellerFilter(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="All">Todos los Vendedores</option>
                    {allUsers
                        .filter(u => u.Rol === 'Vendedor' || u.Rol === 'Admin')
                        .map(user => (
                            <option key={user.ID_Usuario} value={user.ID_Usuario}>{user.Nombre}</option>
                        ))
                    }
                </select>
            </div>
            {/* Buscador real */}
            <div className="flex-grow md:max-w-xs relative mt-4 md:mt-0">
                <label htmlFor="search-term" className="block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative mt-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        id="search-term"
                        type="text"
                        placeholder="Buscar cliente, ID, CUIT, factura..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                </div>
            </div>
        </div>
    );

    return (
        <div className="h-full p-2 space-y-3 md:space-y-4">
            <SalesDashboard
                title=""
                salesData={salesInDateRange}
                customers={customers}
                products={products}
                refreshData={refreshData}
                isLoading={isLoading}
                headerChildren={filtersAndSearch}
                noDataMessage="No se encontraron ventas para el período o filtro seleccionado."
                statTitlePrefix="en Período"
                showStats={true}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                stickyStats={true}
                stickyFilters={true}
            />
        </div>
    );
};

export default SalesHistoryView;
