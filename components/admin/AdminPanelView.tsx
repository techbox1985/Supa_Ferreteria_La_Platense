
import React, { useState } from 'react';
import { Product, Customer, Sale, User, Shift, Supplier } from '../../types';
import { Icon } from '../ui/Icon';
import { ProductAdminView } from './ProductAdminView';
import { UsersView } from './UsersView';
import { ShiftsView } from '../cash-register/ShiftsView';
import SalesHistoryView from '../sales-history/SalesHistoryView';
import { TopProductsView } from '../reports/TopProductsView';
import { TopCustomersView } from '../reports/TopCustomersView';
import { QuickPriceEditorView } from './QuickPriceEditorView';
import { StockEntryView } from '../stock-entry/StockEntryView';
import { PrintingPanel } from './PrintingPanel';
import { MonthlyBillingView } from './MonthlyBillingView';
import { SuppliersView } from './SuppliersView';
import { LowStockAdminSection } from './LowStockAdminSection';


type AdminView = 
    'products' | 
    'low-stock-admin' |
    'quick-edit' | 
    'stock-entry' |
    'suppliers' |
    'users' | 
    'sales-history' | 
    'monthly-billing' |
    'shifts' | 
    'top-products' | 
    'top-customers' |
    'printing';

interface AdminPanelViewProps {
    products: Product[];
    customers: Customer[];
    suppliers: Supplier[];
    allUsers: User[];
    processedSales: Sale[];
    shifts: Shift[];
    isLoading: boolean;
    refreshData: () => void;
}

const AdminNavButton: React.FC<{ label: string; iconPath: string; isActive: boolean; onClick: () => void }> = ({ label, iconPath, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center space-x-3 p-3 w-full text-left rounded-lg transition-colors ${
            isActive ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'
        }`}
    >
        <Icon path={iconPath} className="w-5 h-5 flex-shrink-0" />
        <span className="font-medium text-sm">{label}</span>
    </button>
);

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({ products, customers, suppliers, allUsers, processedSales, shifts, isLoading, refreshData }) => {
    const [currentAdminView, setCurrentAdminView] = useState<AdminView>('products');
    
    const renderCurrentView = () => {
        switch(currentAdminView) {
            case 'products':
                return <ProductAdminView products={products} suppliers={suppliers} refreshProducts={refreshData} isLoading={isLoading} />;
            case 'low-stock-admin':
                return <LowStockAdminSection products={products} suppliers={suppliers} />;
            case 'quick-edit':
                return <QuickPriceEditorView products={products} refreshData={refreshData} isLoading={isLoading} />;
            case 'stock-entry':
                return <StockEntryView products={products} refreshData={refreshData} isLoading={isLoading} />;
            case 'suppliers':
                return <SuppliersView allSuppliers={suppliers} refreshSuppliers={refreshData} isLoading={isLoading} />;
            case 'users':
                return <UsersView allUsers={allUsers} refreshUsers={refreshData} isLoading={isLoading} />;
            case 'sales-history':
                return <SalesHistoryView processedSales={processedSales} products={products} customers={customers} allUsers={allUsers} shifts={shifts} isLoading={isLoading} refreshData={refreshData} />;
            case 'monthly-billing':
                return <MonthlyBillingView processedSales={processedSales} refreshData={refreshData} />;
            case 'shifts':
                return <ShiftsView isLoading={isLoading} refreshData={refreshData} />;
            case 'top-products':
                return <TopProductsView processedSales={processedSales} products={products} isLoading={isLoading} />;
            case 'top-customers':
                return <TopCustomersView processedSales={processedSales} customers={customers} isLoading={isLoading} />;
            case 'printing':
                return <PrintingPanel />;
            default:
                return null;
        }
    };

    return (
        <div className="flex h-[calc(100vh-80px)]">
            <aside className="w-64 bg-white p-4 flex-col shadow-lg z-10 space-y-2 overflow-y-auto">
                <AdminNavButton label="Productos" iconPath="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" isActive={currentAdminView === 'products'} onClick={() => setCurrentAdminView('products')} />
                <AdminNavButton label="Compras e Ingresos" iconPath="M9 13.5l3 3m0 0l3-3m-3 3v-6m1.06-4.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" isActive={currentAdminView === 'stock-entry'} onClick={() => setCurrentAdminView('stock-entry')} />
                <AdminNavButton label="Proveedores" iconPath="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125V14.25m-17.25 4.5h12.75m0 0v-4.125c0-.621-.504-1.125-1.125-1.125H11.25c-.621 0-1.125.504-1.125 1.125v4.125m0 0a2.25 2.25 0 104.5 0m-4.5 0a2.25 2.25 0 014.5 0M12 10.875a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" isActive={currentAdminView === 'suppliers'} onClick={() => setCurrentAdminView('suppliers')} />
                <AdminNavButton label="Usuarios" iconPath="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.231 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.67c.12-.24.232-.487.335-.737m-3.05-2.828c.328.316.63.645.913.985" isActive={currentAdminView === 'users'} onClick={() => setCurrentAdminView('users')} />
                <AdminNavButton label="Turnos de Caja" iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75m-15.75 0v-2.25a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121.75 16.5v2.25" isActive={currentAdminView === 'shifts'} onClick={() => setCurrentAdminView('shifts')} />
                <div className="pt-2 mt-2 border-t">
                    <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase">Reportes e Informes</p>
                </div>
                 <AdminNavButton label="Facturación por Período" iconPath="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" isActive={currentAdminView === 'monthly-billing'} onClick={() => setCurrentAdminView('monthly-billing')} />
                 <AdminNavButton label="Top Productos" iconPath="M16.5 18.75h-9a2.25 2.25 0 00-2.25 2.25v.003c0 .621.504 1.125 1.125 1.125h11.25c.621 0 1.125-.504 1.125-1.125v-.003a2.25 2.25 0 00-2.25-2.25zM10.5 2.25a2.25 2.25 0 00-2.25 2.25v11.25a2.25 2.25 0 002.25 2.25h3.375c.621 0 1.125-.504 1.125-1.125V16.5M10.5 16.5h-3.375a2.25 2.25 0 01-2.25-2.25V5.625a2.25 2.25 0 012.25-2.25H10.5" isActive={currentAdminView === 'top-products'} onClick={() => setCurrentAdminView('top-products')} />
                 <AdminNavButton label="Top Clientes" iconPath="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.512 2.72a9.094 9.094 0 013.741-.479 3 3 0 01-4.682-2.72M13.5 3A3.375 3.375 0 0010.125 6.375v3.75c0 .621.504 1.125 1.125 1.125h.375m0 0c-.375.621.504 1.125 1.125 1.125h.375m0 0c.621-.504 1.125-1.125 1.125-1.125v-3.75A3.375 3.375 0 0013.5 3z" isActive={currentAdminView === 'top-customers'} onClick={() => setCurrentAdminView('top-customers')} />
                <div className="pt-2 mt-2 border-t">
                    <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase">Configuración</p>
                </div>
                <AdminNavButton label="Impresión" iconPath="M6.75 7.5h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75-.75h-10.5a.75.75 0 01-.75-.75V8.25a.75.75 0 01.75-.75z" isActive={currentAdminView === 'printing'} onClick={() => setCurrentAdminView('printing')} />
            </aside>
            <main className="flex-1 bg-gray-100 overflow-y-auto">
                {renderCurrentView()}
            </main>
        </div>
    );
};

export default AdminPanelView;
