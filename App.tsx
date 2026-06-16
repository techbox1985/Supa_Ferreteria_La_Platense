import React, { useState, useEffect, useCallback, useMemo, useContext, useRef } from 'react';
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import Header from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { LoginScreen } from './components/auth/LoginScreen';
const POSView = React.lazy(() => import('./components/pos/POSView'));
const CustomersView = React.lazy(() => import('./components/customers/CustomersView'));
const ExpensesView = React.lazy(() => import('./components/expenses/ExpensesView'));
const AdminPanelView = React.lazy(() => import('./components/admin/AdminPanelView'));
const SalesHistoryView = React.lazy(() => import('./components/sales-history/SalesHistoryView'));
const CashierPendingSalesView = React.lazy(() => import('./components/cashier/CashierPendingSalesView'));
const StoreOrdersView = React.lazy(() => import('./components/store-orders/StoreOrdersView'));
const SellerPendingSalesTrackingView = React.lazy(() => import('./components/seller/SellerPendingSalesTrackingView'));
import { BillingCopilotWindow } from './components/shared/BillingCopilotWindow';
import { CustomerStatementModal } from './components/customers/CustomerStatementModal';
import { SyncQueueModal } from './components/sync/SyncQueueModal';
import * as api from './services/api';
import { offlineService } from './services/offlineService';
import {
    Product,
    Customer,
    Sale,
    Expense,
    Shift,
    User,
    CartItem,
    Supplier,
    AccountTransaction,
    ECheq,
} from './types';
import { isDeleted } from './utils/productFilters';
import { calculateCustomerBalance } from './services/api';

// Helper local para parsear números, duplicado de api.ts ya que no se exporta
const parseSheetNumber = (value: any): number => {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value !== 'string' || !value) {
        return 0;
    }
    const sanitizedValue = value.replace(/[$\s.]/g, '').replace(',', '.');
    const number = parseFloat(sanitizedValue);
    return isNaN(number) ? 0 : number;
};

const buildFacturaInfo = (item: any) => {
    const cae = item.Factura_CAE || '';
    const nro = item.Factura_Nro || '';
    const vtoCae = item.Factura_Vto_CAE || '';
    const qrData = item.Factura_QR_Data || '';
    const rawUrl = item.Factura_URL || undefined;
    const rawTicketUrl = item.Factura_Ticket_URL || undefined;
    const url = rawUrl;
    const ticketUrl = rawTicketUrl;

    const hasFactura = Boolean(cae || nro || url || ticketUrl);
    if (!hasFactura) return undefined;

    return {
        cae: String(cae),
        fecha: new Date(item.Factura_Fecha).toLocaleString('es-AR'),
        nro: String(nro),
        vtoCae,
        qrData,
        url,
        ticketUrl,
    };
};

