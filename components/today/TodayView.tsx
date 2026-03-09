
import React, { useMemo, useState, useContext } from 'react';
import { Sale, Product, Customer, Expense, AccountTransaction, User, Shift } from '../../types';
import { Icon } from '../ui/Icon';
import { SalesDashboard } from '../shared/SalesDashboard';
import { StatCard } from '../dashboard/StatCard';
import { StatDetailModal } from '../dashboard/StatDetailModal';
import { AuthContext } from '../../contexts/AuthContext';

const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface TodayViewProps {
    processedSales: Sale[];
    products: Product[];
    customers: Customer[];
    expenses: Expense[];
    transactions: AccountTransaction[];
    allUsers: User[];
    shifts: Shift[];
    isLoading: boolean;
    refreshData: () => void;
}

export const TodayView: React.FC<TodayViewProps> = ({ processedSales, products, customers, expenses, transactions, allUsers, shifts, isLoading, refreshData }) => {
    
    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; title: string; columns: any[]; data: any[]; summary?: React.ReactNode; }>({ isOpen: false, title: '', columns: [], data: [] });
    const { currentUser, activeShift } = useContext(AuthContext);
    const [sellerFilter, setSellerFilter] = useState('All');
    
    const shiftUserMap = useMemo(() => {
        return new Map(shifts.map(shift => [shift.ID_Turno, shift.ID_Usuario]));
    }, [shifts]);

    const todayData = useMemo(() => {
        if (isLoading) return { salesForToday: [], expensesForToday: [], collectionsForToday: [] };
        
        const now = new Date();
        const tDay = now.getDate();
        const tMonth = now.getMonth();
        const tYear = now.getFullYear();

        const isSellerView = currentUser?.Rol === 'Vendedor' && activeShift;
        const isAdminView = currentUser?.Rol === 'Admin';

        const filterByRoleAndSeller = (item: { shiftId?: string }) => {
            if (isSellerView) {
                return item.shiftId === activeShift.ID_Turno;
            }
            if (isAdminView) {
                if (sellerFilter === 'All') return true;
                const itemUserId = shiftUserMap.get(item.shiftId || '');
                return itemUserId === sellerFilter;
            }
            return false;
        };

        const isSameDay = (d: Date) => d.getDate() === tDay && d.getMonth() === tMonth && d.getFullYear() === tYear;

        const salesForToday = processedSales.filter(sale => isSameDay(new Date(sale.date)) && filterByRoleAndSeller(sale));
        const expensesForToday = expenses.filter(expense => isSameDay(new Date(expense.Fecha)) && filterByRoleAndSeller(expense));
        const collectionsForToday = transactions.filter(tx => isSameDay(new Date(tx.date)) && tx.type === 'Pago' && filterByRoleAndSeller(tx));

        return { salesForToday, expensesForToday, collectionsForToday };
    }, [processedSales, expenses, transactions, currentUser, activeShift, sellerFilter, shiftUserMap, isLoading]);

    const stats = useMemo(() => {
        const { salesForToday, expensesForToday, collectionsForToday } = todayData;
        const activeSales = salesForToday.filter(s => s.status !== 'annulled');

        const incomeFromSalesCash = activeSales.reduce((sum, s) => sum + s.payment.cash, 0);
        const incomeFromSalesDigital = activeSales.reduce((sum, s) => sum + s.payment.digital + (s.payment.echeqs?.reduce((eSum, e) => eSum + e.amount, 0) || 0), 0);
        const totalCreditSales = activeSales.reduce((sum, s) => sum + s.payment.credit, 0);
        const totalSold = incomeFromSalesCash + incomeFromSalesDigital + totalCreditSales;
        
        const collectionsCash = collectionsForToday
            .filter(tx => tx.description.toLowerCase().includes('efectivo'))
            .reduce((sum, tx) => sum + tx.credit, 0);
        const collectionsDigital = collectionsForToday
            .filter(tx => !tx.description.toLowerCase().includes('efectivo'))
            .reduce((sum, tx) => sum + tx.credit, 0);
        const totalCollections = collectionsCash + collectionsDigital;

        const expensesCash = expensesForToday.reduce((sum, exp) => sum + exp.Efectivo, 0);
        const expensesDigital = expensesForToday.reduce((sum, exp) => sum + exp.Digital, 0);
        const totalExpenses = expensesCash + expensesDigital;

        const netResult = (incomeFromSalesCash + incomeFromSalesDigital + totalCollections) - totalExpenses;
        const currentCash = incomeFromSalesCash + collectionsCash - expensesCash;

        return {
            totalSold, incomeFromSales: incomeFromSalesCash + incomeFromSalesDigital,
            incomeFromSalesCash, incomeFromSalesDigital, totalCreditSales,
            totalCollections, collectionsCash, collectionsDigital, totalExpenses,
            netResult, currentCash, salesCount: activeSales.length,
            productsSoldCount: activeSales.reduce((sum, s) => sum + s.itemCount, 0),
        };
    }, [todayData]);

    const handleShowExpensesDetails = () => {
        setModalConfig({
            isOpen: true, title: "Detalle de Gastos de Hoy",
            columns: [
                { header: 'Fecha/Hora', accessor: (e: Expense) => new Date(e.Fecha).toLocaleTimeString('es-AR'), className: 'whitespace-nowrap' },
                { header: 'Detalle', accessor: 'Detalle' },
                { header: 'Tipo', accessor: (e: Expense) => e.Efectivo > 0 ? 'Efectivo' : 'Digital' },
                { header: 'Monto', accessor: (e: Expense) => formatCurrency(e.Monto), className: 'text-right font-medium' },
            ],
            data: todayData.expensesForToday,
            summary: <p>Total Gastos: {formatCurrency(stats.totalExpenses)}</p>
        });
    };

    const handleShowCollectionsDetails = () => {
        setModalConfig({
            isOpen: true, title: "Detalle de Cobranzas de Hoy",
            columns: [
                { header: 'Fecha/Hora', accessor: (t: AccountTransaction) => new Date(t.date).toLocaleTimeString('es-AR'), className: 'whitespace-nowrap' },
                { header: 'Descripción', accessor: 'description' },
                { header: 'Monto', accessor: (t: AccountTransaction) => formatCurrency(t.credit), className: 'text-right font-medium' },
            ],
            data: todayData.collectionsForToday,
            summary: <p>Total Cobranzas: {formatCurrency(stats.totalCollections)}</p>
        });
    };
    
    const titleText = useMemo(() => {
        if (currentUser?.Rol === 'Admin') {
            if (sellerFilter === 'All') return 'Resumen y Ventas de Hoy';
            const user = allUsers.find(u => u.ID_Usuario === sellerFilter);
            return `Resumen de Hoy (${user?.Nombre || 'Desconocido'})`;
        }
        if (currentUser?.Rol === 'Vendedor' && activeShift) return `Resumen de Hoy (Turno #${activeShift.ID_Turno.slice(0,6)})`;
        return 'Resumen y Ventas de Hoy';
    }, [currentUser, activeShift, sellerFilter, allUsers]);

    const sellerFilterControl = currentUser?.Rol === 'Admin' && (
        <div className="flex-grow-0">
            <label htmlFor="seller-filter-today" className="sr-only">Vendedor</label>
            <select id="seller-filter-today" value={sellerFilter} onChange={e => setSellerFilter(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                <option value="All">Todos</option>
                {allUsers.filter(u => u.Rol === 'Vendedor' || u.Rol === 'Admin').map(user => <option key={user.ID_Usuario} value={user.ID_Usuario}>{user.Nombre}</option>)}
            </select>
        </div>
    );

    if (isLoading) {
        return (
            <div className="flex-grow flex items-center justify-center h-[calc(100vh-80px)]">
                <div className="text-center">
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-12 h-12 text-blue-500 animate-spin mx-auto"/>
                    <p className="mt-2 text-gray-600">Calculando el resumen del día...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <h1 className="text-3xl font-bold text-gray-800">{titleText}</h1>
            </div>
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-gray-700">Métricas Clave del Día</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatCard title="Resultado Neto del Día" value={formatCurrency(stats.netResult)} description="(Ingresos + Cobranzas) - Gastos" iconPath="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.517l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" iconBgColor="bg-blue-500" />
                    <StatCard title="Total Vendido Hoy" value={formatCurrency(stats.totalSold)} description="Suma de todos los métodos de pago" iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75m-15.75 0v-2.25a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121.75 16.5v2.25" iconBgColor="bg-purple-500" />
                    <StatCard title="Ventas (Cantidad)" value={stats.salesCount.toLocaleString('es-AR')} description={`${stats.productsSoldCount.toLocaleString('es-AR')} productos en total`} iconPath="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344-.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6.75A2.25 2.25 0 014.5 4.5h15A2.25 2.25 0 0121.75 6.75v3.026" iconBgColor="bg-green-500" />
                </div>
            </div>
            <div className="space-y-4">
                 <h2 className="text-xl font-bold text-gray-700">Flujo de Dinero de Hoy</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard title="Efectivo Actual en Caja" value={formatCurrency(stats.currentCash)} description="(Ventas + Cobranzas) - Gastos" iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75m-15.75 0v-2.25a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121.75 16.5v2.25" iconBgColor="bg-teal-500" />
                    <StatCard title="Ingresos por Ventas" value={formatCurrency(stats.incomeFromSales)} description="Efectivo + Digital de ventas" iconPath="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.826-2.997.11-2.003 1.189z" iconBgColor="bg-green-500" />
                    <StatCard title="Cobranzas Cta. Cte." value={formatCurrency(stats.totalCollections)} description={`Efectivo: ${formatCurrency(stats.collectionsCash)} / Digital: ${formatCurrency(stats.collectionsDigital)}`} iconPath="M9 9l6-6m0 0l6 6m-6-6v12a6 6 0 01-12 0v-3" iconBgColor="bg-orange-500" onClick={handleShowCollectionsDetails} />
                    <StatCard title="Gastos Totales" value={formatCurrency(stats.totalExpenses)} description="Salidas de dinero (efectivo/digital)" iconPath="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" iconBgColor="bg-red-500" onClick={handleShowExpensesDetails} />
                </div>
            </div>
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-gray-700">Desglose de Ventas de Hoy</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatCard title="Ventas en Efectivo" value={formatCurrency(stats.incomeFromSalesCash)} iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75m-15.75 0v-2.25a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121.75 16.5v2.25" iconBgColor="bg-teal-500" />
                    <StatCard title="Ventas en Digital" value={formatCurrency(stats.incomeFromSalesDigital)} description="Digital + E-Cheq" iconPath="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z" iconBgColor="bg-sky-500" />
                    <StatCard title="Ventas a Cta. Cte." value={formatCurrency(stats.totalCreditSales)} iconPath="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.512 2.72a9.094 9.094 0 013.741-.479 3 3 0 01-4.682-2.72M13.5 3A3.375 3.375 0 0010.125 6.375v3.75c0 .621.504 1.125 1.125 1.125h.375m0 0c-.375.621.504 1.125 1.125 1.125h.375m0 0c.621-.504 1.125-1.125 1.125-1.125v-3.75A3.375 3.375 0 0013.5 3z" iconBgColor="bg-red-500" />
                </div>
            </div>
            <SalesDashboard title="Detalle de Ventas" salesData={todayData.salesForToday} customers={customers} products={products} refreshData={refreshData} isLoading={isLoading} noDataMessage="No se encontraron ventas para hoy." showStats={false} searchBarAddon={sellerFilterControl} />
            <StatDetailModal isOpen={modalConfig.isOpen} onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))} title={modalConfig.title} columns={modalConfig.columns} data={modalConfig.data} summary={modalConfig.summary} />
        </div>
    );
};
