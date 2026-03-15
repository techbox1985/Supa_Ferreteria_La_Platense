import React, { useState, useMemo, useContext, useCallback, useRef, useEffect } from 'react';
import { Product, CartItem, Customer, Sale } from '../../types';
import { ProductCard } from './ProductCard';
import { Cart } from './Cart';
import { Icon } from '../ui/Icon';
import { CheckoutModal } from './CheckoutModal';
import { CustomerFormModal } from '../customers/CustomerFormModal';
import * as api from '../../services/api';
import { generateReceiptHtml } from './Receipt';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { sendTicketViaWhatsApp } from '../../utils/whatsappHelper';
import { ProductDetailModal } from './ProductDetailModal';
import { getPrintStyles } from '../../utils/printStyles';

interface POSViewProps {
    onNavigateBudgets: () => void;
  products: Product[];
  categories: string[];
  customers: Customer[];
  refreshData: () => void;
  isLoading: boolean;
  cart: CartItem[];
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (productId: string, newQuantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onAddCommonProduct: () => void;
  onUpdateCartItemDetails: (productId: string, details: { name?: string; price?: number }) => void;
  saleBeingEdited: Sale | null;
  onClearSaleBeingEdited: () => void;
  onOptimisticAddSale: (sale: Sale) => void;
}

const POSView: React.FC<POSViewProps> = ({
  // ...existing code...
  products,
  categories,
  customers,
  refreshData,
  isLoading,
  cart,
  onAddToCart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onAddCommonProduct,
  onUpdateCartItemDetails,
  saleBeingEdited,
  onClearSaleBeingEdited,
  onOptimisticAddSale,
}) => {
  const { activeShift } = useContext(AuthContext);
  const { addToast } = useToast();
  // Declaración de estados principales
  const [isCheckoutOpen, setCheckoutOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cartSectionRef = useRef<HTMLDivElement>(null);
  // Lógica para guardar presupuesto
  const handleFinalizeBudget = useCallback(async (sale: Sale, _generateInvoice: boolean) => {
    if (!activeShift) {
      addToast("Error: No hay un turno activo. No se puede registrar el presupuesto.", 'error');
      return;
    }
    try {
      const budget = {
        id: sale.id,
        date: sale.date,
        customer: sale.customer,
        items: sale.items,
        total: sale.total,
        status: 'pending',
        shiftId: activeShift.ID_Turno,
        document_type: 'budget',
      };
      if (budget.customer) {
        await api.addBudgetSupabase({ ...budget, customer: budget.customer, status: 'pending' });
      }
      setCheckoutOpen(false);
      onClearCart();
      addToast('Presupuesto guardado correctamente.', 'success');
      refreshData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
      addToast(`Error al guardar presupuesto: ${errorMessage}`, 'error');
    }
  }, [activeShift, addToast, onClearCart, refreshData]);
    // Focus search input on POS mount (desktop only)
    useEffect(() => {
      if (typeof window === 'undefined') return;
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      if (!isMobile && searchInputRef.current) {
        setTimeout(() => searchInputRef.current?.focus(), 150);
      }
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
      function isTypingInInput(e: KeyboardEvent) {
        const tag = (e.target as HTMLElement)?.tagName;
        const editable = (e.target as HTMLElement)?.isContentEditable;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable;
      }
      function handler(e: KeyboardEvent) {
        // "/" shortcut for search
        if (e.key === '/' && !isTypingInInput(e)) {
          e.preventDefault();
          searchInputRef.current?.focus();
          return;
        }
        // Alt+C for cart
        if ((e.altKey && (e.code === 'KeyC' || e.key === 'c' || e.key === 'C')) && !isTypingInInput(e)) {
          e.preventDefault();
          // Desktop: focus or highlight cart section
          if (window.innerWidth >= 1024) {
            cartSectionRef.current?.focus?.();
            cartSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
          } else {
            setIsMobileCartOpen((v) => !v);
          }
          return;
        }
        // Alt+Enter for checkout
        if (e.altKey && (e.key === 'Enter' || e.code === 'Enter') && !isTypingInInput(e)) {
          if (cart.length > 0 && !isCheckoutOpen) {
            e.preventDefault();
            setIsBudgetMode(false);
            setCheckoutOpen(true);
          }
          return;
        }
      }
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [cart.length, isCheckoutOpen]);

    // Refocus search after checkout closes (if not editing sale)
    useEffect(() => {
      if (!isCheckoutOpen && !saleBeingEdited) {
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            const isMobile = /Mobi|Android/i.test(navigator.userAgent);
            if (!isMobile) searchInputRef.current?.focus();
          }
        }, 200);
      }
    }, [isCheckoutOpen, saleBeingEdited]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isBudgetMode, setIsBudgetMode] = useState(false);
  const [isCustomerFormOpen, setCustomerFormOpen] = useState(false);
  const [productForDetail, setProductForDetail] = useState<Product | null>(null);
  // Estado para carrito móvil
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Modal de impresión
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [saleForPrintModal, setSaleForPrintModal] = useState<Sale | null>(null);
  const [printModalIsFiscal, setPrintModalIsFiscal] = useState(false);


const categoryOptions = useMemo(() => {
  const unique = Array.from(
    new Set(
      (categories || [])
        .map(c => String(c || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'es'));
  return ['All', ...unique];
}, [categories]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = selectedCategory === 'All' || p.Categoria === selectedCategory;
      const lowerSearchTerm = searchTerm.toLowerCase();
      const matchesSearch =
        String(p.Producto || '').toLowerCase().includes(lowerSearchTerm) ||
        String(p.cod || '').toLowerCase().includes(lowerSearchTerm) ||
        String(p['cod.barras'] || '').toLowerCase().includes(lowerSearchTerm);
      return matchesCategory && matchesSearch;
    });
  }, [products, searchTerm, selectedCategory]);

  const visibleProductsCount = filteredProducts.length;

  const closePrintModal = useCallback(() => {
    setIsPrintModalOpen(false);
  }, []);

  const handleFinalizeSale = useCallback(async (sale: Sale, generateInvoice: boolean) => {
    if (!activeShift) {
      addToast("Error: No hay un turno activo. No se puede registrar la venta.", 'error');
      throw new Error("Turno no activo.");
    }

    // UPDATE OPTIMISTA INMEDIATO
    onOptimisticAddSale({ ...sale, isPendingSync: true, shiftId: activeShift.ID_Turno });
    setCheckoutOpen(false);
    onClearCart();

    const saleWithShiftId = { ...sale, shiftId: activeShift.ID_Turno };
    let finalSaleObject: Sale = { ...saleWithShiftId };

    // 1) Modal inmediato (sin esperar facturación)
    setSaleForPrintModal(finalSaleObject);
    setPrintModalIsFiscal(!!generateInvoice);
    setIsPrintModalOpen(true);

    try {
      const processSaleInBackground = async () => {
        try {
          // 2) Si es fiscal, generar factura en background (NO bloquea el modal)
          if (generateInvoice) {
            addToast('Generando factura electrónica...', 'info');

            const invoiceResponse = await api.generateElectronicInvoice(finalSaleObject);
            const invoiceData = invoiceResponse.data;
            const debugInfo = invoiceResponse.debug || [];

            // B.4) CONSISTENCIA: Usar el tipo efectivo devuelto por el API
            const effectiveType = invoiceData?.effectiveType || finalSaleObject.facturacion;
            if (effectiveType !== finalSaleObject.facturacion) {
              console.warn(`[POS] Mismatch de tipo. Solicitado: ${finalSaleObject.facturacion}, Emitido: ${effectiveType}`);
              finalSaleObject.facturacion = effectiveType;
            }

            // Validación mínima: CAE obligatorio
            if (!invoiceData || !invoiceData.cae || invoiceData.cae === 'DEV_MODE_NO_CAE') {
              const rawResponseLine = debugInfo.find((line: string) => line.startsWith('API Response Body:'));
              const rawResponse = rawResponseLine
                ? rawResponseLine.substring('API Response Body: '.length)
                : 'No se pudo capturar la respuesta del proveedor.';
              console.error("Proveedor API Response:", rawResponse);
              throw new Error("El proveedor de facturación respondió sin un CAE. Venta NO registrada.");
            }

            finalSaleObject.facturaInfo = {
              cae: invoiceData.cae,
              nro: invoiceData.nro,
              vtoCae: invoiceData.vtoCae,
              qrData: invoiceData.qrData,
              fecha: new Date().toLocaleString('es-AR'),
              url: invoiceData.comprobante_pdf_url || invoiceData.url,
              ticketUrl: invoiceData.comprobante_ticket_url || invoiceData.ticketUrl
            };

            // Campos planos para el Sheet
            finalSaleObject.facturaInfo = {
              ...finalSaleObject.facturaInfo,
              nro: invoiceData.nro || '',
              cae: invoiceData.cae || '',
              vtoCae: invoiceData.vtoCae || '',
              qrData: invoiceData.qrData || '',
              fecha: new Date().toLocaleString('es-AR'),
            };
            // Eliminado: finalSaleObject.Factura_URL (no existe en Sale)
            // @ts-expect-error: Factura_Ticket_URL might not be in Sale type but is sent to webhook
            finalSaleObject.Factura_Ticket_URL =
              invoiceData.comprobante_ticket_url ||
              invoiceData.ticketUrl ||
              '';

            addToast(`Factura ${invoiceData.nro} generada.`, 'success');

            // 3) Actualizar el modal (habilitar botones fiscales)
            setSaleForPrintModal(prev => (prev ? { ...prev, ...finalSaleObject } : finalSaleObject));
          }

          // 4) Guardar venta SIEMPRE (fiscal o no)
          if (saleBeingEdited) {
            await api.updateSale(saleBeingEdited, finalSaleObject);
          } else {
            await api.addSale(finalSaleObject, activeShift.ID_Turno);
          }

          // Confirmamos el fin del sync quitando la bandera
          onOptimisticAddSale({ ...finalSaleObject, isPendingSync: false });
          onClearSaleBeingEdited();
          addToast("Venta registrada con éxito.", 'success');

          if (sale.customer && sale.customer.Id_Cliente !== '0' && sale.customer.Whatsapp) {
            sendTicketViaWhatsApp(sale, addToast);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
          console.error("Error en proceso de venta en segundo plano:", err);
          addToast(`Error al registrar la venta: ${errorMessage}. Se intentará sincronizar más tarde.`, 'error');
        } finally {
          refreshData();
        }
      };

      queueMicrotask(() => {
        processSaleInBackground().catch(() => {
          // ya se toastea/loguea adentro
        });
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
      console.error("Error inicial al finalizar venta (antes del proceso en segundo plano):", err);
      addToast(`Error crítico al iniciar la venta: ${errorMessage}`, 'error');
      refreshData();
      throw err;
    }
  }, [
    activeShift,
    addToast,
    onOptimisticAddSale,
    onClearCart,
    onClearSaleBeingEdited,
    saleBeingEdited,
    refreshData
  ]);

  const handleAddNewCustomer = useCallback(async (customerData: Omit<Customer, 'Id_Cliente'>) => {
    try {
      await api.addCustomer(customerData);
      refreshData();
      addToast("Cliente agregado con éxito.", 'success');
      setCustomerFormOpen(false);
    } catch (error) {
      console.error("Failed to add customer", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addToast(`Error al agregar cliente: ${errorMessage}`, 'error');
      throw error;
    }
  }, [refreshData, addToast]);

  const isInvoiceReady = !!saleForPrintModal?.facturaInfo?.cae;
  const fiscalTicketUrl = saleForPrintModal?.facturaInfo?.ticketUrl;
  const fiscalA4Url = saleForPrintModal?.facturaInfo?.url;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 h-[calc(100vh-80px)] relative">
      {saleBeingEdited && (
        <div className="col-span-full mb-4">
          <div className="bg-blue-100 border border-blue-300 text-blue-800 rounded-lg px-4 py-2 flex items-center gap-2">
            <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="w-5 h-5" />
            <span className="font-semibold">Editando venta existente</span>
            <span className="text-xs text-blue-600 font-mono ml-2">ID: {saleBeingEdited.id.slice(0,8)}</span>
            <button onClick={onClearSaleBeingEdited} className="ml-auto text-blue-500 hover:text-blue-700 text-xs underline">Cancelar edición</button>
          </div>
        </div>
      )}
      {/* Products Section */}
      <div className="lg:col-span-2 bg-gray-50 rounded-xl p-6 flex flex-col">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Productos</h2>
            <span className="text-sm font-medium text-gray-500">
              Mostrando {visibleProductsCount} producto{visibleProductsCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-grow">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="w-5 h-5 text-gray-400" />
              </span>
              <input
                type="text"
                ref={searchInputRef}
                placeholder="Buscar por nombre, código o cód. de barras..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                aria-label="Buscar productos"
                autoComplete="off"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full sm:w-56 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              {categoryOptions.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? 'Todas las categorías' : cat}
                </option>
              ))}
            </select>

            <button
              onClick={onAddCommonProduct}
              className="w-full sm:w-auto flex-shrink-0 bg-yellow-500 text-white px-3 py-2 border border-transparent rounded-lg hover:bg-yellow-600 focus:ring-yellow-500 focus:border-yellow-500 flex items-center justify-center space-x-2 transition-colors"
              title="Agregar un producto o servicio no catalogado a la venta"
            >
              <Icon path="M9 13.5l3 3m0 0l3-3m-3 3v-6m1.06-4.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" className="w-5 h-5" />
              <span>Varios</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex-grow flex items-center justify-center">
            <div className="text-center">
              <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
              <p className="mt-2 text-gray-600">Cargando productos...</p>
            </div>
          </div>
        ) : (
          <div className="flex-grow overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 pr-2 -mr-4">
              {filteredProducts.map(product => (
                <ProductCard
                  key={product.cod}
                  product={product}
                  onAddToCart={onAddToCart}
                  onViewDetails={setProductForDetail}
                />
              ))}
          </div>
        )}
      </div>

      {/* Cart Section Desktop */}
      <div
        className="lg:col-span-1 hidden lg:block outline-none"
        tabIndex={-1}
        ref={cartSectionRef}
        aria-label="Sección carrito"
        style={{ scrollMarginTop: 80 }}
      >
        <Cart
          cart={cart}
          onUpdateQuantity={onUpdateQuantity}
          onRemoveItem={onRemoveItem}
          onClearCart={onClearCart}
          onCheckout={() => {
            setIsBudgetMode(false);
            setCheckoutOpen(true);
          }}
          onBudget={() => {
            setIsBudgetMode(true);
            setCheckoutOpen(true);
          }}
          onUpdateCartItemDetails={onUpdateCartItemDetails}
        />
      </div>
      {/* Shortcuts hint */}
      <div className="mt-4 mb-2 flex justify-end">
        <div className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1 border border-gray-200 select-none" title="Atajos rápidos POS">
          <span className="mr-2">/ buscar</span>
          <span className="mr-2">Alt+C carrito</span>
          <span>Alt+Enter cobrar</span>
        </div>
      </div>

      {/* Floating Cart Button (Mobile only) */}
      <button
        type="button"
        className="fixed z-40 bottom-6 right-6 lg:hidden flex items-center px-4 py-3 rounded-full shadow-lg bg-blue-600 text-white font-bold text-lg transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
        style={{ minWidth: 56 }}
        onClick={() => setIsMobileCartOpen(true)}
        aria-label={`Abrir carrito (${cart.length})`}
      >
        <Icon path="M3 3h18v2H3V3zm0 4h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2zm0 4h18v2H3v-2z" className="w-6 h-6 mr-2" />
        Carrito
        {cart.length > 0 && (
          <span className="ml-2 bg-white text-blue-600 rounded-full px-2 py-0.5 text-sm font-semibold">{cart.length}</span>
        )}
      </button>

      {/* Mobile Cart Drawer */}
      {isMobileCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black bg-opacity-40"
            onClick={() => setIsMobileCartOpen(false)}
            aria-label="Cerrar carrito"
          />
          {/* Drawer */}
          <div className="relative w-full max-h-[90vh] bg-white rounded-t-2xl shadow-2xl p-4 overflow-y-auto animate-slide-up">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-800">Carrito</h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-800 text-2xl font-bold px-2"
                onClick={() => setIsMobileCartOpen(false)}
                aria-label="Cerrar carrito"
              >
                ×
              </button>
            </div>
            <Cart
              cart={cart}
              onUpdateQuantity={onUpdateQuantity}
              onRemoveItem={onRemoveItem}
              onClearCart={onClearCart}
              onCheckout={() => {
                setIsBudgetMode(false);
                setCheckoutOpen(true);
                setIsMobileCartOpen(false);
              }}
              onBudget={() => {
                setIsBudgetMode(true);
                setCheckoutOpen(true);
                setIsMobileCartOpen(false);
              }}
              onUpdateCartItemDetails={onUpdateCartItemDetails}
            />
          </div>
        </div>
      )}

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cart={cart}
        customers={customers}
        onFinalizeSale={isBudgetMode ? handleFinalizeBudget : handleFinalizeSale}
        onAddNewCustomer={() => { setCheckoutOpen(false); setCustomerFormOpen(true); }}
        saleBeingEdited={saleBeingEdited}
        isBudgetMode={isBudgetMode}
      />

      <CustomerFormModal
        isOpen={isCustomerFormOpen}
        onClose={() => setCustomerFormOpen(false)}
        onSave={handleAddNewCustomer}
        customers={customers}
      />

      <ProductDetailModal
        isOpen={!!productForDetail}
        onClose={() => setProductForDetail(null)}
        product={productForDetail}
        onAddToCart={onAddToCart}
      />

      {/* Modal de impresión */}
      {isPrintModalOpen && saleForPrintModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-xl font-bold mb-4">Imprimir</h3>

            <div className="space-y-3">
              {/* 1) Ticket interno (siempre) */}
              <button
                onClick={() => {
                  const printWindow = window.open('', '_blank', 'width=350,height=650,scrollbars=yes,resizable=yes');
                  if (printWindow) {
                    const printStyles = getPrintStyles();
                    printWindow.document.write(generateReceiptHtml(saleForPrintModal, printStyles));
                    printWindow.document.close();
                    printWindow.focus();
                    printWindow.print();
                  }
                  closePrintModal();
                }}
                className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors"
              >
                Ticket interno
              </button>

              {/* 2) Opciones fiscales solo si corresponde */}
              {printModalIsFiscal && (
                <>
                  <button
                    disabled={!isInvoiceReady || !fiscalTicketUrl}
                    onClick={() => {
                      if (!fiscalTicketUrl) return;
                      window.open(fiscalTicketUrl, '_blank', 'noopener,noreferrer');
                      closePrintModal();
                    }}
                    className={`w-full py-2 px-4 rounded-lg transition-colors ${
                      (!isInvoiceReady || !fiscalTicketUrl)
                        ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {(!isInvoiceReady || !fiscalTicketUrl) ? 'Fiscal 80mm (generando...)' : 'Fiscal 80mm'}
                  </button>

                  <button
                    disabled={!isInvoiceReady || !fiscalA4Url}
                    onClick={() => {
                      if (!fiscalA4Url) return;
                      window.open(fiscalA4Url, '_blank', 'noopener,noreferrer');
                      closePrintModal();
                    }}
                    className={`w-full py-2 px-4 rounded-lg transition-colors ${
                      (!isInvoiceReady || !fiscalA4Url)
                        ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    {(!isInvoiceReady || !fiscalA4Url) ? 'Fiscal A4 (generando...)' : 'Fiscal A4'}
                  </button>
                </>
              )}
            </div>

            <button
              onClick={closePrintModal}
              className="mt-6 w-full bg-gray-300 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default POSView;