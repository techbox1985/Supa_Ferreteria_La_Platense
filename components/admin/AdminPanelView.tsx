
import React from 'react';
import { Product, Customer, Sale, User, Shift, Supplier } from '../../types';
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



interface AdminPanelViewProps {
    products: Product[];
    customers: Customer[];
    suppliers: Supplier[];
    allUsers: User[];
    processedSales: Sale[];
    shifts: Shift[];
    isLoading: boolean;
    refreshData: () => void;
    currentSubView: string;
}

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({ products, customers, suppliers, allUsers, processedSales, shifts, isLoading, refreshData, currentSubView }) => {
    const renderCurrentView = () => {
        switch(currentSubView) {
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
        <div className="h-full bg-gray-100 overflow-y-auto">
            {renderCurrentView()}
        </div>
    );
};

export default AdminPanelView;
