
import React, { useState, useEffect, useMemo, useContext, useCallback } from 'react';
import { Product, Customer, CartItem, Budget, Sale } from '../../types';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { generateBudgetHtml, generateReceiptHtml, generateInvoiceHtml } from '../pos/Receipt';
// import { ConvertBudgetModal } from './ConvertBudgetModal'; // REMOVED: Replaced by CheckoutModal
import { CheckoutModal } from '../pos/CheckoutModal'; // ADDED
import { ProductCard } from '../pos/ProductCard';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { CustomerFormModal } from '../customers/CustomerFormModal';
import { Modal } from '../ui/Modal';
import { SearchableSelect } from '../ui/SearchableSelect';
import { ProductDetailModal } from '../pos/ProductDetailModal';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { CompleteCustomerDataModal } from './CompleteCustomerDataModal';
import { getPrintStyles } from '../../utils/printStyles'; // ADDED
import { sendTicketViaWhatsApp } from '../../utils/whatsappHelper'; // ADDED

const statusStyles = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
};

const statusDisplay = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado'
};

const BudgetCartItem: React.FC<{
    item: CartItem;
    onUpdateQuantity: (productId: string, quantity: number) => void;
    onRemoveItem: (productId: string) => void;
    onUpdateCartItemDetails: (productId: string, details: { name?: string; price?: number }) => void;
}> = React.memo(({ item, onUpdateQuantity, onRemoveItem, onUpdateCartItemDetails }) => {
    const isCommonProduct = item.product.cod.startsWith('COMMON_');

    return (
        <div className="flex items-center justify-between py-2">
            {isCommonProduct ? (
                <div className="flex-1 min-w-0 space-y-2">
                    <input
                        type="text"
                        value={item.product.Producto}
                        onChange={(e) => onUpdateCartItemDetails(item.product.cod, { name: e.target.value })}
                        className="w-full text-sm font-semibold border border-gray-300 rounded-md py-1 px-2"
                        placeholder="Nombre del producto"
                        aria-label="Nombre del producto vario"
                    />
                    <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={item.price}
                            onChange={(e) => onUpdateCartItemDetails(item.product.cod, { price: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                            className="w-full text-sm border border-gray-300 rounded-md py-1 pl-6"
                            placeholder="Precio"
                            aria-label="Precio del producto vario"
                        />
                    </div>
                </div>
            ) : (
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate" title={item.product.Producto}>{item.product.Producto}</p>
                    <p className="text-gray-500 text-xs">${item.price.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                </div>
            )}
            <div className="flex items-center space-x-2 ml-2">
                <input
                    type="number"
                    step="any"
                    min="0"
                    value={item.quantity}
                    onChange={(e) => onUpdateQuantity(item.product.cod, parseFloat(e.target.value) || 0)}
                    className="w-14 text-center border border-gray-300 rounded-md py-1"
                />
                <button onClick={() => onRemoveItem(item.product.cod)} className="text-red-500 hover:text-red-700 p-1">
                    <Icon path="M6 18L18 6M6 6l12 12" className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
});
BudgetCartItem.displayName = 'BudgetCartItem';


interface BudgetsViewProps {
  products: Product[];
  customers: Customer[];
  isLoading: boolean;
  refreshData: () => void;
  onOptimisticAddSale: (sale: Sale) => void;
}

export const BudgetsView: React.FC<BudgetsViewProps> = ({ products, customers, isLoading, refreshData, onOptimisticAddSale }) => {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [budgetToEdit, setBudgetToEdit] = useState<Budget | null>(null);
    const [budgetToConvert, setBudgetToConvert] = useState<Budget | null>(null);
    const [isConvertingBudget, setIsConvertingBudget] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [budgetSearchTerm, setBudgetSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [productForDetail, setProductForDetail] = useState<Product | null>(null);
    
    const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
    const [isSavingBudget, setIsSavingBudget] = useState(false);
    const [isCustomerFormOpen, setCustomerFormOpen] = useState(false);
    const [newlyCreatedCustomerName, setNewlyCreatedCustomerName] = useState<string | null>(null);
    
    const [sendModalState, setSendModalState] = useState<{ isOpen: boolean; budget: Budget | null }>({ isOpen: false, budget: null });
    const [targetCustomerId, setTargetCustomerId] = useState<string>('');
    
    const [budgetIdToDelete, setBudgetIdToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const [customerDataCompletion, setCustomerDataCompletion] = useState<{
        isOpen: boolean;
        customer: Customer | null;
        onComplete: (customer: Customer) => void;
    }>({ isOpen: false, customer: null, onComplete: () => {} });

    const { activeShift } = useContext(AuthContext);
    const { addToast } = useToast();

    const categories = useMemo(() => ['All', ...new Set(products.map(p => p.Categoria))], [products]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesCategory = selectedCategory === 'All' || p.Categoria === selectedCategory;
            const lowerSearchTerm = searchTerm.toLowerCase();
            const matchesSearch = 
                String(p.Producto || '').toLowerCase().includes(lowerSearchTerm) ||
                String(p.cod || '').toLowerCase().includes(lowerSearchTerm) ||
                String(p['cod.barras'] || '').toLowerCase().includes(lowerSearchTerm);
            const hasPrice = p['Precio Final'] > 0;
            const isActive = p.Activo === true;
            return matchesCategory && matchesSearch && hasPrice && isActive;
        });
    }, [products, searchTerm, selectedCategory]);

    const budgetableCustomers = useMemo(() => customers.sort((a, b) => {
        if (a.Id_Cliente === '0') return -1;
        if (b.Id_Cliente === '0') return 1;
        return a['Nombre y Apellido'].localeCompare(b['Nombre y Apellido']);
    }), [customers]);

    const whatsAppCustomers = useMemo(() => customers.filter(c => c.Id_Cliente !== '0' && c.Whatsapp).sort((a,b) => a['Nombre y Apellido'].localeCompare(b['Nombre y Apellido'])), [customers]);

    const fetchBudgets = useCallback(async () => {
        const fetchedBudgets = await api.getBudgets();
        const productsMap = new Map(products.map(p => [p.cod, p]));
        const customersMap = new Map(customers.map(c => [String(c.Id_Cliente), c]));

        const fullCustomerBudgets = fetchedBudgets.map(budget => {
            const customerDetails = customersMap.get(String(budget.customer.Id_Cliente));
            const hydratedItems = budget.items.map(item => ({
                ...item,
                product: productsMap.get(item.product.cod) || item.product
            }));
            return {
                ...budget,
                items: hydratedItems,
                customer: customerDetails || budget.customer, 
            }
        }).filter(b => b.customer);
        setBudgets(fullCustomerBudgets);
    }, [products, customers]);
    
    const filteredBudgets = useMemo(() => {
        if (!budgetSearchTerm) {
            return budgets;
        }
        const lowercasedFilter = budgetSearchTerm.toLowerCase();
        return budgets.filter(budget =>
            (budget.customer['Nombre y Apellido']?.toLowerCase().includes(lowercasedFilter)) ||
            (budget.id.toLowerCase().includes(lowercasedFilter))
        );
    }, [budgets, budgetSearchTerm]);


    useEffect(() => {
        if(customers.length > 0 && products.length > 0) {
            fetchBudgets();
        }
    }, [customers, products, fetchBudgets]);
    
    useEffect(() => {
        if(budgetableCustomers.length > 0 && !selectedCustomer){
            const finalConsumer = budgetableCustomers.find(c => c.Id_Cliente === '0' || (c['Nombre y Apellido'] || '').toLowerCase() === 'consumidor final');
            setSelectedCustomer(finalConsumer || budgetableCustomers[0]);
        }
    }, [budgetableCustomers, selectedCustomer]);
    
    useEffect(() => {
        if (newlyCreatedCustomerName && customers.length > 0) {
            const candidates = customers.filter(c => c['Nombre y Apellido'] === newlyCreatedCustomerName);
            if (candidates.length > 0) {
                const newCustomer = candidates.reduce((latest, current) => 
                    parseInt(String(current.Id_Cliente)) > parseInt(String(latest.Id_Cliente)) ? current : latest
                );
                setSelectedCustomer(newCustomer);
            }
            setNewlyCreatedCustomerName(null);
        }
    }, [customers, newlyCreatedCustomerName]);
    
    useEffect(() => {
        if (sendModalState.isOpen && sendModalState.budget) {
            const originalCustomerId = sendModalState.budget.customer?.Id_Cliente;
            const customerExists = whatsAppCustomers.some(c => c.Id_Cliente === originalCustomerId);
            if (originalCustomerId && customerExists) {
                setTargetCustomerId(originalCustomerId);
            } else if (whatsAppCustomers.length > 0) {
                setTargetCustomerId(whatsAppCustomers[0].Id_Cliente);
            } else {
                setTargetCustomerId('');
            }
        }
    }, [sendModalState, whatsAppCustomers]);


    const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);

    const addToCart = useCallback((product: Product) => {
        setCart(prev => {
            const existing = prev.find(i => i.product.cod === product.cod);
            if (existing) {
                return prev.map(i => i.product.cod === product.cod ? { ...i, quantity: i.quantity + 1 } : i);
            }
            const priceToUse = (product['Precio de Oferta'] && product['Precio de Oferta'] > 0)
                ? product['Precio de Oferta']
                : product['Precio Final'];
            return [...prev, { product, quantity: 1, price: priceToUse }];
        });
    }, []);

    const updateQuantity = useCallback((productId: string, quantity: number) => {
        setCart(prev => {
            if (quantity > 0) {
                return prev.map(i => i.product.cod === productId ? { ...i, quantity } : i);
            }
            return prev.filter(i => i.product.cod !== productId);
        });
    }, []);

    const removeFromCart = useCallback((productId: string) => {
        setCart(prev => prev.filter(i => i.product.cod !== productId));
    }, []);

    const clearCart = useCallback(() => {
        setCart([]);
    }, []);
    
    const addCommonProductToBudget = useCallback(() => {
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
        setCart(prevCart => [...prevCart, cartItem]);
        addToast('Producto vario añadido. Edite el nombre y precio.', 'info');
    }, [addToast]);

    const updateBudgetCartItemDetails = useCallback((productId: string, details: { name?: string; price?: number }) => {
        setCart(prevCart => prevCart.map(item => {
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

    const handleCancelEdit = useCallback(() => {
        const wasEditing = !!budgetToEdit;
        setBudgetToEdit(null);
        clearCart();
        const finalConsumer = budgetableCustomers.find(c => c.Id_Cliente === '0' || (c['Nombre y Apellido'] || '').toLowerCase() === 'consumidor final');
        setSelectedCustomer(finalConsumer || (budgetableCustomers.length > 0 ? budgetableCustomers[0] : null));
        if (wasEditing) {
            setActiveTab('list');
        }
    }, [budgetToEdit, clearCart, budgetableCustomers]);

    const sendProfessionalBudget = useCallback((budget: Budget) => {
        const budgetHtml = generateBudgetHtml(budget);

        const budgetWindow = window.open('', '_blank');
        if (budgetWindow) {
            budgetWindow.document.write(budgetHtml);
            budgetWindow.document.close();
            budgetWindow.focus();
        } else {
            addToast("La ventana del presupuesto fue bloqueada. Habilite las ventanas emergentes.", 'error');
            return;
        }

        const customer = budget.customer;
        if (!customer || !customer.Whatsapp) {
            addToast("El cliente no tiene un número de WhatsApp válido para el envío.", 'info');
            return;
        }

        const message = `¡Hola ${customer['Nombre y Apellido']}!\n\nTe envío el presupuesto solicitado de Refrigeración Tolosa. Por favor, avisame si tenés alguna consulta.\n\n¡Gracias!`;
        const whatsappUrl = `https://wa.me/${customer.Whatsapp}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');

        addToast("Guarde el presupuesto como PDF y adjúntelo en el chat de WhatsApp.", 'info');
    }, [addToast]);


    const proceedWithSave = useCallback(async (customerForBudget: Customer) => {
        setIsSavingBudget(true);
        try {
            let savedBudget: Budget;
            if (budgetToEdit) {
                const updatedBudget: Budget = {
                    ...budgetToEdit,
                    items: cart,
                    customer: customerForBudget,
                    total,
                    date: new Date(),
                };
                await api.updateBudget(updatedBudget);
                addToast("Presupuesto actualizado con éxito.", 'success');
                savedBudget = updatedBudget;
            } else {
                const newBudget: Budget = {
                    id: crypto.randomUUID(),
                    items: cart,
                    customer: customerForBudget,
                    total,
                    date: new Date(),
                    status: 'pending',
                };
                await api.addBudget(newBudget);
                addToast("Presupuesto guardado con éxito.", 'success');
                savedBudget = newBudget;
            }

            if (savedBudget.customer && savedBudget.customer.Id_Cliente !== '0') {
                sendProfessionalBudget(savedBudget);
            }

            setBudgetToEdit(null);
            clearCart();
            const finalConsumer = budgetableCustomers.find(c => c.Id_Cliente === '0' || (c['Nombre y Apellido'] || '').toLowerCase() === 'consumidor final');
            setSelectedCustomer(finalConsumer || (budgetableCustomers.length > 0 ? budgetableCustomers[0] : null));
            fetchBudgets();
            setActiveTab('list');

        } catch (error) {
            console.error('Failed to save budget:', error);
            addToast(`Error al guardar el presupuesto: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'error');
        } finally {
            setIsSavingBudget(false);
        }
    }, [cart, budgetToEdit, total, addToast, sendProfessionalBudget, clearCart, budgetableCustomers, fetchBudgets]);

    const handleSaveBudget = useCallback(async () => {
        if (!selectedCustomer) {
            addToast("Por favor, seleccione un cliente para asignarle el presupuesto.", 'error');
            return;
        }
        if (cart.length === 0) {
            addToast("El presupuesto está vacío. Agregue productos para continuar.", 'error');
            return;
        }

        const isGenericCustomer = selectedCustomer.Id_Cliente === '0';
        const isDataIncomplete = !selectedCustomer.Documento || !selectedCustomer.Whatsapp;

        if (!isGenericCustomer && isDataIncomplete) {
            if (window.confirm("Los datos de este cliente están incompletos. ¿Desea agregarlos al presupuesto?")) {
                setCustomerDataCompletion({
                    isOpen: true,
                    customer: selectedCustomer,
                    onComplete: (completedCustomer) => {
                        proceedWithSave(completedCustomer);
                    }
                });
            } else {
                proceedWithSave(selectedCustomer);
            }
        } else {
            proceedWithSave(selectedCustomer);
        }
    }, [selectedCustomer, cart, addToast, proceedWithSave]);
    
    const handleConfirmAndSend = useCallback(() => {
        const budget = sendModalState.budget;
        if (!budget || !targetCustomerId) {
            addToast("Por favor, seleccione un cliente.", 'error');
            return;
        }

        const targetCustomer = customers.find(c => c.Id_Cliente === targetCustomerId);
        if (!targetCustomer || !targetCustomer.Whatsapp) {
            addToast("El cliente seleccionado no tiene un número de WhatsApp válido.", 'error');
            return;
        }

        const budgetToSend: Budget = {
            ...budget,
            customer: targetCustomer,
        };
        
        sendProfessionalBudget(budgetToSend);
        
        setSendModalState({ isOpen: false, budget: null });
    }, [sendModalState.budget, targetCustomerId, customers, addToast, sendProfessionalBudget]);
    
    const handleEdit = useCallback((budget: Budget) => {
        setBudgetToEdit(budget);
        setCart([...budget.items]);
        setSelectedCustomer(budget.customer);
        setActiveTab('create');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    const handleDeleteRequest = useCallback((budgetId: string) => {
        setBudgetIdToDelete(budgetId);
    }, []);

    const handleConfirmDelete = useCallback(async () => {
        if (!budgetIdToDelete) return;

        setIsDeleting(true);
        try {
            await api.deleteBudget(budgetIdToDelete);
            addToast("Presupuesto eliminado con éxito.", 'success');
            handleCancelEdit();
            fetchBudgets();
            setBudgetIdToDelete(null); // Close modal on success
        } catch (error) {
            console.error("Error deleting budget:", error);
            addToast("No se pudo eliminar el presupuesto.", 'error');
        } finally {
            setIsDeleting(false);
        }
    }, [budgetIdToDelete, addToast, handleCancelEdit, fetchBudgets]);

    const handleViewTicket = useCallback((budget: Budget) => {
        const ticketHtml = generateBudgetHtml(budget);
        const ticketWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
        if (ticketWindow) {
            ticketWindow.document.write(ticketHtml);
            ticketWindow.document.close();
            ticketWindow.focus();
        } else {
            addToast("La ventana del ticket fue bloqueada. Por favor, habilite las ventanas emergentes.", 'error');
        }
    }, [addToast]);
    
    const handleApprove = useCallback(async (budget: Budget) => {
        await api.updateBudgetStatus(budget.id, 'approved');
        fetchBudgets();
    }, [fetchBudgets]);
    
    const handleConvertToSale = useCallback((budget: Budget) => {
        setIsConvertingBudget(true);
        setBudgetToConvert(budget);
    }, []);

    const handleCloseConvertModal = useCallback(() => {
        setBudgetToConvert(null);
        setIsConvertingBudget(false);
    }, []);
    
    const handleSaveNewCustomer = useCallback(async (customerData: Omit<Customer, 'Id_Cliente' | 'Deuda' | 'Pagos'>) => {
      try {
          await api.addCustomer(customerData);
          addToast("Cliente agregado con éxito.", 'success');
          setCustomerFormOpen(false);
          setNewlyCreatedCustomerName(customerData['Nombre y Apellido']);
          await refreshData();
      } catch (error) {
          console.error("Failed to add customer from budget view", error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          addToast(`Error al agregar cliente: ${errorMessage}`, 'error');
          throw error;
      }
    }, [addToast, refreshData]);

    // Construct a Sale-like draft from the budget to pass to CheckoutModal
    const saleDraft: Sale | null = useMemo(() => {
        if (!budgetToConvert) return null;
        
        // IMPORTANT: We must use the full customer object from the customers list to ensure 
        // we have the latest CUIT/IVA data, not just the snapshot stored in the budget.
        const fullCustomer = customers.find(c => c.Id_Cliente === budgetToConvert.customer.Id_Cliente) || budgetToConvert.customer;

        return {
            id: budgetToConvert.id, // Use budget ID to link later, or generate new one? API expects ID to find budget? 
            // Actually API updateBudgetToSale uses budget ID to find it in "Ventas" sheet since budgets are stored there.
            date: new Date(),
            customer: fullCustomer,
            items: budgetToConvert.items,
            itemCount: budgetToConvert.items.reduce((acc, i) => acc + i.quantity, 0),
            subtotal: budgetToConvert.total,
            total: budgetToConvert.total,
            payment: { cash: 0, digital: 0, credit: 0, echeqs: [] },
            facturacion: 'N',
            adjustmentAmount: 0,
            adjustmentDescription: '',
            status: 'active'
        } as Sale;
    }, [budgetToConvert, customers]);

    const handleBudgetCheckout = useCallback(async (sale: Sale, generateInvoice: boolean) => {
        if (!activeShift) {
            addToast("Error: No hay un turno activo. No se puede registrar la venta.", 'error');
            throw new Error("Turno no activo.");
        }
        if (!budgetToConvert) {
             addToast("Error: No hay presupuesto seleccionado.", 'error');
             return;
        }

        // UPDATE OPTIMISTA
        onOptimisticAddSale({ ...sale, isPendingSync: true, shiftId: activeShift.ID_Turno });
        setIsConvertingBudget(false);

        const saleWithShiftId = { ...sale, shiftId: activeShift.ID_Turno };
        let finalSaleObject = { ...saleWithShiftId };

        try {
            if (generateInvoice) {
                addToast('Generando factura electrónica...', 'info');
                const invoiceResponse = await api.generateElectronicInvoice(finalSaleObject);
                const invoiceData = invoiceResponse.data;
                const debugInfo = invoiceResponse.debug || [];

                // B.4) CONSISTENCIA: Usar el tipo efectivo devuelto por el API
                const effectiveType = invoiceData?.effectiveType || finalSaleObject.facturacion;
                if (effectiveType !== finalSaleObject.facturacion) {
                    console.warn(`[Budgets] Mismatch de tipo. Solicitado: ${finalSaleObject.facturacion}, Emitido: ${effectiveType}`);
                    finalSaleObject.facturacion = effectiveType;
                }

                if (!invoiceData || !invoiceData.cae || invoiceData.cae === 'DEV_MODE_NO_CAE') {
                    const rawResponseLine = debugInfo.find((line: any) => typeof line === 'string' && line.startsWith('API Response Body:'));
                    const rawResponse = rawResponseLine ? rawResponseLine.substring('API Response Body: '.length) : 'No se pudo capturar la respuesta del proveedor.';
                    console.error("FacturaGratis API Response:", rawResponse);
                    throw new Error("El proveedor de facturación respondió sin un CAE. Venta NO registrada.");
                }
                
                finalSaleObject.facturaInfo = {
                    cae: invoiceData.cae,
                    nro: invoiceData.nro,
                    vtoCae: invoiceData.vtoCae,
                    qrData: invoiceData.qrData,
                    fecha: new Date().toLocaleString('es-AR'),
                    url: invoiceData.comprobante_pdf_url || invoiceData.url,
                    ticketUrl: invoiceData.comprobante_ticket_url
                };
                addToast(`Factura ${invoiceData.nro} generada. Registrando venta...`, 'success');
            }

            // Printing logic
            if (finalSaleObject.facturaInfo) {
                const officialUrl = finalSaleObject.facturaInfo.ticketUrl || finalSaleObject.facturaInfo.url;
                if (officialUrl) {
                    window.open(officialUrl, '_blank');
                } else {
                    const ticketWindow = window.open('', '_blank', 'width=350,height=650,scrollbars=yes,resizable=yes');
                    if (ticketWindow) {
                        const printStyles = getPrintStyles();
                        ticketWindow.document.write(generateInvoiceHtml(finalSaleObject, printStyles));
                        ticketWindow.document.close();
                        setTimeout(() => { ticketWindow.focus(); ticketWindow.print(); }, 500);
                    }
                }
            } else {
                const ticketWindow = window.open('', '_blank', 'width=350,height=650,scrollbars=yes,resizable=yes');
                if (ticketWindow) {
                    const printStyles = getPrintStyles();
                    ticketWindow.document.write(generateReceiptHtml(finalSaleObject, printStyles));
                    ticketWindow.document.close();
                    setTimeout(() => { ticketWindow.focus(); ticketWindow.print(); }, 500);
                } else {
                    addToast("La ventana del ticket fue bloqueada. La venta se registrará igualmente.", 'info');
                }
            }

            // IMPORTANT: Call specific API to convert budget instead of addSale to avoid duplicates
            await api.convertBudgetToSale(
                budgetToConvert,
                finalSaleObject.payment,
                activeShift.ID_Turno,
                finalSaleObject.facturacion,
                finalSaleObject.customer,
                finalSaleObject.total,
                finalSaleObject.adjustmentAmount || 0,
                finalSaleObject.adjustmentDescription || ''
            );
            
            // FIN SYNC OPTIMISTA
            onOptimisticAddSale({ ...finalSaleObject, isPendingSync: false });
            setBudgetToConvert(null);
            addToast("Venta registrada con éxito.", 'success');
            refreshData(); // Refresh app data

            setTimeout(() => {
                if (finalSaleObject.customer && finalSaleObject.customer.Id_Cliente !== '0' && finalSaleObject.customer.Whatsapp) {
                    sendTicketViaWhatsApp(finalSaleObject, addToast);
                }
            }, 200);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
            addToast(`Error al finalizar la venta: ${errorMessage}`, 'error');
            refreshData();
            throw err;
        }
    }, [activeShift, addToast, budgetToConvert, refreshData, onOptimisticAddSale]);


    return (
        <div className="p-6 space-y-6">
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('create')}
                    className={`px-4 py-2 font-semibold text-sm -mb-px border-b-2 transition-colors duration-200 ${
                        activeTab === 'create'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-blue-600 hover:border-gray-300'
                    }`}
                >
                    Crear / Editar Presupuesto
                </button>
                 <button
                    onClick={() => setActiveTab('list')}
                    className={`px-4 py-2 font-semibold text-sm -mb-px border-b-2 transition-colors duration-200 ${
                        activeTab === 'list'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-blue-600 hover:border-gray-300'
                    }`}
                >
                    Presupuestos Activos
                </button>
            </div>

            {activeTab === 'create' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Products Section */}
                    <div className="lg:col-span-2 bg-gray-50 rounded-xl p-6 flex flex-col">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">Catálogo de Productos</h2>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="relative flex-grow">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                        <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="w-5 h-5 text-gray-400" />
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre, código o cód. de barras..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                >
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={addCommonProductToBudget}
                                    className="flex-shrink-0 bg-yellow-500 text-white px-4 py-2 border border-transparent rounded-lg hover:bg-yellow-600 focus:ring-yellow-500 focus:border-yellow-500 flex items-center space-x-2 transition-colors"
                                    title="Agregar un producto o servicio no catalogado al presupuesto"
                                >
                                    <Icon path="M9 13.5l3 3m0 0l3-3m-3 3v-6m1.06-4.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" className="w-5 h-5" />
                                    <span>Productos Varios</span>
                                </button>
                            </div>
                        </div>
                        {isLoading ? (
                            <div className="flex-grow flex items-center justify-center">
                                <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-12 h-12 text-blue-500 animate-spin mx-auto"/>
                            </div>
                        ) : (
                            <div className="flex-grow overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pr-2 -mr-4">
                                {filteredProducts.map(product => (
                                    <ProductCard 
                                        key={product.cod} 
                                        product={product} 
                                        onAddToCart={addToCart} 
                                        allowOutOfStock={true} 
                                        imageHeightClass="h-32"
                                        onViewDetails={setProductForDetail}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Budget Cart Section */}
                    <div className="lg:col-span-1 bg-white rounded-xl shadow-lg p-6 flex flex-col">
                        <div className="flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0">
                            <h2 className="text-2xl font-bold text-gray-800">{budgetToEdit ? 'Editando' : 'Nuevo Presupuesto'}</h2>
                            {cart.length > 0 && 
                                <button onClick={handleCancelEdit} className="text-sm text-red-500 hover:underline">
                                    {budgetToEdit ? 'Cancelar Edición' : 'Vaciar'}
                                </button>
                            }
                        </div>

                        {/* Actions section */}
                        {cart.length > 0 && (
                            <div className="flex-shrink-0 py-4 border-b-2 border-dashed space-y-4">
                                {/* Row for Total and Save Button */}
                                <div className="flex items-stretch gap-4">
                                    <div className="flex-grow bg-gray-50 rounded-lg flex justify-between items-center p-3">
                                        <span className="text-xl font-bold text-gray-800">Total</span>
                                        <span className="text-2xl font-bold text-gray-800">${total.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <button
                                        onClick={handleSaveBudget}
                                        disabled={isSavingBudget}
                                        className="flex-grow bg-blue-600 text-white py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                    >
                                        {isSavingBudget ? (
                                            <>
                                                <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                                                <span>Procesando...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Icon path="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-5 h-5"/>
                                                <span>{budgetToEdit ? 'Actualizar' : 'Guardar'}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                                {/* Row for Customer Selector */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Cliente</label>
                                    <div className="flex items-center space-x-2 mt-1">
                                        <div className="flex-grow">
                                            <SearchableSelect
                                                options={budgetableCustomers.map(c => ({ value: c.Id_Cliente, label: c['Nombre y Apellido'] }))}
                                                value={selectedCustomer?.Id_Cliente || ''}
                                                onChange={(value) => setSelectedCustomer(budgetableCustomers.find(c => c.Id_Cliente === value) || null)}
                                                placeholder="Buscar o seleccionar cliente..."
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setCustomerFormOpen(true)}
                                            className="flex-shrink-0 bg-blue-100 text-blue-700 px-3 py-2 rounded-md hover:bg-blue-200 transition-colors text-sm font-medium"
                                        >
                                            Nuevo
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        <div className="flex-grow overflow-y-auto pt-4 -mr-3 pr-3">
                            {cart.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-gray-500 h-full">
                                    <Icon path="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.232 15.18a3 3 0 01-3.375 2.565h-1.5a3 3 0 01-3-3V9.622c0-1.02.622-1.921 1.543-2.311l4.5-1.928a3 3 0 012.914 0l4.5 1.928c.921.39 1.543 1.29 1.543 2.31v5.378a3 3 0 01-1.258 2.45l-4.5 3.288z" className="w-16 h-16 mb-4 text-gray-300" />
                                    <p className="font-medium">Presupuesto vacío</p>
                                    <p className="text-sm text-center">Agregue productos del catálogo.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {cart.map(item => (
                                        <BudgetCartItem 
                                            key={item.product.cod} 
                                            item={item} 
                                            onUpdateQuantity={updateQuantity} 
                                            onRemoveItem={removeFromCart} 
                                            onUpdateCartItemDetails={updateBudgetCartItemDetails}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'list' && (
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Presupuestos Activos (Pendientes y Aprobados)</h2>
                    <div className="mb-4">
                        <input
                            type="text"
                            placeholder="Buscar por cliente o ID de presupuesto..."
                            value={budgetSearchTerm}
                            onChange={(e) => setBudgetSearchTerm(e.target.value)}
                            className="w-full max-w-lg pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div className="space-y-4 pr-2 max-h-[70vh] overflow-y-auto">
                        {filteredBudgets.length === 0 && !isLoading && (
                            <p className="text-gray-500 text-center py-4">
                                {budgetSearchTerm ? 'No se encontraron presupuestos que coincidan con la búsqueda.' : 'No hay presupuestos pendientes o aprobados.'}
                            </p>
                        )}
                        {filteredBudgets.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(budget => {
                            const budgetDate = new Date(budget.date);
                            const isValidDate = !isNaN(budgetDate.getTime());

                            return (
                            <div key={budget.id} className="border p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-bold">{budget.customer['Nombre y Apellido']} <span className="font-mono text-xs text-gray-500">(ID: {budget.id.slice(0, 8)})</span></p>
                                        <p className="text-sm text-gray-500">{isValidDate ? budgetDate.toLocaleDateString() : 'Fecha no disponible'}</p>
                                        <p className="text-lg font-bold mt-1">${budget.total.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                                    </div>
                                    <div className="text-right flex flex-col items-end space-y-2">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[budget.status]}`}>{statusDisplay[budget.status]}</span>
                                        {budget.status === 'approved' && activeShift && (
                                            <button onClick={() => handleConvertToSale(budget)} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 flex items-center space-x-1.5">
                                                <Icon path="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" className="w-4 h-4" />
                                                <span>Convertir a Venta</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-2 text-xs text-gray-600">
                                    {budget.items.map(i => <span key={i.product.cod} className="mr-2 inline-block bg-gray-100 px-1.5 py-0.5 rounded">{i.quantity}x {i.product.Producto}</span>)}
                                </div>
                                <div className="border-t mt-3 pt-3 flex items-center justify-between">
                                    <div className="flex space-x-2 flex-wrap gap-y-2">
                                        <button onClick={() => handleViewTicket(budget)} className="text-xs flex items-center space-x-1 text-gray-600 hover:text-black"><Icon path="M6.75 7.5h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75-.75h-10.5a.75.75 0 01-.75-.75V8.25a.75.75 0 01.75-.75z" className="w-4 h-4"/><span>Ver</span></button>
                                        <button onClick={() => setSendModalState({ isOpen: true, budget: budget })} className="text-xs flex items-center space-x-1 text-gray-600 hover:text-black"><Icon path="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.794 9 8.25z" className="w-4 h-4"/><span>Enviar por WhatsApp</span></button>
                                        {budget.status === 'pending' && <button onClick={() => handleApprove(budget)} className="text-xs flex items-center space-x-1 text-green-600 hover:text-green-800"><Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4"/><span>Aprobar</span></button>}
                                    </div>
                                    <div className="flex space-x-2">
                                        <button onClick={() => handleEdit(budget)} className="text-xs flex items-center space-x-1 text-blue-600 hover:text-blue-800"><Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" className="w-4 h-4"/><span>Editar</span></button>
                                        <button onClick={() => handleDeleteRequest(budget.id)} className="text-xs flex items-center space-x-1 text-red-600 hover:text-red-800"><Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-4 h-4"/><span>Eliminar</span></button>
                                    </div>
                                </div>
                            </div>
                        )})}
                    </div>
                </div>
            )}

            {budgetToConvert && activeShift && saleDraft && (
                <CheckoutModal
                    isOpen={!!budgetToConvert}
                    onClose={handleCloseConvertModal}
                    cart={budgetToConvert.items}
                    customers={customers}
                    onFinalizeSale={handleBudgetCheckout}
                    onAddNewCustomer={() => setCustomerFormOpen(true)}
                    saleBeingEdited={saleDraft}
                />
            )}
            
            <CustomerFormModal
                isOpen={isCustomerFormOpen}
                onClose={() => setCustomerFormOpen(false)}
                onSave={handleSaveNewCustomer}
                customers={customers}
            />
            
            <ProductDetailModal
                isOpen={!!productForDetail}
                onClose={() => setProductForDetail(null)}
                product={productForDetail}
                onAddToCart={addToCart}
            />

             <CompleteCustomerDataModal 
               isOpen={customerDataCompletion.isOpen}
               customer={customerDataCompletion.customer}
               onComplete={customerDataCompletion.onComplete}
               onClose={() => setCustomerDataCompletion({ isOpen: false, customer: null, onComplete: () => {} })}
            />

            {sendModalState.isOpen && sendModalState.budget && (
                <Modal
                    isOpen={sendModalState.isOpen}
                    onClose={() => setSendModalState({ isOpen: false, budget: null })}
                    title={`Enviar Presupuesto #${sendModalState.budget.id.slice(0, 8)}`}
                >
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-gray-600">Presupuesto para:</p>
                            <p className="font-semibold">{sendModalState.budget.customer['Nombre y Apellido']}</p>
                            <p className="font-bold text-lg">${sendModalState.budget.total.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
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
                                onClick={() => setSendModalState({ isOpen: false, budget: null })}
                                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmAndSend}
                                className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 flex items-center space-x-2"
                            >
                                <Icon path="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.794 9 8.25z" className="w-5 h-5"/>
                                <span>Preparar para Enviar</span>
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
            
            <ConfirmationModal
                isOpen={!!budgetIdToDelete}
                onClose={() => setBudgetIdToDelete(null)}
                onConfirm={handleConfirmDelete}
                title="Eliminar Presupuesto"
                message="¿Está seguro que desea eliminar este presupuesto? Esta acción es irreversible."
                confirmText="Sí, Eliminar"
                isProcessing={isDeleting}
            />
        </div>
    );
};
