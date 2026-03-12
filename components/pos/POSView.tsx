import React, { useState, useMemo, useContext, useCallback, Fragment } from 'react';
import { Product, CartItem, Customer, Sale } from '../../types';
import { ProductCard } from './ProductCard';
import { Cart } from './Cart';
import { Icon } from '../ui/Icon';
import { CheckoutModal } from './CheckoutModal';
import { CustomerFormModal } from '../customers/CustomerFormModal';
import * as api from '../../services/api';
import { generateReceiptHtml, generateInvoiceHtml } from './Receipt';
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
  onNavigateBudgets,
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
        status: 'active',
        shiftId: activeShift.ID_Turno,
        document_type: 'budget',
      };
      await api.addBudgetSupabase(budget);
      setCheckoutOpen(false);
      onClearCart();
      addToast('Presupuesto guardado correctamente.', 'success');
      refreshData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
      addToast(`Error al guardar presupuesto: ${errorMessage}`, 'error');
    }
  }, [activeShift, addToast, onClearCart, refreshData]);
  // ...existing code...
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isCheckoutOpen, setCheckoutOpen] = useState(false);
    const [isBudgetMode, setIsBudgetMode] = useState(false);
  const [isCustomerFormOpen, setCustomerFormOpen] = useState(false);
  const [productForDetail, setProductForDetail] = useState<Product | null>(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false); // Estado para carrito colapsable en mobile

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


  // --- OPTIMIZACIÓN: Límite inicial y cargar más ---
  const INITIAL_VISIBLE_PRODUCTS = 40;
  const LOAD_MORE_STEP = 40;
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_PRODUCTS);

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

  // Regla: si hay búsqueda o filtro, mostrar todos los resultados; si no, limitar
  const limitedProducts = useMemo(() => {
    if (searchTerm || selectedCategory !== 'All') {
      return filteredProducts;
    }
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, searchTerm, selectedCategory, visibleCount]);

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
            finalSaleObject.Factura_Nro = invoiceData.nro || '';
            finalSaleObject.Factura_CAE = invoiceData.cae || '';
            finalSaleObject.Factura_Vto_CAE = invoiceData.vtoCae || '';
            finalSaleObject.Factura_QR_Data = invoiceData.qrData || '';
            finalSaleObject.Factura_Fecha = new Date().toLocaleString('es-AR');
            finalSaleObject.Factura_URL =
              invoiceData.comprobante_pdf_url ||
              invoiceData.url ||
              '';
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
    <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6 p-4 sm:p-6 h-[calc(100vh-80px)]">
      {/* Botón flotante para abrir carrito en mobile */}
      <button
        className="fixed bottom-4 right-4 z-50 lg:hidden bg-green-600 text-white rounded-full shadow-lg px-6 py-3 flex items-center space-x-2 font-bold text-lg focus:outline-none focus:ring-2 focus:ring-green-400 transition-all"
        style={{ display: isMobileCartOpen ? 'none' : 'flex' }}
        onClick={() => setIsMobileCartOpen(true)}
        aria-label="Abrir carrito"
      >
        <Icon path="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z" className="w-7 h-7" />
        <span>Ver carrito</span>
      </button>
      {/* Products Section */}
      <div className="lg:col-span-2 bg-gray-50 rounded-xl p-4 sm:p-6 flex flex-col">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
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
                placeholder="Buscar por nombre, código o cód. de barras..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
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
          <>
            <div className="flex-grow overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 pr-2 -mr-4">
                {limitedProducts.map(product => (
                  <ProductCard
                    key={product.cod}
                    product={product}
                    onAddToCart={onAddToCart}
                    onViewDetails={setProductForDetail}
                  />
                ))}
            </div>
            {/* Botón Cargar más */}
            {!searchTerm && selectedCategory === 'All' && visibleCount < filteredProducts.length && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => setVisibleCount(v => v + LOAD_MORE_STEP)}
                  className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold shadow hover:bg-blue-700 transition-colors"
                >
                  Cargar más productos
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cart Section */}
      {/* Desktop: siempre visible. Mobile: colapsable */}
      <div className="lg:col-span-1 mt-6 lg:mt-0 hidden lg:block">
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

      {/* Mobile: panel colapsable */}
      {isMobileCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden bg-black/40" onClick={() => setIsMobileCartOpen(false)}>
          <div
            className="w-full bg-white rounded-t-2xl shadow-2xl p-4 max-h-[80vh] flex flex-col animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-bold text-gray-800">Carrito</h2>
              <button
                className="text-gray-400 hover:text-gray-700 p-2"
                onClick={() => setIsMobileCartOpen(false)}
                aria-label="Cerrar carrito"
              >
                <Icon path="M6 18L18 6M6 6l12 12" className="w-6 h-6" />
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
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md sm:max-w-lg shadow-xl overflow-y-auto max-h-[90vh]">
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