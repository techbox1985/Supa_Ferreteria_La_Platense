
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
    historyProcessedSales?: Sale[];
    shifts: Shift[];
    isLoading: boolean;
    refreshData: () => void;
    fetchSalesForDateRange?: (startDate: string, endDate: string) => Promise<void>;
    currentSubView: string;
    onEditSale?: (sale: Sale) => void;
}

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({ products, customers, suppliers, allUsers, processedSales, historyProcessedSales, shifts, isLoading, refreshData, fetchSalesForDateRange, currentSubView, onEditSale }) => {
    const [localSuppliers, setLocalSuppliers] = React.useState<Supplier[]>(suppliers);
    React.useEffect(() => { setLocalSuppliers(suppliers); }, [suppliers]);
    const refreshOnlySuppliers = async () => {
        const suppliersResult = await import('../../services/api').then(m => m.getSuppliers());
        setLocalSuppliers(suppliersResult || []);
    };
    const renderCurrentView = () => {
        switch(currentSubView) {
            case 'products':
                return <ProductAdminView products={products} suppliers={localSuppliers} refreshProducts={refreshData} isLoading={isLoading} />;
            case 'low-stock-admin':
                return <LowStockAdminSection products={products} suppliers={localSuppliers} isLoading={isLoading} />;
            case 'quick-edit':
                return <QuickPriceEditorView products={products} refreshData={refreshData} isLoading={isLoading} />;
            case 'stock-entry':
                return <StockEntryView products={products} refreshData={refreshData} isLoading={isLoading} />;
            case 'suppliers':
                return <SuppliersView allSuppliers={localSuppliers} refreshSuppliers={refreshOnlySuppliers} isLoading={isLoading} />;
            case 'users':
                return <UsersView allUsers={allUsers} refreshUsers={refreshData} isLoading={isLoading} />;
            case 'sales-history':
                return <SalesHistoryView processedSales={historyProcessedSales || processedSales} products={products} customers={customers} allUsers={allUsers} shifts={shifts} isLoading={isLoading} refreshData={refreshData} fetchSalesForDateRange={fetchSalesForDateRange} onEditSale={onEditSale} />;
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