const AppContent: React.FC = () => {
    const { currentUser } = useContext(AuthContext);
    const { addToast } = useToast();
    const initialLoadUserRef = useRef<string | null>(null);
    const initialLoadInFlightRef = useRef(false);

    type View =
        | 'pos' | 'customers' | 'budgets' | 'expenses' | 'sales-history' | 'cashier-pending-sales' | 'store-orders'
        | 'low-stock' | 'seller-tracking'
        | 'admin-products' | 'admin-quick-edit' | 'admin-stock-entry' | 'admin-suppliers'
        | 'admin-users' | 'admin-shifts' | 'admin-monthly-billing' | 'admin-top-products'
        | 'admin-top-customers' | 'admin-printing';
    const [currentView, setCurrentView] = useState<View>('pos');

    // Estados de Datos
    const [products, setProducts] = useState<Product[]>([]);
    const [posProducts, setPosProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [rawSales, setRawSales] = useState<any[]>([]);
    const [historySalesRows, setHistorySalesRows] = useState<any[] | null>(null);
    const [rawBudgets, setRawBudgets] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [rawTransactions] = useState<any[]>([]);
    const [accountTransactions, setAccountTransactions] = useState<any[]>([]);

    // Estados de UI
    const [isLoading, setIsLoading] = useState(true);
    const [isProductsLoading, setIsProductsLoading] = useState(true);
    const [isSalesHistoryLoading, setIsSalesHistoryLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [isSyncQueueOpen, setIsSyncQueueOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isSyncing, setIsSyncing] = useState(false);

    // Estado del Carrito para POS (persistente al cambiar de vista)
    const [cart, setCart] = useState<CartItem[]>([]);
    const [saleBeingEdited, setSaleBeingEdited] = useState<Sale | null>(null);

    // Estado de Modales Globales
    const [customerStatementConfig, setCustomerStatementConfig] = useState<{ isOpen: boolean; customer: Customer | null }>({
        isOpen: false,
        customer: null,
    });

    const getLocalDateString = useCallback((date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);

    const fetchData = useCallback(async () => {
        const isFirstLoad = products.length === 0 && customers.length === 0 && categories.length === 0;

        if (isFirstLoad) {
            setIsLoading(true);
            setIsProductsLoading(true);
        }

        setIsRefreshing(true);

        try {
            // Etapa 1: datos críticos para que el POS aparezca rápido
            const [
                fetchedPosProducts,
                fetchedCustomers,
                fetchedBudgets,
                fetchedCategoriesData,
            ] = await Promise.all([
                api.getProductsForPOS(),
                api.getCustomers(),
                api.getBudgetsSupabase(),
                api.getCategoriesSupabase(),
            ]);

            setPosProducts((fetchedPosProducts || []).filter((p) => !isDeleted(p.Eliminado)));
            setCustomers(fetchedCustomers || []);
            setRawBudgets(fetchedBudgets || []);
            setCategories(
                (fetchedCategoriesData || [])
                    .map((c: any) => c.name)
                    .filter(Boolean)
            );

            // Apenas están los datos críticos, liberamos la pantalla principal
            setIsLoading(false);
            setIsSalesHistoryLoading(false);

            // Etapa 2: datos no críticos para el primer render del POS
            const [
                productsResult,
                salesResult,
                expensesResult,
                shiftsResult,
                usersResult,
                suppliersResult,
                accountTransactionsResult,
            ] = await Promise.allSettled([
                api.getProducts(),
                api.getSales(),
                api.getExpenses(currentUser),
                api.getShifts(),
                api.getUsers(),
                api.getSuppliers(),
                api.getAccountTransactions(),
            ]);

            if (productsResult.status === 'fulfilled') {
                setProducts((productsResult.value || []).filter((p) => !isDeleted(p.Eliminado)));
            } else {
                console.error('Error fetching products:', productsResult.reason);
            }
            setIsProductsLoading(false);

            if (salesResult.status === 'fulfilled') {
                setRawSales(salesResult.value || []);
            } else {
                console.error('Error fetching sales:', salesResult.reason);
            }

            if (expensesResult.status === 'fulfilled') {
                setExpenses(expensesResult.value || []);
            } else {
                console.error('Error fetching expenses:', expensesResult.reason);
            }

            if (shiftsResult.status === 'fulfilled') {
                setShifts(shiftsResult.value || []);
            } else {
                console.error('Error fetching shifts:', shiftsResult.reason);
            }

            if (usersResult.status === 'fulfilled') {
                setAllUsers(usersResult.value || []);
            } else {
                console.error('Error fetching users:', usersResult.reason);
            }

            if (suppliersResult.status === 'fulfilled') {
                setSuppliers(suppliersResult.value || []);
            } else {
                console.error('Error fetching suppliers:', suppliersResult.reason);
            }

            if (accountTransactionsResult.status === 'fulfilled') {
                setAccountTransactions(accountTransactionsResult.value || []);
            } else {
                console.error('Error fetching account transactions:', accountTransactionsResult.reason);
            }
        } catch (error) {
            console.error('Error fetching critical data:', error);
            addToast('Error al cargar los datos principales. Verifique su conexión.', 'error');
            setIsLoading(false);
            setIsProductsLoading(false);
            setIsSalesHistoryLoading(false);
        } finally {
            setIsRefreshing(false);
        }
    }, [addToast, products.length, customers.length, categories.length, currentUser]);

    const fetchSalesForHistoryDateRange = useCallback(async (startDate: string, endDate: string) => {
        setIsSalesHistoryLoading(true);
        try {
            const sales = await api.getSales({ startDate, endDate });
            setHistorySalesRows(sales || []);
        } catch (error) {
            console.error('Error fetching sales by date range:', error);
            addToast('No se pudieron cargar las ventas del rango seleccionado.', 'error');
        } finally {
            setIsSalesHistoryLoading(false);
        }
    }, [addToast]);

    const refreshExpenses = useCallback(async () => {
        const expensesResult = await api.getExpenses(currentUser);
        setExpenses(expensesResult || []);
    }, [currentUser]);

    useEffect(() => {
        if (currentView !== 'sales-history') {
            setHistorySalesRows(null);
            return;
        }

        const today = getLocalDateString(new Date());
        const startDate = currentUser?.Rol === 'Cajero'
            ? getLocalDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))
            : today;
        void fetchSalesForHistoryDateRange(startDate, today);
    }, [currentUser, currentView, fetchSalesForHistoryDateRange, getLocalDateString]);

    useEffect(() => {
        if (!currentUser) {
            initialLoadUserRef.current = null;
            initialLoadInFlightRef.current = false;
            return;
        }

        const userKey = String(currentUser.ID_Usuario || '');
        if (initialLoadUserRef.current === userKey || initialLoadInFlightRef.current) {
            return;
        }

        initialLoadInFlightRef.current = true;
        Promise.resolve(fetchData()).finally(() => {
            initialLoadUserRef.current = userKey;
            initialLoadInFlightRef.current = false;
        });
    }, [currentUser, fetchData]);

    // Listener de estado de red
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Monitoreo de cola de sincronización
    const updatePendingSyncCount = useCallback(async () => {
        const queue = await offlineService.getQueue();
        setPendingSyncCount(queue.length);
    }, []);

    useEffect(() => {
        updatePendingSyncCount();
        const interval = setInterval(updatePendingSyncCount, 5000);
        return () => clearInterval(interval);
    }, [updatePendingSyncCount]);

    const syncQueue = useCallback(async () => {
        if (isSyncing) return;

        const queue = await offlineService.getQueue();
        if (queue.length === 0) return;

        setIsSyncing(true);
        console.debug(`[SYNC_START] Procesando ${queue.length} operaciones.`);

        for (const req of queue) {
            if (req.status === 'error' && req.retryCount && req.retryCount > 0) {
                const waitTime = Math.min(1000 * Math.pow(2, req.retryCount), 60000);
                const timeSinceLastAttempt = Date.now() - (req.timestamp || 0);

                if (timeSinceLastAttempt < waitTime) {
                    console.debug(
                        `[SYNC_BACKOFF] Saltando ${req.id} (esperando ${Math.round((waitTime - timeSinceLastAttempt) / 1000)}s)`
                    );
                    continue;
                }
            }

            addToast('Sincronización offline no soportada: función _forcePostToScript no implementada.', 'error');
            break;
        }

        await updatePendingSyncCount();
        setIsSyncing(false);

        if (queue.length > 0) {
            fetchData();
        }
    }, [isSyncing, updatePendingSyncCount, fetchData, addToast]);

    useEffect(() => {
        if (isOnline && pendingSyncCount > 0 && !isSyncing) {
            const timer = setTimeout(syncQueue, 2000);
            return () => clearTimeout(timer);
        }
    }, [isOnline, pendingSyncCount, isSyncing, syncQueue]);

    // Enriquecer los clientes SOLO con el balance del ledger
    const customersWithCalculatedDebt = useMemo(() => {
        const safeCustomers = Array.isArray(customers) ? customers : [];
        const safeAccountTransactions = Array.isArray(accountTransactions) ? accountTransactions : [];

        if (safeCustomers.length === 0 && safeAccountTransactions.length === 0) return [];

        const transactionsByCustomer = new Map<string, any[]>();

        for (const t of safeAccountTransactions) {
            const customerId = t.customer_id ? String(t.customer_id).trim() : '';
            if (!customerId) continue;

            if (!transactionsByCustomer.has(customerId)) {
                transactionsByCustomer.set(customerId, []);
            }

            transactionsByCustomer.get(customerId)!.push(t);
        }

        return safeCustomers.map((customer) => {
            const customerId = customer.Id_Cliente ? String(customer.Id_Cliente).trim() : '';
            const customerTransactions = transactionsByCustomer.get(customerId) || [];
            const { debt, payments } = calculateCustomerBalance(customerTransactions);
            return { ...customer, Deuda: debt, Pagos: payments };
        });
    }, [customers, accountTransactions]);

    const processedTransactions = useMemo(() => {
        return (Array.isArray(rawTransactions) ? rawTransactions : []).map((t: any, index: number): AccountTransaction => ({
            id: t.ID_Transaccion || t.id || `temp-${index}`,
            date: new Date(t.Fecha || t['Fecha']),
            type: t.Tipo as any,
            description: t.Descripcion || t['Descripcion'],
            debit: parseSheetNumber(t.Debe || t['Debe']),
            credit: parseSheetNumber(t.Haber || t['Haber']),
            balance: parseSheetNumber(t.Saldo || t['Saldo']),
            originalSaleId: t.Venta_Original_ID || t['Venta Original ID'],
            shiftId: t.ID_Turno || t['ID Turno'],
        }));
    }, [rawTransactions]);

    const processedSales = useMemo(() => {
        const safeRawSales = Array.isArray(rawSales) ? rawSales : [];
        const safeRawBudgets = Array.isArray(rawBudgets) ? rawBudgets : [];

        if (isLoading && safeRawSales.length === 0 && safeRawBudgets.length === 0) return [];

        const customersMap: Map<string, Customer> = new Map(
            customersWithCalculatedDebt.map((c: Customer) => [String(c.Id_Cliente), c])
        );

        const creditNotesBySaleId = new Map<string, AccountTransaction[]>();
        processedTransactions.forEach((t: AccountTransaction) => {
            if (t.type === 'Nota de Crédito' && t.originalSaleId) {
                const notes = creditNotesBySaleId.get(t.originalSaleId) || [];
                notes.push(t);
                creditNotesBySaleId.set(t.originalSaleId, notes);
            }
        });

        const processedSaleIds = new Set<string>();
        const finalSales = safeRawSales
            .filter((saleRow) => saleRow.Estado !== 'Pendiente' && saleRow.Estado !== 'Aprobado')
            .reduce((acc: (Sale & { document_type?: string })[], saleRow) => {
                const saleId = saleRow.ID_Venta || saleRow['ID Venta'] || saleRow.IDVenta || saleRow.id;
                if (!saleId || processedSaleIds.has(saleId)) return acc;

                processedSaleIds.add(saleId);

                let items: CartItem[] = [];
                const itemsJsonString = saleRow['Productos (JSON)'] || saleRow['Productos JSON'] || saleRow['Productos(JSON)'];
                if (itemsJsonString && typeof itemsJsonString === 'string') {
                    try {
                        items = JSON.parse(itemsJsonString);
                    } catch (e) {
                        console.error('Error parsing items JSON:', e);
                    }
                }

                let echeqs: ECheq[] = [];
                const echeqsJsonString = saleRow['Echeqs (JSON)'] || saleRow['Echeqs JSON'] || saleRow['Echeqs(JSON)'];
                if (echeqsJsonString && typeof echeqsJsonString === 'string') {
                    try {
                        const parsed = JSON.parse(echeqsJsonString);
                        if (Array.isArray(parsed)) echeqs = parsed;
                    } catch (e) {
                        console.error('Error parsing echeqs JSON:', e);
                    }
                }

                if (echeqs.length === 0) {
                    const echeqAmount = parseSheetNumber(
                        saleRow.Pago_Echeq || saleRow['Pago Echeq'] || saleRow.PagoEcheq
                    );
                    if (echeqAmount > 0) {
                        echeqs.push({
                            amount: echeqAmount,
                            days: parseSheetNumber(saleRow.Echeq_Dias || saleRow['Echeq Dias'] || saleRow.EcheqDias),
                        });
                    }
                }

                const notes = creditNotesBySaleId.get(saleId) || [];
                const returnedTotal = notes.reduce((sum, note) => sum + note.credit, 0);
                const saleStatus: 'active' | 'annulled' =
                    (saleRow.Estado || saleRow['Estado'])?.toLowerCase() === 'anulada' ? 'annulled' : 'active';

                const total = parseSheetNumber(saleRow.Total || saleRow['Total']);
                const subtotal = parseSheetNumber(saleRow.Subtotal || saleRow['Subtotal']) || total;

                const rawCustomerId = saleRow.ID_Cliente || saleRow['ID Cliente'] || saleRow.IDCliente || saleRow.Id_Cliente;
                const customerId = rawCustomerId ? String(rawCustomerId).trim() : '0';

                const saleCustomer: Customer = customersMap.get(customerId) || {
                    Id_Cliente: customerId,
                    'Nombre y Apellido':
                        saleRow.Nombre_Cliente || saleRow['Nombre Cliente'] || saleRow.NombreCliente || 'Consumidor Final',
                    Whatsapp: '',
                    'Tipo.Documento': '',
                    Documento: '',
                    Condicion_IVA: 'Consumidor Final',
                    Deuda: 0,
                    Pagos: 0,
                };

                const facturaInfo = buildFacturaInfo(saleRow);

                const sale: Sale & { document_type?: string } = {
                    id: saleId,
                    saleNumber: parseSheetNumber(saleRow.Nro_Venta || saleRow['Nro Venta'] || saleRow.sale_number || saleRow.saleNumber),
                    date: new Date(saleRow.Fecha || saleRow['Fecha']),
                    customer: saleCustomer,
                    subtotal,
                    total,
                    adjustmentAmount: parseSheetNumber(
                        saleRow.Monto_Ajuste || saleRow['Monto Ajuste'] || saleRow.MontoAjuste
                    ),
                    adjustmentDescription:
                        saleRow.Descripcion_Ajuste || saleRow['Descripcion Ajuste'] || saleRow.DescripcionAjuste || '',
                    payment: {
                        cash: parseSheetNumber(saleRow.Pago_Efectivo || saleRow['Pago Efectivo'] || saleRow.PagoEfectivo),
                        digital: parseSheetNumber(saleRow.Pago_Digital || saleRow['Pago Digital'] || saleRow.PagoDigital),
                        credit: parseSheetNumber(
                            saleRow.Pago_Cuenta_Corriente ||
                                saleRow['Pago Cuenta Corriente'] ||
                                saleRow.PagoCuentaCorriente
                        ),
                        echeqs,
                    },
                    items,
                    itemCount:
                        parseSheetNumber(saleRow.Cant_Productos || saleRow['Cant Productos'] || saleRow.CantProductos) ||
                        items.reduce((sum, i) => sum + i.quantity, 0),
                    status: saleStatus,
                    returnedTotal,
                    creditNotes: notes.sort((a, b) => a.date.getTime() - b.date.getTime()),
                    shiftId: (saleRow.ID_Turno || saleRow['ID Turno'] || saleRow.IDTurno) || undefined,
                    facturacion: (saleRow.Facturacion || saleRow['Facturacion']) || 'N',
                    facturaInfo,
                    isPendingSync: !!saleRow.isPendingSync,
                    document_type: 'sale',
                    customer_discount_percentage: parseSheetNumber(saleRow.Customer_Discount_Percentage) || 0,
                    customer_discount_amount: parseSheetNumber(saleRow.Customer_Discount_Amount) || 0,
                    subtotal_before_customer_discount: saleRow.Subtotal_Before_Customer_Discount != null
                        ? parseSheetNumber(saleRow.Subtotal_Before_Customer_Discount)
                        : undefined,
                    cashierPendingNumber: saleRow.Cashier_Pending_Number ? Number(saleRow.Cashier_Pending_Number) : undefined,
                };

                acc.push(sale);
                return acc;
            }, [])
            .sort((a, b) => b.date.getTime() - a.date.getTime());

        const mappedBudgets: (Sale & { document_type?: string })[] = safeRawBudgets.map((budget: any) => ({
            id: budget.id,
            date: budget.date instanceof Date ? budget.date : new Date(budget.date),
            customer: budget.customer,
            items: Array.isArray(budget.items) ? budget.items : [],
            itemCount: Array.isArray(budget.items)
                ? budget.items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
                : 0,
            subtotal: typeof budget.subtotal === 'number' ? budget.subtotal : Number(budget.total ?? 0),
            adjustmentAmount: typeof budget.adjustmentAmount === 'number' ? budget.adjustmentAmount : 0,
            adjustmentDescription: '',
            total: Number(budget.total ?? 0),
            payment: { cash: 0, digital: 0, credit: 0, echeqs: [] },
            status: 'active',
            returnedTotal: 0,
            creditNotes: [],
            shiftId: budget.shiftId || undefined,
            facturacion: 'N',
            isPendingSync: false,
            converted_to_sale_id: budget.converted_to_sale_id || null,
            document_type: 'budget',
        }));

        return [...finalSales, ...mappedBudgets].sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [rawSales, rawBudgets, isLoading, customersWithCalculatedDebt, processedTransactions]);

    const historyProcessedSales = useMemo(() => {
        const safeHistorySalesRows = Array.isArray(historySalesRows) ? historySalesRows : [];
        const safeRawBudgets = Array.isArray(rawBudgets) ? rawBudgets : [];

        const customersMap: Map<string, Customer> = new Map(
            customersWithCalculatedDebt.map((c: Customer) => [String(c.Id_Cliente), c])
        );

        const creditNotesBySaleId = new Map<string, AccountTransaction[]>();
        processedTransactions.forEach((t: AccountTransaction) => {
            if (t.type === 'Nota de Crédito' && t.originalSaleId) {
                const notes = creditNotesBySaleId.get(t.originalSaleId) || [];
                notes.push(t);
                creditNotesBySaleId.set(t.originalSaleId, notes);
            }
        });

        const processedSaleIds = new Set<string>();
        const mappedHistorySales = safeHistorySalesRows
            .filter((saleRow) => saleRow.Estado !== 'Pendiente' && saleRow.Estado !== 'Aprobado')
            .reduce((acc: (Sale & { document_type?: string })[], saleRow) => {
                const saleId = saleRow.ID_Venta || saleRow['ID Venta'] || saleRow.IDVenta || saleRow.id;
                if (!saleId || processedSaleIds.has(saleId)) return acc;

                processedSaleIds.add(saleId);

                let items: CartItem[] = [];
                const itemsJsonString = saleRow['Productos (JSON)'] || saleRow['Productos JSON'] || saleRow['Productos(JSON)'];
                if (itemsJsonString && typeof itemsJsonString === 'string') {
                    try {
                        items = JSON.parse(itemsJsonString);
                    } catch (e) {
                        console.error('Error parsing history items JSON:', e);
                    }
                }

                let echeqs: ECheq[] = [];
                const echeqsJsonString = saleRow['Echeqs (JSON)'] || saleRow['Echeqs JSON'] || saleRow['Echeqs(JSON)'];
                if (echeqsJsonString && typeof echeqsJsonString === 'string') {
                    try {
                        const parsed = JSON.parse(echeqsJsonString);
                        if (Array.isArray(parsed)) echeqs = parsed;
                    } catch (e) {
                        console.error('Error parsing history echeqs JSON:', e);
                    }
                }

                if (echeqs.length === 0) {
                    const echeqAmount = parseSheetNumber(
                        saleRow.Pago_Echeq || saleRow['Pago Echeq'] || saleRow.PagoEcheq
                    );
                    if (echeqAmount > 0) {
                        echeqs.push({
                            amount: echeqAmount,
                            days: parseSheetNumber(saleRow.Echeq_Dias || saleRow['Echeq Dias'] || saleRow.EcheqDias),
                        });
                    }
                }

                const notes = creditNotesBySaleId.get(saleId) || [];
                const returnedTotal = notes.reduce((sum, note) => sum + note.credit, 0);
                const saleStatus: 'active' | 'annulled' =
                    (saleRow.Estado || saleRow['Estado'])?.toLowerCase() === 'anulada' ? 'annulled' : 'active';

                const total = parseSheetNumber(saleRow.Total || saleRow['Total']);
                const subtotal = parseSheetNumber(saleRow.Subtotal || saleRow['Subtotal']) || total;

                const rawCustomerId = saleRow.ID_Cliente || saleRow['ID Cliente'] || saleRow.IDCliente || saleRow.Id_Cliente;
                const customerId = rawCustomerId ? String(rawCustomerId).trim() : '0';

                const saleCustomer: Customer = customersMap.get(customerId) || {
                    Id_Cliente: customerId,
                    'Nombre y Apellido':
                        saleRow.Nombre_Cliente || saleRow['Nombre Cliente'] || saleRow.NombreCliente || 'Consumidor Final',
                    Whatsapp: '',
                    'Tipo.Documento': '',
                    Documento: '',
                    Condicion_IVA: 'Consumidor Final',
                    Deuda: 0,
                    Pagos: 0,
                };

                const facturaInfo = buildFacturaInfo(saleRow);

                const sale: Sale & { document_type?: string } = {
                    id: saleId,
                    saleNumber: parseSheetNumber(saleRow.Nro_Venta || saleRow['Nro Venta'] || saleRow.sale_number || saleRow.saleNumber),
                    date: new Date(saleRow.Fecha || saleRow['Fecha']),
                    customer: saleCustomer,
                    subtotal,
                    total,
                    adjustmentAmount: parseSheetNumber(
                        saleRow.Monto_Ajuste || saleRow['Monto Ajuste'] || saleRow.MontoAjuste
                    ),
                    adjustmentDescription:
                        saleRow.Descripcion_Ajuste || saleRow['Descripcion Ajuste'] || saleRow.DescripcionAjuste || '',
                    payment: {
                        cash: parseSheetNumber(saleRow.Pago_Efectivo || saleRow['Pago Efectivo'] || saleRow.PagoEfectivo),
                        digital: parseSheetNumber(saleRow.Pago_Digital || saleRow['Pago Digital'] || saleRow.PagoDigital),
                        credit: parseSheetNumber(
                            saleRow.Pago_Cuenta_Corriente ||
                                saleRow['Pago Cuenta Corriente'] ||
                                saleRow.PagoCuentaCorriente
                        ),
                        echeqs,
                    },
                    items,
                    itemCount:
                        parseSheetNumber(saleRow.Cant_Productos || saleRow['Cant Productos'] || saleRow.CantProductos) ||
                        items.reduce((sum, i) => sum + i.quantity, 0),
                    status: saleStatus,
                    returnedTotal,
                    creditNotes: notes.sort((a, b) => a.date.getTime() - b.date.getTime()),
                    shiftId: (saleRow.ID_Turno || saleRow['ID Turno'] || saleRow.IDTurno) || undefined,
                    facturacion: (saleRow.Facturacion || saleRow['Facturacion']) || 'N',
                    facturaInfo,
                    isPendingSync: !!saleRow.isPendingSync,
                    document_type: 'sale',
                    customer_discount_percentage: parseSheetNumber(saleRow.Customer_Discount_Percentage) || 0,
                    customer_discount_amount: parseSheetNumber(saleRow.Customer_Discount_Amount) || 0,
                    subtotal_before_customer_discount: saleRow.Subtotal_Before_Customer_Discount != null
                        ? parseSheetNumber(saleRow.Subtotal_Before_Customer_Discount)
                        : undefined,
                    cashierPendingNumber: saleRow.Cashier_Pending_Number ? Number(saleRow.Cashier_Pending_Number) : undefined,
                };

                acc.push(sale);
                return acc;
            }, [])
            .sort((a, b) => b.date.getTime() - a.date.getTime());

        const mappedBudgets: (Sale & { document_type?: string })[] = safeRawBudgets.map((budget: any) => ({
            id: budget.id,
            date: budget.date instanceof Date ? budget.date : new Date(budget.date),
            customer: budget.customer,
            items: Array.isArray(budget.items) ? budget.items : [],
            itemCount: Array.isArray(budget.items)
                ? budget.items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
                : 0,
            subtotal: typeof budget.subtotal === 'number' ? budget.subtotal : Number(budget.total ?? 0),
            adjustmentAmount: typeof budget.adjustmentAmount === 'number' ? budget.adjustmentAmount : 0,
            adjustmentDescription: '',
            total: Number(budget.total ?? 0),
            payment: { cash: 0, digital: 0, credit: 0, echeqs: [] },
            status: 'active',
            returnedTotal: 0,
            creditNotes: [],
            shiftId: budget.shiftId || undefined,
            facturacion: 'N',
            isPendingSync: false,
            converted_to_sale_id: budget.converted_to_sale_id || null,
            document_type: 'budget',
        }));

        return [...mappedHistorySales, ...mappedBudgets].sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [historySalesRows, rawBudgets, customersWithCalculatedDebt, processedTransactions]);

    // --- POS Handlers ---

    const handleAddToCart = useCallback((product: Product) => {
        setCart((prev: CartItem[]) => {
            const existing = prev.find((i: CartItem) => i.product.cod === product.cod);

            if (existing) {
                return prev.map((i: CartItem) =>
                    i.product.cod === product.cod ? { ...i, quantity: i.quantity + 1 } : i
                );
            }

            let priceToUse = 0;

            if (typeof product['Precio de Oferta'] === 'number' && product['Precio de Oferta'] > 0) {
                priceToUse = product['Precio de Oferta'];
            } else if (typeof product['Precio Final'] === 'number') {
                priceToUse = product['Precio Final'];
            }

            return [...prev, { product, quantity: 1, price: priceToUse }];
        });

        addToast(`Agregado: ${product.Producto}`, 'success');
    }, [addToast]);

    const handleUpdateCartQuantity = useCallback((productId: string, newQuantity: number) => {
        setCart((prev: CartItem[]) => {
            if (newQuantity <= 0) {
                return prev.filter((i: CartItem) => i.product.cod !== productId);
            }

            return prev.map((i: CartItem) =>
                i.product.cod === productId ? { ...i, quantity: newQuantity } : i
            );
        });
    }, []);

    const handleRemoveFromCart = useCallback((productId: string) => {
        setCart((prev: CartItem[]) => prev.filter((i: CartItem) => i.product.cod !== productId));
    }, []);

    const handleClearCart = useCallback(() => {
        setCart([]);
        setSaleBeingEdited(null);
    }, []);

    const handleAddCommonProduct = useCallback(() => {
        const commonProduct: Product = {
            cod: `COMMON_${Date.now()}`,
            Producto: 'Producto Vario',
            Categoria: 'Varios',
            'Precio Final': 0,
            Precio: 0,
            stockk: 9999,
            Minimo: 0,
            Activo: true,
            'Sub Categoria': '',
            Descripcion: 'Producto o servicio no catalogado.',
            'cod.barras': '',
            Proveedor: '',
            'P.Costo': 0,
            'Stock-Inicial': 0,
            Vendidos: 0,
            Ingresos: 0,
            Online: false,
            Imagen: '',
            FOTOGRAFIA: 'https://tolosarefrigeracion.com.ar/wp-content/uploads/2024/12/LOGO-min.png',
            'Ultima.Actualizacion': '',
            'Venta.PV': 0,
        };

        const cartItem: CartItem = {
            product: commonProduct,
            quantity: 1,
            price: 0,
        };

        setCart((prevCart: CartItem[]) => [...prevCart, cartItem]);
        addToast('Producto vario añadido. Edite el nombre y precio.', 'info');
    }, [addToast]);

    const handleUpdateCartItemDetails = useCallback((productId: string, details: { name?: string; price?: number }) => {
        setCart((prevCart: CartItem[]) =>
            prevCart.map((item: CartItem) => {
                if (item.product.cod === productId && item.product.cod.startsWith('COMMON_')) {
                    const newItem = { ...item };

                    if (details.name !== undefined) {
                        newItem.product = { ...newItem.product, Producto: details.name };
                    }

                    if (details.price !== undefined && !isNaN(details.price)) {
                        newItem.price = details.price;
                    }

                    return newItem;
                }

                return item;
            })
        );
    }, []);

    const handleOptimisticAddSale = useCallback((sale: Sale) => {
        const rawSaleObject = {
            ID_Venta: sale.id,
            Nro_Venta: sale.saleNumber,
            Fecha: sale.date,
            ID_Cliente: sale.customer?.Id_Cliente || '0',
            Nombre_Cliente: sale.customer?.['Nombre y Apellido'] || 'Consumidor Final',
            Cant_Productos: sale.itemCount,
            Subtotal: sale.subtotal,
            Total: sale.total,
            Monto_Ajuste: sale.adjustmentAmount || 0,
            Descripcion_Ajuste: sale.adjustmentDescription || '',
            Pago_Efectivo: sale.payment.cash,
            Pago_Digital: sale.payment.digital,
            Pago_Cuenta_Corriente: sale.payment.credit,
            'Productos (JSON)': JSON.stringify(
                sale.items.map((i) => ({
                    product: { cod: i.product.cod, Producto: i.product.Producto, Precio: i.price },
                    quantity: i.quantity,
                }))
            ),
            'Echeqs (JSON)': JSON.stringify(sale.payment.echeqs || []),
            Estado: 'Completada',
            ID_Turno: sale.shiftId,
            Facturacion: sale.facturacion,
            Factura_CAE: sale.facturaInfo?.cae || '',
            Factura_Nro: sale.facturaInfo?.nro || '',
            Factura_Fecha: sale.facturaInfo?.fecha || sale.date,
            Factura_Vto_CAE: sale.facturaInfo?.vtoCae || '',
            Factura_QR_Data: sale.facturaInfo?.qrData || '',
            Factura_URL: sale.facturaInfo?.url || '',
            Factura_Ticket_URL: sale.facturaInfo?.ticketUrl || '',
            isPendingSync: sale.isPendingSync ?? true,
        };

        setRawSales((prev: any[]) => {
            const exists = prev.some((s: any) => (s.ID_Venta || s.id) === sale.id);

            if (exists) {
                return prev.map((s: any) => ((s.ID_Venta || s.id) === sale.id ? rawSaleObject : s));
            }

            return [rawSaleObject, ...prev];
        });

        console.debug(`[SALE_UI_REFRESH_DONE] ID: ${sale.id}`);
    }, []);

    const buildCartFromSale = useCallback((sale: Sale): CartItem[] => {
        return (sale.items || [])
            .map((item, index) => {
                const price = Number(item.price ?? item.product?.Precio ?? 0);
                return {
                    product: {
                        ...item.product,
                        cod: item.product?.cod || `SALE_ITEM_${sale.id}_${index}`,
                        Producto: item.product?.Producto || 'Producto sin nombre',
                        Precio: price,
                    },
                    quantity: Number(item.quantity || 0),
                    price,
                };
            })
            .filter(item => item.quantity > 0);
    }, []);

    const openSaleInPosEditor = useCallback((sale: Sale) => {
        setCart(buildCartFromSale(sale));
        if ((sale as any).document_type === 'budget') {
            setSaleBeingEdited(null);
        } else {
            setSaleBeingEdited(sale);
        }
        setCurrentView('pos');
    }, [buildCartFromSale]);

    useEffect(() => {
        const handler = (e: any) => {
            if (!e.detail) return;
            openSaleInPosEditor(e.detail);
        };

        window.addEventListener('edit-sale', handler);
        return () => window.removeEventListener('edit-sale', handler);
    }, [openSaleInPosEditor]);

    const handleEditSale = useCallback((sale: Sale) => {
        openSaleInPosEditor(sale);
    }, [openSaleInPosEditor]);

    const renderView = () => {
        const cashierAllowedViews: View[] = ['cashier-pending-sales', 'sales-history', 'customers', 'expenses', 'store-orders'];
        const effectiveView = (currentUser?.Rol === 'Cajero' && !cashierAllowedViews.includes(currentView))
            ? 'cashier-pending-sales'
            : currentView;
        if (effectiveView.startsWith('admin-') || effectiveView === 'low-stock') {
            const subView = effectiveView === 'low-stock' ? 'low-stock-admin' : effectiveView.slice(6);
            return (
                <AdminPanelView
                    products={products}
                    customers={customersWithCalculatedDebt}
                    suppliers={suppliers}
                    allUsers={allUsers}
                    processedSales={processedSales}
                    historyProcessedSales={historyProcessedSales}
                    shifts={shifts}
                    isLoading={isLoading || isProductsLoading}
                    refreshData={fetchData}
                    fetchSalesForDateRange={fetchSalesForHistoryDateRange}
                    currentSubView={subView}
                    onEditSale={handleEditSale}
                />
            );
        }
        switch (effectiveView) {
            case 'pos':
                return (
                    <POSView
                        onNavigateBudgets={() => setCurrentView('budgets')}
                        products={posProducts}
                        categories={categories}
                        customers={customersWithCalculatedDebt}
                        refreshData={fetchData}
                        isLoading={isLoading}
                        cart={cart}
                        onAddToCart={handleAddToCart}
                        onUpdateQuantity={handleUpdateCartQuantity}
                        onRemoveItem={handleRemoveFromCart}
                        onClearCart={handleClearCart}
                        onAddCommonProduct={handleAddCommonProduct}
                        onUpdateCartItemDetails={handleUpdateCartItemDetails}
                        saleBeingEdited={saleBeingEdited}
                        onClearSaleBeingEdited={() => setSaleBeingEdited(null)}
                        onOptimisticAddSale={handleOptimisticAddSale}
                    />
                );

            case 'customers':
                return (
                    <CustomersView
                        products={products}
                        customers={customersWithCalculatedDebt}
                        refreshData={fetchData}
                        isLoading={isLoading}
                        onViewStatement={(customer) => setCustomerStatementConfig({ isOpen: true, customer })}
                    />
                );

            case 'expenses':
                return (
                    <ExpensesView
                        expenses={expenses}
                        shifts={shifts}
                        allUsers={allUsers}
                        isLoading={isLoading}
                        refreshExpenses={refreshExpenses}
                    />
                );

            case 'sales-history':
                return (
                    <SalesHistoryView
                        processedSales={historyProcessedSales}
                        products={products}
                        customers={customersWithCalculatedDebt}
                        allUsers={allUsers}
                        shifts={shifts}
                        isLoading={isLoading || isSalesHistoryLoading}
                        refreshData={fetchData}
                        fetchSalesForDateRange={fetchSalesForHistoryDateRange}
                        onEditSale={handleEditSale}
                        accountTransactions={accountTransactions}
                    />
                );

            case 'cashier-pending-sales':
                return <CashierPendingSalesView customers={customersWithCalculatedDebt} refreshData={fetchData} />;

            case 'store-orders':
                return <StoreOrdersView />;

            case 'seller-tracking':
                return <SellerPendingSalesTrackingView />;

            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans">
            <Header
                onRefresh={fetchData}
                isRefreshing={isRefreshing}
                isOnline={isOnline}
                pendingSyncCount={pendingSyncCount}
                onOpenSyncQueue={() => setIsSyncQueueOpen(true)}
            />

            <div className="flex flex-1 overflow-hidden">
                <Sidebar
                    currentView={currentView}
                    onNavigate={(view) => setCurrentView(view)}
                    isAdmin={currentUser?.Rol === 'Admin'}
                    canSeeLowStock={currentUser?.Rol === 'Admin' || currentUser?.Rol === 'Vendedor'}
                    currentUser={currentUser}
                />
                <main className="flex-grow overflow-y-auto relative">
                <React.Suspense
                    fallback={
                        <div className="flex items-center justify-center h-full w-full min-h-[200px]">
                            <div className="flex flex-col items-center">
                                <svg
                                    className="animate-spin h-8 w-8 text-blue-500 mb-2"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                                </svg>
                                <span className="text-gray-500">Cargando...</span>
                            </div>
                        </div>
                    }
                >
                    {renderView()}
                </React.Suspense>
                </main>
            </div>

            {customerStatementConfig.isOpen &&
                customerStatementConfig.customer &&
                typeof customerStatementConfig.customer === 'object' && (
                    <CustomerStatementModal
                        isOpen={!!customerStatementConfig.isOpen}
                        onClose={() => setCustomerStatementConfig({ isOpen: false, customer: null })}
                        customer={customerStatementConfig.customer}
                        allSales={processedSales}
                        isAdmin={currentUser?.Rol === 'Admin'}
                        refreshData={fetchData}
                    />
                )}

            <SyncQueueModal
                isOpen={isSyncQueueOpen}
                onClose={() => setIsSyncQueueOpen(false)}
                syncQueue={syncQueue}
                onQueueChanged={updatePendingSyncCount}
                customers={customers}
            />
        </div>
    );
};

const App: React.FC = () => {
    if (window.location.pathname === '/billing-assistant') {
        return (
            <ToastProvider>
                <BillingCopilotWindow />
            </ToastProvider>
        );
    }

    return (
        <AuthProvider>
            <ToastProvider>
                <LoginScreen>
                    <AppContent />
                </LoginScreen>
            </ToastProvider>
        </AuthProvider>
    );
};

export default App;
