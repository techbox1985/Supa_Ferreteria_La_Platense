import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import Header from './components/layout/Header';
import { LoginScreen } from './components/auth/LoginScreen';
const POSView = React.lazy(() => import('./components/pos/POSView'));
const CustomersView = React.lazy(() => import('./components/customers/CustomersView'));
const ExpensesView = React.lazy(() => import('./components/expenses/ExpensesView'));
const AdminPanelView = React.lazy(() => import('./components/admin/AdminPanelView'));
const SalesHistoryView = React.lazy(() => import('./components/sales-history/SalesHistoryView'));
import { BillingCopilotWindow } from './components/shared/BillingCopilotWindow';
import { CustomerStatementModal } from './components/customers/CustomerStatementModal';
import { SyncQueueModal } from './components/sync/SyncQueueModal';
import * as api from './services/api';
import { offlineService } from './services/offlineService';
import { Product, Customer, Sale, Expense, Shift, User, CartItem, Supplier, AccountTransaction, ECheq } from './types';
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

const AppContent: React.FC = () => {
    const { currentUser } = useContext(AuthContext);
    const { addToast } = useToast();
    type View = 'pos' | 'customers' | 'budgets' | 'expenses' | 'admin-panel' | 'sales-history';
    const [currentView, setCurrentView] = useState<View>('pos');
    
    // Estados de Datos
    const [products, setProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [rawSales, setRawSales] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
const [suppliers, setSuppliers] = useState<Supplier[]>([]);
const [categories, setCategories] = useState<string[]>([]);
const [rawTransactions] = useState<any[]>([]);
const [accountTransactions, setAccountTransactions] = useState<any[]>([]);
    
    // Estados de UI
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [isSyncQueueOpen, setIsSyncQueueOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Estado del Carrito para POS (persistente al cambiar de vista)
    const [cart, setCart] = useState<CartItem[]>([]);
    const [saleBeingEdited, setSaleBeingEdited] = useState<Sale | null>(null);

    // Estado de Modales Globales
    const [customerStatementConfig, setCustomerStatementConfig] = useState<{ isOpen: boolean; customer: Customer | null }>({ isOpen: false, customer: null });

const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
        const fetchedProducts = await api.getProducts();
        setProducts(fetchedProducts.filter(p => !isDeleted(p.Eliminado)));

        const fetchedCustomers = await api.getCustomers();
        setCustomers(fetchedCustomers);

        const fetchedSales = await api.getSales();
        setRawSales(fetchedSales);

        const fetchedExpenses = await api.getExpenses();
        setExpenses(fetchedExpenses);

        const fetchedShifts = await api.getShifts();
        setShifts(fetchedShifts);

        const fetchedUsers = await api.getUsers();
        setAllUsers(fetchedUsers);

const fetchedSuppliers = await api.getSuppliers();
setSuppliers(fetchedSuppliers);

const fetchedCategoriesData = await api.getCategoriesSupabase();
setCategories((fetchedCategoriesData || []).map((c: any) => c.name).filter(Boolean));

const fetchedAccountTransactions = await api.getAccountTransactions();
setAccountTransactions(fetchedAccountTransactions);

    } catch (error) {
        console.error("Error fetching data:", error);
        addToast("Error al cargar los datos. Verifique su conexión.", 'error');
    } finally {
        setIsLoading(false);
        setIsRefreshing(false);
    }
}, [addToast]);

    useEffect(() => {
        if (currentUser) {
            fetchData();
        }
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

    const [isSyncing, setIsSyncing] = useState(false);

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
            // BACKOFF: Si tiene errores previos, esperar un tiempo proporcional a los reintentos
            if (req.status === 'error' && req.retryCount && req.retryCount > 0) {
                const waitTime = Math.min(1000 * Math.pow(2, req.retryCount), 60000); // Max 1 min
                const timeSinceLastAttempt = Date.now() - (req.timestamp || 0);
                if (timeSinceLastAttempt < waitTime) {
                    console.debug(`[SYNC_BACKOFF] Saltando ${req.id} (esperando ${Math.round((waitTime - timeSinceLastAttempt)/1000)}s)`);
                    continue;
                }
            }

                // _forcePostToScript ya no existe; aislar para evitar crash
                addToast('Sincronización offline no soportada: función _forcePostToScript no implementada.', 'error');
                break; 
        }
        
        await updatePendingSyncCount();
        setIsSyncing(false);
        
        // Si hay cambios, refrescar datos
        if (queue.length > 0) {
            fetchData();
        }
    }, [isSyncing, updatePendingSyncCount, fetchData]);

    useEffect(() => {
        if (isOnline && pendingSyncCount > 0 && !isSyncing) {
            const timer = setTimeout(syncQueue, 2000); // Pequeño delay para estabilidad
            return () => clearTimeout(timer);
        }
    }, [isOnline, pendingSyncCount, isSyncing, syncQueue]);

    // --- Lógica de Procesamiento de Datos ---

    // Enriquecer los clientes SOLO con el balance del ledger
    const customersWithCalculatedDebt = useMemo(() => {
        const safeCustomers = Array.isArray(customers) ? customers : [];
        const safeAccountTransactions = Array.isArray(accountTransactions) ? accountTransactions : [];
        if (safeCustomers.length === 0 && safeAccountTransactions.length === 0) return [];

        // Agrupar transacciones estrictamente por customer_id
        const transactionsByCustomer = new Map();
        for (const t of safeAccountTransactions) {
            const customerId = t.customer_id ? String(t.customer_id).trim() : '';
            if (!customerId) continue;
            if (!transactionsByCustomer.has(customerId)) transactionsByCustomer.set(customerId, []);
            transactionsByCustomer.get(customerId).push(t);
        }

        return safeCustomers.map(customer => {
            const customerId = customer.Id_Cliente ? String(customer.Id_Cliente).trim() : '';
            const customerTransactions = transactionsByCustomer.get(customerId) || [];
            const { debt, payments } = calculateCustomerBalance(customerTransactions);
            return { ...customer, Deuda: debt, Pagos: payments };
        });
    }, [customers, accountTransactions]);

    // Mover processedTransactions ANTES de processedSales para evitar undefined
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
            shiftId: t.ID_Turno || t['ID Turno']
        }));
    }, [rawTransactions]);

    const processedSales = useMemo(() => {
        // ...existing code...
        const safeRawSales = Array.isArray(rawSales) ? rawSales : [];
        // ...existing code...
        if (isLoading && safeRawSales.length === 0) return [];

        const customersMap: Map<string, Customer> = new Map(customersWithCalculatedDebt.map((c: Customer) => [String(c.Id_Cliente), c]));

        // hydratedTransactions era una referencia inconsistente, reemplazamos por processedTransactions
        const creditNotesBySaleId = new Map<string, AccountTransaction[]>();
        processedTransactions.forEach((t: AccountTransaction) => {
            if (t.type === 'Nota de Crédito' && t.originalSaleId) {
                const notes = creditNotesBySaleId.get(t.originalSaleId) || [];
                notes.push(t);
                creditNotesBySaleId.set(t.originalSaleId, notes);
            }
        });
        
        const processedSaleIds = new Set<string>();
        const finalSales = (safeRawSales)
            .filter(saleRow => saleRow.Estado !== 'Pendiente' && saleRow.Estado !== 'Aprobado')
            .reduce((acc: Sale[], saleRow) => {
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
                    const echeqAmount = parseSheetNumber(saleRow.Pago_Echeq || saleRow['Pago Echeq'] || saleRow.PagoEcheq);
                    if (echeqAmount > 0) echeqs.push({ amount: echeqAmount, days: parseSheetNumber(saleRow.Echeq_Dias || saleRow['Echeq Dias'] || saleRow.EcheqDias) });
                }

                const notes = creditNotesBySaleId.get(saleId) || [];
                const returnedTotal = notes.reduce((sum, note) => sum + note.credit, 0);
                const saleStatus: 'active' | 'annulled' = (saleRow.Estado || saleRow['Estado'])?.toLowerCase() === 'anulada' ? 'annulled' : 'active';
                
                const total = parseSheetNumber(saleRow.Total || saleRow['Total']);
                const subtotal = parseSheetNumber(saleRow.Subtotal || saleRow['Subtotal']) || total;
                
                const rawCustomerId = saleRow.ID_Cliente || saleRow['ID Cliente'] || saleRow.IDCliente || saleRow.Id_Cliente;
                const customerId = rawCustomerId ? String(rawCustomerId).trim() : '0';
                const saleCustomer: Customer = customersMap.get(customerId) || {
                  Id_Cliente: customerId, 'Nombre y Apellido': saleRow.Nombre_Cliente || saleRow['Nombre Cliente'] || saleRow.NombreCliente || 'Consumidor Final',
                  Whatsapp: '', 'Tipo.Documento': '', Documento: '', Condicion_IVA: 'Consumidor Final', Deuda: 0, Pagos: 0,
                };

                const facturaCae = saleRow.Factura_CAE || saleRow['Factura CAE'] || saleRow.FacturaCAE;
                const facturaInfo = facturaCae ? {
                    cae: String(facturaCae),
                    fecha: new Date(saleRow.Factura_Fecha || saleRow['Factura Fecha'] || saleRow.FacturaFecha).toLocaleString('es-AR'),
                    nro: String(saleRow.Factura_Nro || saleRow['Factura Nro'] || saleRow.FacturaNro || ''),
                    vtoCae: saleRow.Factura_Vto_CAE || saleRow['Factura Vto CAE'] || saleRow.FacturaVtoCAE || '',
                    qrData: saleRow.Factura_QR_Data || saleRow['Factura QR Data'] || saleRow.FacturaQRData || '',
                    url: saleRow.Factura_URL || saleRow['Factura URL'] || saleRow.FacturaURL || undefined,
                    ticketUrl: saleRow.Factura_Ticket_URL || saleRow['Factura Ticket URL'] || undefined
                } : undefined;

                const sale: Sale = {
                    id: saleId, date: new Date(saleRow.Fecha || saleRow['Fecha']), customer: saleCustomer, subtotal, total,
                    adjustmentAmount: parseSheetNumber(saleRow.Monto_Ajuste || saleRow['Monto Ajuste'] || saleRow.MontoAjuste), 
                    adjustmentDescription: saleRow.Descripcion_Ajuste || saleRow['Descripcion Ajuste'] || saleRow.DescripcionAjuste || '',
                    payment: { 
                      cash: parseSheetNumber(saleRow.Pago_Efectivo || saleRow['Pago Efectivo'] || saleRow.PagoEfectivo), 
                      digital: parseSheetNumber(saleRow.Pago_Digital || saleRow['Pago Digital'] || saleRow.PagoDigital),
                      credit: parseSheetNumber(saleRow.Pago_Cuenta_Corriente || saleRow['Pago Cuenta Corriente'] || saleRow.PagoCuentaCorriente), 
                      echeqs: echeqs,
                    },
                    items,
                    itemCount: parseSheetNumber(saleRow.Cant_Productos || saleRow['Cant Productos'] || saleRow.CantProductos) || items.reduce((sum, i) => sum + i.quantity, 0),
                    status: saleStatus, returnedTotal, creditNotes: notes.sort((a,b) => a.date.getTime() - b.date.getTime()),
                    shiftId: (saleRow.ID_Turno || saleRow['ID Turno'] || saleRow.IDTurno) || undefined, 
                    facturacion: (saleRow.Facturacion || saleRow['Facturacion']) || 'N', facturaInfo,
                    isPendingSync: !!saleRow.isPendingSync
                };
                
                acc.push(sale);
                return acc;

            }, [])
            .sort((a, b) => b.date.getTime() - a.date.getTime());

        return finalSales;
    }, [products, rawSales, rawTransactions, isLoading, customersWithCalculatedDebt, processedTransactions]);

    // --- POS Handlers ---

    const handleAddToCart = useCallback((product: Product) => {
        setCart((prev: CartItem[]) => {
            const existing = prev.find((i: CartItem) => i.product.cod === product.cod);
            if (existing) {
                return prev.map((i: CartItem) => i.product.cod === product.cod ? { ...i, quantity: i.quantity + 1 } : i);
            }
            let priceToUse: number = 0;
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
            if (newQuantity <= 0) return prev.filter((i: CartItem) => i.product.cod !== productId);
            return prev.map((i: CartItem) => i.product.cod === productId ? { ...i, quantity: newQuantity } : i);
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
        setCart((prevCart: CartItem[]) => prevCart.map((item: CartItem) => {
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
        }));
    }, []);

    const handleOptimisticAddSale = useCallback((sale: Sale) => {
        // Mapeamos para que coincida con el shape de rawSales que espera el useMemo (snake_case de la hoja)
        const rawSaleObject = {
            ID_Venta: sale.id,
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
            'Productos (JSON)': JSON.stringify(sale.items.map(i => ({
                product: { cod: i.product.cod, Producto: i.product.Producto, Precio: i.price },
                quantity: i.quantity
            }))),
            'Echeqs (JSON)': JSON.stringify(sale.payment.echeqs || []),
            Estado: 'Completada',
            ID_Turno: sale.shiftId,
            Facturacion: sale.facturacion,
            isPendingSync: sale.isPendingSync ?? true
        };

        setRawSales((prev: any[]) => {
            // Evitar duplicados si el refresh ocurre justo después del optimistic
            const exists = prev.some((s: any) => (s.ID_Venta || s.id) === sale.id);
            if (exists) {
                return prev.map((s: any) => (s.ID_Venta || s.id) === sale.id ? rawSaleObject : s);
            }
            return [rawSaleObject, ...prev];
        });
        console.debug(`[SALE_UI_REFRESH_DONE] ID: ${sale.id}`);
    }, []);


    // Manejo de handoff de edición de venta
    React.useEffect(() => {
        const handler = (e: any) => {
            if (!e.detail) return;
            setSaleBeingEdited(e.detail);
            setCurrentView('pos');
        };
        window.addEventListener('edit-sale', handler);
        return () => window.removeEventListener('edit-sale', handler);
    }, []);

    // Handler para editar venta desde SalesHistoryView
    const handleEditSale = (sale: Sale) => {
        setSaleBeingEdited(sale);
        setCurrentView('pos');
    };

    const renderView = () => {
        switch (currentView) {
            case 'pos':
                return <POSView 
                    onNavigateBudgets={() => setCurrentView('budgets')}
                    products={products} 
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
                />;
            case 'customers':
                return <CustomersView 
                    products={products} 
                    customers={customersWithCalculatedDebt} 
                    refreshData={fetchData} 
                    isLoading={isLoading} 
                    onViewStatement={(customer) => setCustomerStatementConfig({ isOpen: true, customer })}
                />;
            case 'expenses':
                return <ExpensesView expenses={expenses} shifts={shifts} allUsers={allUsers} isLoading={isLoading} refreshData={fetchData} />;
            case 'admin-panel':
                return <AdminPanelView 
                    products={products} 
                    customers={customersWithCalculatedDebt} 
                    suppliers={suppliers} 
                    allUsers={allUsers} 
                    processedSales={processedSales} 
                    shifts={shifts} 
                    isLoading={isLoading} 
                    refreshData={fetchData} 
                />;
            case 'sales-history':
                return <SalesHistoryView 
                    processedSales={processedSales} 
                    products={products} 
                    customers={customersWithCalculatedDebt} 
                    allUsers={allUsers} 
                    shifts={shifts} 
                    isLoading={isLoading} 
                    refreshData={fetchData} 
                    onEditSale={handleEditSale}
                />;
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans">
            <Header 
                currentView={currentView} 
                onNavigate={(view: View) => setCurrentView(view)} 
                onRefresh={fetchData} 
                isRefreshing={isRefreshing}
                isOnline={isOnline}
                pendingSyncCount={pendingSyncCount}
                onOpenSyncQueue={() => setIsSyncQueueOpen(true)}
            />
            <main className="flex-grow overflow-y-auto relative">
                <React.Suspense fallback={
                    <div className="flex items-center justify-center h-full w-full min-h-[200px]">
                        <div className="flex flex-col items-center">
                            <svg className="animate-spin h-8 w-8 text-blue-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                            </svg>
                            <span className="text-gray-500">Cargando...</span>
                        </div>
                    </div>
                }>
                    {renderView()}
                </React.Suspense>
            </main>
            
            {customerStatementConfig.isOpen && customerStatementConfig.customer && typeof customerStatementConfig.customer === 'object' && (
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
    // Route check for independent window
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
}

export default App;
