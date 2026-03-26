import React, { useState, useMemo, useContext, useCallback, useEffect } from 'react';
import { Product, StockEntryItem, SupplierInvoiceDetail, SupplierInvoiceHistory, SupplierInvoiceItem } from '../../types';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { EntryList } from './EntryList';
import { Modal } from '../ui/Modal';

interface StockEntryViewProps {
  products: Product[];
  refreshData: () => void;
  isLoading: boolean;
}

export const StockEntryView: React.FC<StockEntryViewProps> = ({ products, refreshData, isLoading }) => {
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [entryList, setEntryList] = useState<StockEntryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isConfirming, setIsConfirming] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState<SupplierInvoiceHistory[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [invoiceDetail, setInvoiceDetail] = useState<SupplierInvoiceDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  const { currentUser } = useContext(AuthContext);
  const { addToast } = useToast();

  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const suppliers = await api.getSuppliersSupabase();
        const options = (suppliers || [])
          .filter((item: any) => item?.is_deleted !== true)
          .map((item: any) => ({
            id: String(item.id || ''),
            name: String(item.nombre || item.name || item.Nombre || 'Proveedor sin nombre'),
          }))
          .filter((item: { id: string; name: string }) => item.id.length > 0);
        setSupplierOptions(options);
      } catch (error) {
        console.error('Failed to load suppliers for stock entry', error);
      }
    };

    loadSuppliers();
  }, []);

  const loadPurchaseHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const data = await api.getSupplierInvoicesHistorySupabase();
      setPurchaseHistory(data || []);
    } catch (error) {
      console.error('Failed to load purchase history', error);
      addToast('No se pudo cargar el historial de compras.', 'error');
    } finally {
      setIsHistoryLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadPurchaseHistory();
    }
  }, [activeTab, loadPurchaseHistory]);

  const categories = useMemo(() => ['All', ...new Set(products.map(p => p.Categoria).filter(Boolean).sort())], [products]);

  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const matchesCategory = selectedCategory === 'All' || p.Categoria === selectedCategory;
        const lowerSearchTerm = searchTerm.toLowerCase();
        const matchesSearch =
          String(p.Producto || '').toLowerCase().includes(lowerSearchTerm) ||
          String(p.cod || '').toLowerCase().includes(lowerSearchTerm);
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        const aPrecioFinal = typeof a['Precio Final'] === 'number' ? a['Precio Final'] : 0;
        const aPCosto = typeof a['P.Costo'] === 'number' ? a['P.Costo'] : 0;
        const bPrecioFinal = typeof b['Precio Final'] === 'number' ? b['Precio Final'] : 0;
        const bPCosto = typeof b['P.Costo'] === 'number' ? b['P.Costo'] : 0;
        const aHasNegativeMargin = aPrecioFinal < aPCosto;
        const bHasNegativeMargin = bPrecioFinal < bPCosto;
        if (aHasNegativeMargin && !bHasNegativeMargin) return -1;
        if (!aHasNegativeMargin && bHasNegativeMargin) return 1;
        return (a.Producto || '').localeCompare(b.Producto || '');
      });
  }, [products, searchTerm, selectedCategory]);

  const handleAddToEntryList = useCallback((product: Product) => {
    setEntryList(prev => {
      const existing = prev.find(i => i.product.cod === product.cod);
      if (existing) {
        return prev.map(i =>
          i.product.cod === product.cod ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, {
        product,
        quantity: 1,
        costPrice: typeof product['P.Costo'] === 'number' ? product['P.Costo'] : 0,
        salePrice: typeof product.Precio === 'number' ? product.Precio : 0
      }];
    });
  }, []);

  const handleUpdateQuantity = useCallback((productId: string, quantity: number) => {
    setEntryList(prev =>
      prev.map(i => (i.product.cod === productId ? { ...i, quantity: quantity >= 0 ? quantity : 0 } : i))
    );
  }, []);
  
  const handleUpdateCostPrice = useCallback((productId: string, newCostPrice: number) => {
    setEntryList(prev =>
      prev.map(i => (i.product.cod === productId ? { ...i, costPrice: newCostPrice } : i))
    );
  }, []);

  const handleUpdateSalePrice = useCallback((productId: string, newSalePrice: number) => {
    setEntryList(prev =>
      prev.map(i => (i.product.cod === productId ? { ...i, salePrice: newSalePrice } : i))
    );
  }, []);

  const handleRemoveItem = useCallback((productId: string) => {
    setEntryList(prev => prev.filter(i => i.product.cod !== productId));
  }, []);

  const handleClearList = useCallback(() => {
    setEntryList([]);
  }, []);

  const handleConfirmEntry = useCallback(async () => {
    if (entryList.length === 0) {
      addToast('La lista de ingreso está vacía.', 'info');
      return;
    }

    if (!selectedSupplierId) {
      addToast('Debe seleccionar un proveedor.', 'error');
      return;
    }

    if (!invoiceNumber.trim()) {
      addToast('Debe ingresar el número de factura.', 'error');
      return;
    }

    if (!currentUser) {
      addToast('Debe estar logueado para realizar esta acción.', 'error');
      return;
    }

    const inactiveProducts = entryList.filter(item => !item.product.Activo);
    let itemsToSend: StockEntryItem[] = [...entryList];

    if (inactiveProducts.length > 0) {
        const productNames = inactiveProducts.map(item => item.product.Producto).join(', ');
        const userConfirmed = window.confirm(
            `Los siguientes productos están inactivos: ${productNames}.\n\n¿Desea activarlos al ingresar el nuevo stock?`
        );

        if (userConfirmed) {
            const inactiveCodes = new Set(inactiveProducts.map(item => item.product.cod));
            itemsToSend = entryList.map(item => 
                inactiveCodes.has(item.product.cod) ? { ...item, reactivate: true } : item
            );
        }
    }
    
    setIsConfirming(true);
    try {
      const totalAmount = itemsToSend.reduce((sum, item) => sum + Number(item.costPrice) * Number(item.quantity), 0);

      const invoice = await api.createSupplierInvoice({
        supplier_id: selectedSupplierId,
        invoice_number: invoiceNumber.trim(),
        total_amount: Number(totalAmount),
        paid: isPaid,
      });

      const codeToIdMap = await api.getProductIdsByCodes(itemsToSend.map((item) => item.product.cod));
      const invoiceItems: SupplierInvoiceItem[] = itemsToSend.map((item) => {
        const productId = codeToIdMap[item.product.cod];
        if (!productId) {
          throw new Error(`No se encontró product_id para el código ${item.product.cod}`);
        }

        return {
          invoice_id: String(invoice.id),
          product_id: productId,
          quantity: Number(item.quantity),
          cost_price: Number(item.costPrice),
        };
      });

      await api.createSupplierInvoiceItems(invoiceItems);

      const result = await api.recordStockEntry(itemsToSend, currentUser.ID_Usuario);
      const updatedCount = result.updatedCostCount || 0;
      let message = 'Ingreso de stock registrado con éxito.';
      if (updatedCount > 0) {
        message += ` Se actualizó el costo y/o precio de ${updatedCount} producto(s).`;
      }
      addToast(message, 'success');
      handleClearList();
      setSelectedSupplierId('');
      setInvoiceNumber('');
      setIsPaid(false);
      refreshData();
      if (activeTab === 'history') {
        await loadPurchaseHistory();
      }
    } catch (error) {
      console.error("Failed to record stock entry", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addToast(`Error al registrar el ingreso: ${errorMessage}`, 'error');
    } finally {
      setIsConfirming(false);
    }
  }, [entryList, selectedSupplierId, invoiceNumber, currentUser, addToast, isPaid, refreshData, handleClearList, activeTab, loadPurchaseHistory]);

  const handleViewInvoiceDetail = useCallback(async (invoiceId: string) => {
    try {
      const detail = await api.getSupplierInvoiceDetailSupabase(invoiceId);
      setInvoiceDetail(detail);
      setIsDetailOpen(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addToast(`No se pudo cargar el detalle: ${msg}`, 'error');
    }
  }, [addToast]);

  const renderNewPurchase = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-170px)]">
      <div className="lg:col-span-2 bg-gray-50 rounded-xl p-6 flex flex-col">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Nueva Compra</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-grow">
              <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="w-5 h-5 text-gray-400 absolute inset-y-0 left-3 flex items-center" />
              <input
                type="text"
                placeholder="Buscar por nombre o código..."
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
          </div>
        </div>
        {isLoading ? (
          <div className="flex-grow flex items-center justify-center">
            <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-12 h-12 text-blue-500 animate-spin mx-auto"/>
          </div>
        ) : (
          <div className="flex-grow overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="overflow-x-auto h-full">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Imagen</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">P. Costo</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">P. Final</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margen</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                        No hay productos para mostrar con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((product) => {
                      const cost = Number(product['P.Costo'] ?? 0);
                      const finalPrice = Number(product['Precio Final'] ?? product.Precio ?? 0);
                      const marginPct = cost > 0 ? ((finalPrice - cost) / cost) * 100 : 0;
                      const thumb = product.Imagen || product.FOTOGRAFIA;

                      return (
                        <tr
                          key={product.cod}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => handleAddToEntryList(product)}
                        >
                          <td className="px-3 py-2">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={product.Producto || 'Producto'}
                                className="h-10 w-10 rounded-md object-cover border border-gray-200"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-md border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">
                                S/F
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm font-medium text-gray-800">
                            <button
                              onClick={() => handleAddToEntryList(product)}
                              className="hover:text-blue-600 text-left"
                            >
                              {product.Producto || '-'}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-700">{product.cod || '-'}</td>
                          <td className="px-3 py-2 text-sm text-gray-700">{product.Proveedor || '-'}</td>
                          <td className="px-3 py-2 text-sm text-right text-gray-700">{Number(product.stockk || 0).toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2 text-sm text-right text-gray-700">${cost.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2 text-sm text-right font-semibold text-gray-900">${finalPrice.toLocaleString('es-AR')}</td>
                          <td className={`px-3 py-2 text-sm text-right font-semibold ${marginPct < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {marginPct.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddToEntryList(product);
                              }}
                              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
                            >
                              Agregar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="lg:col-span-1">
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4 border border-gray-200 space-y-3">
          <h3 className="text-lg font-semibold text-gray-800">Datos de Compra</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700">Proveedor *</label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md"
            >
              <option value="">Seleccionar proveedor...</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Número de Factura *</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md"
              placeholder="Ej: A-0001-00001234"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-gray-200 p-3 bg-gray-50">
            <div>
              <p className="text-sm font-medium text-gray-700">Factura pagada</p>
              <p className="text-xs text-gray-500">Si no está pagada, queda como deuda</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPaid((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isPaid ? 'bg-green-600' : 'bg-gray-300'}`}
              aria-pressed={isPaid}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isPaid ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>

          <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs text-blue-700">Total de la compra</p>
            <p className="text-xl font-bold text-blue-900">
              ${entryList.reduce((sum, item) => sum + Number(item.costPrice) * Number(item.quantity), 0).toLocaleString('es-AR')}
            </p>
          </div>
        </div>

        <EntryList
          entryList={entryList}
          onUpdateQuantity={handleUpdateQuantity}
          onUpdateCostPrice={handleUpdateCostPrice}
          onUpdateSalePrice={handleUpdateSalePrice}
          onRemoveItem={handleRemoveItem}
          onClearList={handleClearList}
          onConfirm={handleConfirmEntry}
          isConfirming={isConfirming}
        />
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Historial de Compras</h2>
        <button
          onClick={loadPurchaseHistory}
          className="text-sm px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
        >
          Recargar
        </button>
      </div>
      <div className="overflow-x-auto max-h-[calc(100vh-260px)]">
        {isHistoryLoading ? (
          <div className="p-8 text-center text-gray-500">Cargando historial...</div>
        ) : purchaseHistory.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No hay compras registradas.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Factura</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pagado</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Items</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {purchaseHistory.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{invoice.supplier_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{invoice.invoice_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {invoice.created_at ? new Date(invoice.created_at).toLocaleString('es-AR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                    ${Number(invoice.total_amount || 0).toLocaleString('es-AR')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${invoice.paid ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                      {invoice.paid ? 'SI' : 'NO'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-700">{invoice.item_count}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleViewInvoiceDetail(invoice.id)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                        title="Ver detalle"
                      >
                        Ver detalle
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Compras e Ingresos</h1>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-white">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === 'new' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            Nueva Compra
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            Historial de Compras
          </button>
        </div>
      </div>

      {activeTab === 'new' ? renderNewPurchase() : renderHistory()}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={invoiceDetail ? `Detalle Compra ${invoiceDetail.invoice.invoice_number}` : 'Detalle Compra'}
        size="3xl"
      >
        {invoiceDetail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-gray-500">Proveedor</p>
                <p className="font-semibold text-gray-800">{invoiceDetail.invoice.supplier_name}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-gray-500">Fecha</p>
                <p className="font-semibold text-gray-800">
                  {invoiceDetail.invoice.created_at ? new Date(invoiceDetail.invoice.created_at).toLocaleString('es-AR') : '-'}
                </p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-gray-500">Total</p>
                <p className="font-semibold text-gray-800">${invoiceDetail.invoice.total_amount.toLocaleString('es-AR')}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-gray-500">Pagado</p>
                <p className="font-semibold text-gray-800">{invoiceDetail.invoice.paid ? 'SI' : 'NO'}</p>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Costo</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoiceDetail.items.map((item, idx) => (
                    <tr key={`${item.product_id}-${idx}`}>
                      <td className="px-4 py-2 text-sm text-gray-800">{item.product_name}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{item.product_code || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-800">{item.quantity}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-800">${item.cost_price.toLocaleString('es-AR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Sin detalle para mostrar.</p>
        )}
      </Modal>
    </div>
  );
};
