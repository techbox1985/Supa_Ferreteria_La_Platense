
import React, { useState, useMemo, useContext, useCallback, useEffect } from 'react';
// Helper para detectar mobile real
const useIsReallyMobile = () => {
    const [isReallyMobile, setIsReallyMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 640 : false);
    useEffect(() => {
        const handleResize = () => setIsReallyMobile(window.innerWidth < 640);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    return isReallyMobile;
};
import { Sale, Product, Customer, CartItem, CreditNote, AccountTransaction } from '../../types';
import * as api from '../../services/api';
import { Icon } from '../ui/Icon';
import { generateReceiptHtml, generateCreditNoteHtml, generateRemitoHtml, generateInvoiceHtml } from '../pos/Receipt';
import { CreditNoteModal } from '../customers/CreditNoteModal';
import { StatCard } from '../dashboard/StatCard';
import { StatDetailModal } from '../dashboard/StatDetailModal';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { EditSaleModal } from '../sales-history/EditSaleModal';
import { Modal } from '../ui/Modal';
import { SearchableSelect } from '../ui/SearchableSelect';
import { sendTicketViaWhatsApp } from '../../utils/whatsappHelper';
import { getPrintStyles } from '../../utils/printStyles';
import { BillingModal } from './BillingModal';


const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const CreditNoteRow: React.FC<{
  note: AccountTransaction;
  onOpenActions: (note: AccountTransaction) => void;
}> = React.memo(({ note, onOpenActions }) => {
  return (
    <tr 
      className="bg-red-50 hover:bg-red-100 transition-colors cursor-pointer select-none"
      onClick={() => onOpenActions(note)}
    >
      <td className="px-4 py-2 text-center w-12 min-w-[48px]">
        <Icon path="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" className="w-5 h-5 text-red-500 mx-auto" />
      </td>
      <td className="px-4 py-2 whitespace-nowrap text-sm font-mono text-gray-500 w-24 min-w-[96px]">{note.id.slice(0, 8)}</td>
      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 w-40 min-w-[160px]">{new Date(note.date).toLocaleString('es-AR')}</td>
      <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-red-700 italic max-w-[200px] truncate" colSpan={4}>
        Nota de Crédito {note.facturaInfo ? `(Oficial ${note.facturaInfo.nro})` : `(Ref: ${note.originalSaleId?.slice(0,8)})`}
        <div className="text-xs font-normal text-gray-600 truncate max-w-xs" title={note.items?.map(i => `${i.quantity}x ${i.product.Producto}`).join(', ')}>
          {note.items?.map(i => `${i.quantity}x ${i.product.Producto}`).join(', ')}
        </div>
      </td>
      <td className="px-4 py-2 whitespace-nowrap text-sm font-bold text-red-700 text-right w-28 min-w-[112px]">
        -${note.credit.toLocaleString('es-AR')}
      </td>
      <td className="px-4 py-2 w-24 min-w-[96px]"></td>
      <td className="px-4 py-2 w-24 min-w-[96px]"></td>
      <td className="px-4 py-2 w-24 min-w-[96px]"></td>
      <td className="px-4 py-2 w-24 min-w-[96px]"></td>
      <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium w-16 min-w-[64px]">
        <button 
          onClick={(e) => { e.stopPropagation(); onOpenActions(note); }} 
          className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
        >
          <Icon path="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" className="w-5 h-5" />
        </button>
      </td>
    </tr>
  );
});
CreditNoteRow.displayName = 'CreditNoteRow';

const SaleRow: React.FC<{
    sale: Sale;
    onOpenActions: (sale: Sale) => void;
}> = React.memo(({ sale, onOpenActions }) => {
    const isAnnulled = sale.status === 'annulled';
    const hasPartialReturn = !isAnnulled && (sale.returnedTotal || 0) > 0;
    const finalTotal = sale.total - (sale.returnedTotal || 0);

    const rowBg = isAnnulled ? 'bg-red-50 text-gray-500' : hasPartialReturn ? 'bg-orange-50' : 'bg-white';
    const hoverBg = isAnnulled ? 'hover:bg-red-100' : hasPartialReturn ? 'hover:bg-orange-100' : 'hover:bg-gray-50';
    
    const totalEcheqs = useMemo(() => sale.payment.echeqs?.reduce((sum, e) => sum + e.amount, 0) || 0, [sale.payment.echeqs]);


    return (
        <tr 
            className={`${rowBg} ${hoverBg} transition-colors border-b cursor-pointer select-none`}
            onClick={() => onOpenActions(sale)}
        >
            <td className="px-4 py-4 text-center w-12 min-w-[48px]">
                <Icon path="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344-.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6.75A2.25 2.25 0 014.5 4.5h15A2.25 2.25 0 0121.75 6.75v3.026" className="w-5 h-5 text-gray-400 mx-auto" />
            </td>
            <td className="px-4 py-4 whitespace-nowrap text-sm font-mono w-24 min-w-[96px]">{sale.id.slice(0, 8)}</td>
            <td className="px-4 py-4 whitespace-nowrap text-sm w-40 min-w-[160px]">{new Date(sale.date).toLocaleString('es-AR')}</td>
            <td className="px-4 py-4 whitespace-nowrap text-sm font-medium max-w-[200px] truncate" title={sale.customer ? sale.customer['Nombre y Apellido'] : 'Consumidor Final'}>
                {sale.customer ? sale.customer['Nombre y Apellido'] : 'Consumidor Final'}
            </td>
            <td className="px-4 py-4 whitespace-nowrap text-sm text-center w-16 min-w-[64px]">{sale.itemCount}</td>
            <td className="px-4 py-4 whitespace-nowrap text-sm text-right w-24 min-w-[96px]">{isAnnulled ? '-' : formatCurrency(sale.subtotal)}</td>
            <td className="px-4 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]">{isAnnulled ? '-' : formatCurrency(sale.adjustmentAmount || 0)}</td>
            <td className="px-4 py-4 whitespace-nowrap text-sm w-28 min-w-[112px]">
                 {(hasPartialReturn || isAnnulled) ? (
                  <div>
                    <span className="line-through text-gray-400 mr-2">${sale.total.toLocaleString('es-AR')}</span>
                    <span className="font-bold text-gray-900">${finalTotal.toLocaleString('es-AR')}</span>
                  </div>
                ) : (
                  <span className={`font-bold text-gray-900`}>${sale.total.toLocaleString('es-AR')}</span>
                )}
            </td>
            <td className="px-4 py-4 whitespace-nowrap text-sm w-24 min-w-[96px]">
                {isAnnulled ? '-' : formatCurrency(sale.payment.cash)}
            </td>
            <td className="px-4 py-4 whitespace-nowrap text-sm w-24 min-w-[96px]">
                {isAnnulled ? '-' : formatCurrency(sale.payment.digital)}
            </td>
             <td className="px-4 py-4 whitespace-nowrap text-sm w-24 min-w-[96px]">
                {isAnnulled ? '-' : formatCurrency(totalEcheqs)}
            </td>
            <td className="px-4 py-4 whitespace-nowrap text-sm w-24 min-w-[96px]">
                {isAnnulled ? '-' : formatCurrency(sale.payment.credit)}
            </td>
            <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium w-16 min-w-[64px]">
                <div className="flex items-center justify-end space-x-2">
                    {sale.facturaInfo && (sale.facturaInfo.url || sale.facturaInfo.ticketUrl) && (
                        <a
                            href={sale.facturaInfo.ticketUrl || sale.facturaInfo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:text-blue-800"
                            title={`Abrir Documento Oficial de la Factura ${sale.facturaInfo.nro}`}
                        >
                            <Icon path="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" className="w-5 h-5" />
                        </a>
                    )}
                    <button 
                        onClick={(e) => { e.stopPropagation(); onOpenActions(sale); }} 
                        className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                    >
                        <Icon path="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" className="w-5 h-5" />
                    </button>
                </div>
            </td>
        </tr>
    );
});
SaleRow.displayName = 'SaleRow';


interface SalesDashboardProps {
    title: string;
    salesData: Sale[];
    products: Product[];
    customers: Customer[];
    refreshData: () => void;
    isLoading: boolean;
    headerChildren?: React.ReactNode;
    noDataMessage: string;
    statTitlePrefix?: string;
    showStats?: boolean;
    searchBarAddon?: React.ReactNode;
}

export const SalesDashboard: React.FC<SalesDashboardProps & { searchTerm?: string; setSearchTerm?: (v: string) => void; stickyStats?: boolean; stickyFilters?: boolean }> = ({ title, salesData, products, customers, refreshData, isLoading, headerChildren, noDataMessage, statTitlePrefix = '', showStats = true, searchBarAddon, searchTerm: externalSearchTerm, setSearchTerm: externalSetSearchTerm, stickyStats = false, stickyFilters = false }) => {
    const isReallyMobile = useIsReallyMobile();
    const [internalSearchTerm, internalSetSearchTerm] = useState('');
    const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
    const setSearchTerm = externalSetSearchTerm !== undefined ? externalSetSearchTerm : internalSetSearchTerm;
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);
    const [saleForCreditNote, setSaleForCreditNote] = useState<Sale | null>(null);
    const [saleToEdit, setSaleToEdit] = useState<Sale | null>(null);
    const [saleToBill, setSaleToBill] = useState<Sale | null>(null);
    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; title: string; columns: any[]; data: any[]; summary?: React.ReactNode; }>({ isOpen: false, title: '', columns: [], data: [] });
    
    const [selectedItemForActions, setSelectedItemForActions] = useState<{ type: 'sale' | 'note', item: Sale | AccountTransaction } | null>(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [saleToDeleteId, setSaleToDeleteId] = useState<string | null>(null);
    const [isProcessingAction, setIsProcessingAction] = useState(false);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleOpenActions = useCallback((item: Sale | AccountTransaction, type: 'sale' | 'note') => {
        setSelectedItemForActions({ type, item });
    }, []);
    
    const [sendModalState, setSendModalState] = useState<{ isOpen: boolean; sale: Sale | null }>({ isOpen: false, sale: null });
    const [targetCustomerId, setTargetCustomerId] = useState<string>('');


    // FIX: Get activeShift from context to provide shiftId when creating a credit note.
    const { currentUser, activeShift } = useContext(AuthContext);
    const { addToast } = useToast();
    const isAdmin = currentUser?.Rol === 'Admin';


    const stats = useMemo(() => {
        const completedSales = salesData.filter(sale => sale.status !== 'annulled');

        const totalRevenue = completedSales.reduce((sum, sale) => sum + (sale.total - (sale.returnedTotal || 0)), 0);
        
        const totalProductsSold = completedSales.reduce((sum, sale) => {
             const originalCount = sale.itemCount;
             const returnedCount = sale.creditNotes?.reduce((noteSum, note) => {
                 return noteSum + (note.items?.reduce((itemSum, item) => itemSum + item.quantity, 0) || 0);
             }, 0) || 0;
             return sum + (originalCount - returnedCount);
        }, 0);

        const totalCash = completedSales.reduce((sum, sale) => sum + sale.payment.cash, 0);
        const totalDigital = completedSales.reduce((sum, sale) => sum + sale.payment.digital, 0);
        const totalCredit = completedSales.reduce((sum, sale) => sum + sale.payment.credit, 0);
        const totalEcheq = completedSales.reduce((sum, sale) => sum + (sale.payment.echeqs?.reduce((eSum, e) => eSum + e.amount, 0) || 0), 0);


        return {
            totalRevenue,
            salesCount: completedSales.length,
            totalProductsSold,
            totalCash,
            totalDigital,
            totalCredit,
            totalEcheq,
        };
    }, [salesData]);

    const filteredSales = useMemo(() => {
        if (!salesData) return [];
        const term = debouncedSearchTerm.toLowerCase().trim();
        if (!term) return salesData;

        return salesData.filter(s => {
            const customer = s.customer;
            const customerName = customer ? customer['Nombre y Apellido'] : 'Consumidor Final';
            const customerDoc = customer?.Documento || '';
            const customerId = customer?.Id_Cliente || '';
            const saleId = s.id || '';
            const invoiceNro = s.facturaInfo?.nro || s.Factura_Nro || '';
            const whatsapp = customer?.Whatsapp || '';
            const email = customer?.Email || '';

            return (
                customerName.toLowerCase().includes(term) ||
                customerDoc.toLowerCase().includes(term) ||
                customerId.toLowerCase().includes(term) ||
                saleId.toLowerCase().includes(term) ||
                invoiceNro.toLowerCase().includes(term) ||
                whatsapp.toLowerCase().includes(term) ||
                email.toLowerCase().includes(term)
            );
        });
    }, [salesData, debouncedSearchTerm]);
    
    const whatsAppCustomers = useMemo(() => customers.filter(c => c.Whatsapp && c.Id_Cliente !== '0').sort((a,b) => a['Nombre y Apellido'].localeCompare(b['Nombre y Apellido'])), [customers]);


    const handleShowRevenueDetails = useCallback(() => {
        const completedSales = salesData.filter(s => s.status !== 'annulled');
        setModalConfig({
            isOpen: true,
            title: `Detalle de Ingresos ${statTitlePrefix}`,
            columns: [
                { header: 'Fecha/Hora', accessor: (s: Sale) => new Date(s.date).toLocaleString('es-AR'), className: 'whitespace-nowrap' },
                { header: 'Cliente', accessor: (s: Sale) => s.customer?.['Nombre y Apellido'] || 'Consumidor Final' },
                { header: 'Total', accessor: (s: Sale) => formatCurrency(s.total - (s.returnedTotal || 0)), className: 'text-right font-medium' },
            ],
            data: completedSales,
            summary: <p>Total: {formatCurrency(stats.totalRevenue)}</p>
        });
    }, [salesData, statTitlePrefix, stats.totalRevenue]);
    
    const handleShowCashDetails = useCallback(() => {
        const cashSales = salesData.filter(s => s.status !== 'annulled' && s.payment.cash > 0);
        setModalConfig({
            isOpen: true,
            title: `Detalle de Ingresos en Efectivo ${statTitlePrefix}`,
            columns: [
                { header: 'Fecha/Hora', accessor: (s: Sale) => new Date(s.date).toLocaleString('es-AR') },
                { header: 'Cliente', accessor: (s: Sale) => s.customer?.['Nombre y Apellido'] || 'Consumidor Final' },
                { header: 'Monto Efectivo', accessor: (s: Sale) => formatCurrency(s.payment.cash), className: 'text-right font-medium' },
            ],
            data: cashSales,
            summary: <p>Total Efectivo: {formatCurrency(stats.totalCash)}</p>
        });
    }, [salesData, statTitlePrefix, stats.totalCash]);
    
    const handleShowDigitalDetails = useCallback(() => {
        const digitalSales = salesData.filter(s => s.status !== 'annulled' && s.payment.digital > 0);
        setModalConfig({
            isOpen: true,
            title: `Detalle de Ingresos Digitales ${statTitlePrefix}`,
            columns: [
                { header: 'Fecha/Hora', accessor: (s: Sale) => new Date(s.date).toLocaleString('es-AR') },
                { header: 'Cliente', accessor: (s: Sale) => s.customer?.['Nombre y Apellido'] || 'Consumidor Final' },
                { header: 'Monto Digital', accessor: (s: Sale) => formatCurrency(s.payment.digital), className: 'text-right font-medium' },
            ],
            data: digitalSales,
            summary: <p>Total Digital: {formatCurrency(stats.totalDigital)}</p>
        });
    }, [salesData, statTitlePrefix, stats.totalDigital]);
    
    const handleShowCreditDetails = useCallback(() => {
        const creditSales = salesData.filter(s => s.status !== 'annulled' && s.payment.credit > 0);
        setModalConfig({
            isOpen: true,
            title: `Detalle de Ventas a Crédito ${statTitlePrefix}`,
            columns: [
                { header: 'Fecha/Hora', accessor: (s: Sale) => new Date(s.date).toLocaleString('es-AR') },
                { header: 'Cliente', accessor: (s: Sale) => s.customer?.['Nombre y Apellido'] || 'Consumidor Final' },
                { header: 'Monto a Crédito', accessor: (s: Sale) => formatCurrency(s.payment.credit), className: 'text-right font-medium' },
            ],
            data: creditSales,
            summary: <p>Total a Crédito: {formatCurrency(stats.totalCredit)}</p>
        });
    }, [salesData, statTitlePrefix, stats.totalCredit]);

    const handleShowEcheqDetails = useCallback(() => {
        const echeqSales = salesData.filter(s => s.status !== 'annulled' && s.payment.echeqs?.length > 0);
        setModalConfig({
            isOpen: true,
            title: `Detalle de Pagos con E-Cheq ${statTitlePrefix}`,
            columns: [
                { header: 'Fecha/Hora', accessor: (s: Sale) => new Date(s.date).toLocaleString('es-AR') },
                { header: 'Cliente', accessor: (s: Sale) => s.customer?.['Nombre y Apellido'] || 'Consumidor Final' },
                { header: 'Monto E-Cheq', accessor: (s: Sale) => formatCurrency(s.payment.echeqs.reduce((sum,e) => sum + e.amount, 0)), className: 'text-right font-medium' },
                { header: 'Detalle', accessor: (s: Sale) => s.payment.echeqs.map(e => `$${e.amount} (${e.days}d)`).join(', '), className: 'text-center' },
            ],
            data: echeqSales,
            summary: <p>Total E-Cheq: {formatCurrency(stats.totalEcheq)}</p>
        });
    }, [salesData, statTitlePrefix, stats.totalEcheq]);

    const handleShowProductsSoldDetails = useCallback(() => {
        const soldItems = new Map<string, { product: Product, quantity: number }>();
        salesData.filter(s => s.status !== 'annulled').forEach(sale => {
            sale.items.forEach(item => {
                const current = soldItems.get(item.product.cod) || { product: item.product, quantity: 0 };
                current.quantity += item.quantity;
                soldItems.set(item.product.cod, current);
            });
            sale.creditNotes?.forEach(note => {
                note.items?.forEach(item => {
                    const current = soldItems.get(item.product.cod);
                    if (current) {
                        current.quantity -= item.quantity;
                    }
                });
            });
        });
    
        const productsSoldList = Array.from(soldItems.values()).filter(item => item.quantity > 0).sort((a, b) => b.quantity - a.quantity);
    
        setModalConfig({
            isOpen: true,
            title: `Detalle de Productos Vendidos ${statTitlePrefix}`,
            columns: [
                { header: 'Producto', accessor: (item: any) => item.product.Producto },
                { header: 'Código', accessor: (item: any) => item.product.cod },
                { header: 'Cantidad Neta Vendida', accessor: 'quantity', className: 'text-center font-bold' },
            ],
            data: productsSoldList,
            summary: <p>Total Unidades: {stats.totalProductsSold}</p>
        });
    }, [salesData, statTitlePrefix, stats.totalProductsSold]);

    const handleView = useCallback((sale: Sale) => {
        if (sale.facturaInfo) {
            const officialUrl = sale.facturaInfo.ticketUrl || sale.facturaInfo.url;
            if (officialUrl) {
                window.open(officialUrl, '_blank');
                return;
            }
        }

        const printStyles = getPrintStyles();
        const ticketHtml = (sale.facturaInfo && sale.facturaInfo.cae)
            ? generateInvoiceHtml(sale, printStyles)
            : generateReceiptHtml(sale, printStyles);

        const ticketWindow = window.open('', '_blank', 'width=350,height=650,scrollbars=yes,resizable=yes');
        if (ticketWindow) {
            ticketWindow.document.write(ticketHtml);
            ticketWindow.document.close();
        } else {
            addToast("La ventana del ticket fue bloqueada. Habilite las ventanas emergentes.", "error");
        }
    }, [addToast]);

    const handleGenerateRemito = useCallback((sale: Sale) => {
        const remitoHtml = generateRemitoHtml(sale);
        const remitoWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
        if (remitoWindow) {
            remitoWindow.document.write(remitoHtml);
            remitoWindow.document.close();
        }
    }, []);
    
    const handleOpenSendModal = useCallback((sale: Sale) => {
        setSendModalState({ isOpen: true, sale: sale });
        const originalCustomerIsValid = whatsAppCustomers.some(c => c.Id_Cliente === sale.customer?.Id_Cliente);
        if (originalCustomerIsValid && sale.customer) {
            setTargetCustomerId(sale.customer.Id_Cliente);
        } else if (whatsAppCustomers.length > 0) {
            setTargetCustomerId(whatsAppCustomers[0].Id_Cliente);
        } else {
            setTargetCustomerId('');
        }
    }, [whatsAppCustomers]);
    
    const handleConfirmAndSend = useCallback(() => {
        const { sale } = sendModalState;
        if (!sale || !targetCustomerId) {
            addToast("Por favor, seleccione un cliente de destino.", 'error');
            return;
        }

        const targetCustomer = customers.find(c => c.Id_Cliente === targetCustomerId);

        if (!targetCustomer || !targetCustomer.Whatsapp) {
            addToast("El cliente seleccionado no tiene un número de WhatsApp válido.", 'error');
            return;
        }

        const saleForSending: Sale = {
            ...sale,
            customer: targetCustomer,
        };

        sendTicketViaWhatsApp(saleForSending, addToast);
        
        setSendModalState({ isOpen: false, sale: null });
        addToast(`Ticket enviado a ${targetCustomer['Nombre y Apellido']}.`, 'success');
    }, [sendModalState, targetCustomerId, addToast, customers]);
    
    const handleReprintCreditNote = useCallback((note: AccountTransaction) => {
        const customer = customers.find(c => c.Id_Cliente === note.originalSaleId) || customers.find(c => c.Id_Cliente === '0');
        if (!note.items || !customer) {
            alert("No se puede reimprimir: faltan datos del cliente o de los items.");
            return;
        }
        
        const creditNote: CreditNote = {
            id: note.id,
            date: note.date,
            customer: customer,
            items: note.items,
            total: note.credit,
            description: note.description,
            originalSaleId: note.originalSaleId || '',
            facturaInfo: note.facturaInfo // Include official billing info if available
        }
        
        const printStyles = getPrintStyles();
        // If it has official data, treat it like an Invoice but it will be a Credit Note
        // However, generateInvoiceHtml is for invoices. We should adapt generateCreditNoteHtml or create a new one.
        // For simplicity, we reuse generateCreditNoteHtml which now can display official data if passed properly, 
        // OR reuse generateInvoiceHtml if the data structure matches.
        // Let's stick to generateCreditNoteHtml which is specific for refunds.
        const ticketHtml = generateCreditNoteHtml(creditNote, printStyles); 
        
        const ticketWindow = window.open('', '_blank', 'width=350,height=650,scrollbars=yes,resizable=yes');
        if (ticketWindow) {
            ticketWindow.document.write(ticketHtml);
            ticketWindow.document.close();
        }
    }, [customers]);

    const handleAddCreditNote = useCallback((sale: Sale) => {
        let customerForNote = sale.customer || customers.find(c => c.Id_Cliente === '0');
        if (!customerForNote) {
            alert("No se pudo determinar el cliente para la nota de crédito.");
            return;
        }
        
        const finalTotal = sale.total - (sale.returnedTotal || 0);
        if(finalTotal <= 0) {
            alert("Esta venta ya ha sido devuelta en su totalidad o anulada. No se puede generar otra nota de crédito.");
            return;
        }

        setSaleForCreditNote({ ...sale, customer: customerForNote });
    }, [customers]);

    const handleSaveCreditNote = useCallback(async (data: { items: CartItem[], description: string, total: number }) => {
        if (!saleForCreditNote || !saleForCreditNote.customer) throw new Error("Venta o cliente no seleccionado.");

        if (!activeShift) {
            addToast("No se puede crear una nota de crédito sin un turno activo.", 'error');
            throw new Error("No active shift");
        }

        const ticketWindow = window.open('', '_blank', 'width=350,height=650,scrollbars=yes,resizable=yes');
        if (ticketWindow) ticketWindow.document.write('Procesando...');

        try {
            let ncBillingInfo = undefined;

            // Check if original sale was officially billed
            if (saleForCreditNote.facturaInfo && saleForCreditNote.facturaInfo.cae) {
                const userConfirmed = window.confirm(
                    `La venta original tiene una factura electrónica (Nro: ${saleForCreditNote.facturaInfo.nro}).\n¿Desea generar una NOTA DE CRÉDITO ELECTRÓNICA oficial?`
                );

                if (userConfirmed) {
                    addToast('Generando Nota de Crédito Electrónica...', 'info');
                    const apiResponse = await api.generateElectronicCreditNote(saleForCreditNote, data.items);
                    
                    const invoiceData = apiResponse.data;
                    if (!invoiceData || !invoiceData.cae || invoiceData.cae === 'DEV_MODE_NO_CAE') {
                         throw new Error("El proveedor de facturación no devolvió un CAE válido para la Nota de Crédito.");
                    }
                    
                    ncBillingInfo = {
                        cae: invoiceData.cae,
                        nro: invoiceData.nro,
                        vtoCae: invoiceData.vtoCae,
                        qrData: invoiceData.qrData,
                        fecha: new Date().toLocaleString('es-AR'),
                        url: invoiceData.comprobante_pdf_url || invoiceData.url,
                        ticketUrl: invoiceData.comprobante_ticket_url
                    };
                    addToast(`Nota de Crédito Oficial ${invoiceData.nro} generada.`, 'success');
                }
            }

            await api.createCreditNote({
                customerId: saleForCreditNote.customer.Id_Cliente,
                originalSaleId: saleForCreditNote.id,
                shiftId: activeShift.ID_Turno,
                ...data,
                facturaInfo: ncBillingInfo
            });

            const totalPreviouslyReturned = saleForCreditNote.returnedTotal || 0;
            const newTotalReturned = totalPreviouslyReturned + data.total;
            if (newTotalReturned >= saleForCreditNote.total) {
                await api.annulSale(saleForCreditNote.id);
            }

            if (ticketWindow) {
                const creditNote: CreditNote = {
                    id: ncBillingInfo ? ncBillingInfo.nro : `NC-${crypto.randomUUID()}`, 
                    date: new Date(), 
                    ...data,
                    customer: saleForCreditNote.customer, 
                    originalSaleId: saleForCreditNote.id,
                    facturaInfo: ncBillingInfo
                };
                 const printStyles = getPrintStyles();
                ticketWindow.document.open();
                ticketWindow.document.write(generateCreditNoteHtml(creditNote, printStyles));
                ticketWindow.document.close();
            }
            addToast('Nota de crédito procesada con éxito.', 'success');
            refreshData();
            setSaleForCreditNote(null);
        } catch(error) {
            if (ticketWindow) ticketWindow.close();
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error("Credit Note Error:", error);
            addToast(`Error al procesar la nota de crédito: ${errMsg}`, 'error');
            // We do not rethrow here to prevent closing the modal abruptly on API error, unless intended.
            // But CreditNoteModal expects a promise rejection to keep open? 
            // Yes, checking CreditNoteModal source: catches error and keeps open. So we should rethrow.
            throw error; 
        }
    }, [saleForCreditNote, refreshData, addToast, activeShift]);
    
    const handleSaveUpdatedSale = useCallback(async (updatedSale: Sale) => {
        if (!saleToEdit) return;

        try {
            await api.updateSale(saleToEdit, updatedSale);
            addToast('Venta actualizada con éxito.', 'success');
            setSaleToEdit(null);
            refreshData();
        } catch (error) {
            console.error('Failed to update sale:', error);
            addToast(`Error al actualizar la venta: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'error');
            throw error;
        }
    }, [saleToEdit, addToast, refreshData]);


    const handleDeleteSale = useCallback(async (saleId: string) => {
        setIsProcessingAction(true);
        try {
            await api.annulSale(saleId);
            addToast('Venta anulada con éxito. El stock ha sido revertido.', 'success');
            refreshData();
        } catch (error) {
            console.error("Failed to annul sale:", error);
            addToast(`Error al anular la venta: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'error');
        } finally {
            setIsProcessingAction(false);
            setSaleToDeleteId(null);
        }
    }, [addToast, refreshData]);
    
    const handleConfirmDelete = useCallback(() => {
        if (!saleToDeleteId) return;
        handleDeleteSale(saleToDeleteId);
    }, [saleToDeleteId, handleDeleteSale]);

    const handleEditSale = useCallback((sale: Sale) => setSaleToEdit(sale), []);
    const handleDeleteRequest = useCallback((saleId: string) => setSaleToDeleteId(saleId), []);

    const handleBillingSuccess = useCallback(() => {
        setSaleToBill(null);
        addToast('Venta marcada como facturada (simulación).', 'success');
        refreshData();
    }, [addToast, refreshData]);


        return (
            <div className={isReallyMobile ? 'p-1 space-y-1' : 'p-2 space-y-4'}>
                {showStats && (
                    <div
                        className={stickyStats ? 'z-30 bg-white sticky top-0 left-0 right-0 shadow-sm' : ''}
                        style={stickyStats ? { paddingTop: 0, paddingBottom: 0 } : {}}
                    >
                        <div
                            className={isReallyMobile ? 'flex flex-nowrap gap-2 overflow-x-auto pb-1 -mx-1 px-1' : 'flex flex-nowrap gap-4 overflow-x-auto pb-2'}
                            style={isReallyMobile ? { WebkitOverflowScrolling: 'touch' } : {}}
                        >
                            <StatCard
                                title={`Ingresos ${statTitlePrefix}`}
                                value={formatCurrency(stats.totalRevenue)}
                                iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125-1.125h-.375m1.5-1.5H21a.75.75 0 00-.75-.75v-.75m0 0l-3.75-3.75M3 12m0 0l3.75 3.75M3.75 12H18m-9.75 6.75h1.5"
                                iconBgColor="bg-blue-500"
                                onClick={handleShowRevenueDetails}
                                className={isReallyMobile ? 'min-w-[110px] h-16 p-1 text-xs' : ''}
                            />
                            <StatCard
                                title={`Ventas ${statTitlePrefix}`}
                                value={stats.salesCount.toLocaleString('es-AR')}
                                iconPath="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344-.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6.75A2.25 2.25 0 014.5 4.5h15A2.25 2.25 0 0121.75 6.75v3.026"
                                iconBgColor="bg-green-500"
                                onClick={handleShowRevenueDetails}
                                className={isReallyMobile ? 'min-w-[110px] h-16 p-1 text-xs' : ''}
                            />
                            <StatCard
                                title={`Productos ${statTitlePrefix}`}
                                value={stats.totalProductsSold.toLocaleString('es-AR')}
                                iconPath="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z"
                                iconBgColor="bg-purple-500"
                                onClick={handleShowProductsSoldDetails}
                                className={isReallyMobile ? 'min-w-[110px] h-16 p-1 text-xs' : ''}
                            />
                            <StatCard
                                title={`Efectivo ${statTitlePrefix}`}
                                value={formatCurrency(stats.totalCash)}
                                iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75m-15.75 0v-2.25a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121.75 16.5v2.25"
                                iconBgColor="bg-teal-500"
                                onClick={handleShowCashDetails}
                                className={isReallyMobile ? 'min-w-[110px] h-16 p-1 text-xs' : ''}
                            />
                            <StatCard
                                title={`Digital ${statTitlePrefix}`}
                                value={formatCurrency(stats.totalDigital)}
                                iconPath="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z"
                                iconBgColor="bg-sky-500"
                                onClick={handleShowDigitalDetails}
                                className={isReallyMobile ? 'min-w-[110px] h-16 p-1 text-xs' : ''}
                            />
                            <StatCard
                                title={`Cta. Cte. ${statTitlePrefix}`}
                                value={formatCurrency(stats.totalCredit)}
                                iconPath="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.231 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.67c.12-.24.232-.487.335-.737m-3.05-2.828c.328.316.63.645.913.985"
                                iconBgColor="bg-red-500"
                                onClick={handleShowCreditDetails}
                                className={isReallyMobile ? 'min-w-[110px] h-16 p-1 text-xs' : ''}
                            />
                            <StatCard
                                title={`E-Cheq ${statTitlePrefix}`}
                                value={formatCurrency(stats.totalEcheq)}
                                iconPath="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
                                iconBgColor="bg-indigo-500"
                                onClick={handleShowEcheqDetails}
                                className={isReallyMobile ? 'min-w-[110px] h-16 p-1 text-xs' : ''}
                            />
                        </div>
                    </div>
                )}

                {headerChildren && (
                    <div
                        className={stickyFilters ? 'z-20 bg-white sticky top-[48px] left-0 right-0 shadow-sm' : ''}
                        style={isReallyMobile ? { padding: '6px 2px', marginBottom: 2 } : stickyFilters ? { marginTop: 0 } : {}}
                    >
                        {headerChildren}
                    </div>
                )}

            <div className="relative">
                <div className="bg-white shadow-md rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
                                <thead className="bg-gray-50 z-10 sticky top-[104px]" style={{zIndex:11, background:'#f9fafb'}}>
                                    <tr>
                                        <th scope="col" className="px-4 py-3 w-12 min-w-[48px] text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                                        <th scope="col" className="px-4 py-3 w-24 min-w-[96px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Venta</th>
                                        <th scope="col" className="px-4 py-3 w-40 min-w-[160px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                        <th scope="col" className="px-4 py-3 max-w-[200px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                                        <th scope="col" className="px-4 py-3 w-16 min-w-[64px] text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                                        <th scope="col" className="px-4 py-3 w-24 min-w-[96px] text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Subtotal</th>
                                        <th scope="col" className="px-4 py-3 w-20 min-w-[80px] text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Desc</th>
                                        <th scope="col" className="px-4 py-3 w-28 min-w-[112px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                        <th scope="col" className="px-4 py-3 w-24 min-w-[96px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Efectivo</th>
                                        <th scope="col" className="px-4 py-3 w-24 min-w-[96px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Digital</th>
                                        <th scope="col" className="px-4 py-3 w-24 min-w-[96px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">E-Cheq</th>
                                        <th scope="col" className="px-4 py-3 w-24 min-w-[96px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cta. Cte.</th>
                                        <th scope="col" className="px-4 py-3 w-16 min-w-[64px] text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                                    </tr>
                                </thead>
                            </table>
                            <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                                <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
                                    <tbody className="bg-white divide-y-0">
                                    {filteredSales.length > 0 ? filteredSales.map(sale => (
                                            <React.Fragment key={sale.id}>
                                                <SaleRow
                                                    sale={sale}
                                                    onOpenActions={(s) => handleOpenActions(s, 'sale')}
                                                    isAdmin={isAdmin}
                                                />
                                                {sale.creditNotes && sale.creditNotes.map(note => (
                                                    <CreditNoteRow 
                                                        key={note.id} 
                                                        note={note} 
                                                        onReprint={handleReprintCreditNote} 
                                                        onOpenActions={(n) => handleOpenActions(n, 'note')}
                                                    />
                                                ))}
                                            </React.Fragment>
                                        )) : (
                                            <tr>
                                                <td colSpan={13} className="text-center py-10 text-gray-500">
                                                    {noDataMessage}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {saleForCreditNote && saleForCreditNote.customer && (
                <CreditNoteModal
                    isOpen={!!saleForCreditNote}
                    onClose={() => setSaleForCreditNote(null)}
                    customer={saleForCreditNote.customer}
                    products={products}
                    onSave={handleSaveCreditNote}
                    initialItems={saleForCreditNote.items}
                    allCreditNotesForSale={saleForCreditNote.creditNotes}
                />
            )}
            
            <StatDetailModal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                title={modalConfig.title}
                columns={modalConfig.columns}
                data={modalConfig.data}
                summary={modalConfig.summary}
            />
            
            {saleToEdit && (
                <EditSaleModal
                    isOpen={!!saleToEdit}
                    onClose={() => setSaleToEdit(null)}
                    sale={saleToEdit}
                    customers={customers}
                    onSave={handleSaveUpdatedSale}
                />
            )}

            {saleToBill && (
    <BillingModal
        isOpen={!!saleToBill}
        onClose={() => setSaleToBill(null)}
        sale={saleToBill}
        onSuccess={handleBillingSuccess}
        autoOpen={false}
    />
)}


            <ConfirmationModal
                isOpen={!!saleToDeleteId}
                onClose={() => setSaleToDeleteId(null)}
                onConfirm={handleConfirmDelete}
                isProcessing={isProcessingAction}
                title="Anular Venta"
                message="¿Está seguro de que desea anular esta venta? Esta acción revertirá el stock y no se puede deshacer."
                confirmText="Sí, Anular"
            />
            
            {sendModalState.isOpen && sendModalState.sale && (
                <Modal
                    isOpen={sendModalState.isOpen}
                    onClose={() => setSendModalState({ isOpen: false, sale: null })}
                    title={`Reenviar Ticket #${sendModalState.sale.id.slice(0, 8)}`}
                >
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-gray-600">Venta Original para:</p>
                            <p className="font-semibold">{sendModalState.sale.customer?.['Nombre y Apellido'] || 'Consumidor Final'}</p>
                            <p className="font-bold text-lg">${sendModalState.sale.total.toLocaleString('es-AR')}</p>
                        </div>
                        <div>
                            <label htmlFor="send-customer" className="block text-sm font-medium text-gray-700">
                                Seleccionar cliente para enviar por WhatsApp:
                            </label>
                            <div className="mt-1">
                                <SearchableSelect
                                    options={whatsAppCustomers.map(c => ({ value: c.Id_Cliente, label: `${c['Nombre y Apellido']} (${c.Whatsapp})` }))}
                                    value={targetCustomerId}
                                    onChange={(value) => setTargetCustomerId(value)}
                                    placeholder="Buscar cliente para enviar..."
                                />
                            </div>
                        </div>
                        <div className="flex justify-end space-x-2 pt-4">
                            <button
                                type="button"
                                onClick={() => setSendModalState({ isOpen: false, sale: null })}
                                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmAndSend}
                                className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 flex items-center space-x-2"
                            >
                                <Icon path="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.056 3 12s4.03 8.25 9 8.25z" className="w-5 h-5"/>
                                <span>Enviar</span>
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Action Menu (Bottom Sheet on Mobile, Modal on Desktop) */}
            {selectedItemForActions && (
                <div 
                    className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 transition-opacity duration-300`}
                    onClick={() => setSelectedItemForActions(null)}
                >
                    <div 
                        className={`bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl transform transition-transform duration-300 ease-out ${isMobile ? 'animate-slide-up' : 'animate-fade-in-up'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-4 border-b flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-gray-900">
                                    {selectedItemForActions.type === 'sale' ? 'Acciones de Venta' : 'Acciones de Nota de Crédito'}
                                </h3>
                                <p className="text-xs text-gray-500 font-mono">ID: {selectedItemForActions.item.id.slice(0, 8)}</p>
                            </div>
                            <button 
                                onClick={() => setSelectedItemForActions(null)}
                                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                            >
                                <Icon path="M6 18L18 6M6 6l12 12" className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Summary Info (Mobile Friendly) */}
                        <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
                            <div className="text-sm">
                                <p className="font-medium text-gray-700">
                                    {selectedItemForActions.type === 'sale' 
                                        ? ((selectedItemForActions.item as Sale).customer?.['Nombre y Apellido'] || 'Consumidor Final')
                                        : 'Nota de Crédito'}
                                </p>
                                <p className="text-xs text-gray-500">{new Date(selectedItemForActions.item.date).toLocaleString('es-AR')}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-lg text-gray-900">
                                    ${(selectedItemForActions.type === 'sale' 
                                        ? (selectedItemForActions.item as Sale).total 
                                        : (selectedItemForActions.item as AccountTransaction).credit).toLocaleString('es-AR')}
                                </p>
                            </div>
                        </div>

                        {/* Actions List */}
                        <div className="p-2 grid grid-cols-1 gap-1 max-h-[60vh] overflow-y-auto">
                            {selectedItemForActions.type === 'sale' ? (
                                <>
                                    {/* Sale Actions */}
                                    {!(selectedItemForActions.item as Sale).facturaInfo ? (
                                        <button 
                                            onClick={() => { setSaleToBill(selectedItemForActions.item as Sale); setSelectedItemForActions(null); }}
                                            disabled={(selectedItemForActions.item as Sale).status === 'annulled'}
                                            className="flex items-center space-x-3 w-full p-3 text-left hover:bg-blue-50 text-blue-700 rounded-xl transition-colors disabled:opacity-50"
                                        >
                                            <Icon path="M18 3H9v18M9 12h6" className="w-6 h-6" />
                                            <span className="font-medium">Facturar Venta</span>
                                        </button>
                                    ) : (
                                        <div className="flex items-center justify-between p-3 bg-green-50 text-green-700 rounded-xl">
                                            <div className="flex items-center space-x-3">
                                                <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-6 h-6" />
                                                <span className="font-medium">Facturado: {(selectedItemForActions.item as Sale).facturaInfo?.nro}</span>
                                            </div>
                                            {((selectedItemForActions.item as Sale).facturaInfo?.url || (selectedItemForActions.item as Sale).facturaInfo?.ticketUrl) && (
                                                <a 
                                                    href={(selectedItemForActions.item as Sale).facturaInfo?.ticketUrl || (selectedItemForActions.item as Sale).facturaInfo?.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                                                >
                                                    <Icon path="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" className="w-5 h-5" />
                                                </a>
                                            )}
                                        </div>
                                    )}

                                    <button 
                                        onClick={() => { handleView(selectedItemForActions.item as Sale); setSelectedItemForActions(null); }}
                                        className="flex items-center space-x-3 w-full p-3 text-left hover:bg-indigo-50 text-indigo-700 rounded-xl transition-colors"
                                    >
                                        <Icon path="M2.036 12.322a1.012 1.012 0 010-.639l4.418-5.523A1.012 1.012 0 017.5 6h9a1.012 1.012 0 01.946.689l4.418 5.523a1.012 1.012 0 010 .639l-4.418 5.523A1.012 1.012 0 0116.5 18h-9a1.012 1.012 0 01-.946-.689L2.036 12.322zM15 12a3 3 0 11-6 0 3 3 0 016 0z" className="w-6 h-6" />
                                        <span className="font-medium">Ver Ticket Interno</span>
                                    </button>

                                    <button 
                                        onClick={() => { handleOpenSendModal(selectedItemForActions.item as Sale); setSelectedItemForActions(null); }}
                                        disabled={(selectedItemForActions.item as Sale).status === 'annulled'}
                                        className="flex items-center space-x-3 w-full p-3 text-left hover:bg-green-50 text-green-700 rounded-xl transition-colors disabled:opacity-50"
                                    >
                                        <Icon path="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.794 9 8.25z" className="w-6 h-6" />
                                        <span className="font-medium">Enviar por WhatsApp</span>
                                    </button>

                                    <button 
                                        onClick={() => { handleGenerateRemito(selectedItemForActions.item as Sale); setSelectedItemForActions(null); }}
                                        disabled={(selectedItemForActions.item as Sale).status === 'annulled'}
                                        className="flex items-center space-x-3 w-full p-3 text-left hover:bg-gray-100 text-gray-700 rounded-xl transition-colors disabled:opacity-50"
                                    >
                                        <Icon path="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="w-6 h-6" />
                                        <span className="font-medium">Generar Remito</span>
                                    </button>

                                    <button 
                                        onClick={() => { handleAddCreditNote(selectedItemForActions.item as Sale); setSelectedItemForActions(null); }}
                                        disabled={(selectedItemForActions.item as Sale).status === 'annulled' || ((selectedItemForActions.item as Sale).total - ((selectedItemForActions.item as Sale).returnedTotal || 0)) <= 0}
                                        className="flex items-center space-x-3 w-full p-3 text-left hover:bg-orange-50 text-orange-700 rounded-xl transition-colors disabled:opacity-50"
                                    >
                                        <Icon path="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" className="w-6 h-6" />
                                        <span className="font-medium">Generar Nota de Crédito</span>
                                    </button>

                                    {!(selectedItemForActions.item as Sale).status === 'annulled' && (
                                        <button 
                                            onClick={() => { handleEditSale(selectedItemForActions.item as Sale); setSelectedItemForActions(null); }}
                                            className="flex items-center space-x-3 w-full p-3 text-left hover:bg-blue-50 text-blue-700 rounded-xl transition-colors"
                                        >
                                            <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="w-6 h-6" />
                                            <span className="font-medium">Editar Venta</span>
                                        </button>
                                    )}

                                    {isAdmin && (selectedItemForActions.item as Sale).status !== 'annulled' && (
                                        <button 
                                            onClick={() => { handleDeleteRequest((selectedItemForActions.item as Sale).id); setSelectedItemForActions(null); }}
                                            className="flex items-center space-x-3 w-full p-3 text-left hover:bg-red-50 text-red-700 rounded-xl transition-colors"
                                        >
                                            <Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-6 h-6" />
                                            <span className="font-medium">Anular / Borrar Venta</span>
                                        </button>
                                    )}
                                </>
                            ) : (
                                <>
                                    {/* Credit Note Actions */}
                                    <button 
                                        onClick={() => { handleReprintCreditNote(selectedItemForActions.item as AccountTransaction); setSelectedItemForActions(null); }}
                                        className="flex items-center space-x-3 w-full p-3 text-left hover:bg-blue-50 text-blue-700 rounded-xl transition-colors"
                                    >
                                        <Icon path="M6.75 7.5h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75-.75h-10.5a.75.75 0 01-.75-.75V8.25a.75.75 0 01.75-.75z" className="w-6 h-6" />
                                        <span className="font-medium">Reimprimir Nota de Crédito</span>
                                    </button>
                                </>
                            )}
                        </div>
                        
                        {/* Footer Spacer for Mobile Safe Area */}
                        <div className="h-6 sm:h-0"></div>
                    </div>
                    <style>{`
                        @keyframes slide-up {
                            from { transform: translateY(100%); }
                            to { transform: translateY(0); }
                        }
                        .animate-slide-up {
                            animation: slide-up 0.3s ease-out forwards;
                        }
                    `}</style>
                </div>
            )}
        </div>
    );
};
