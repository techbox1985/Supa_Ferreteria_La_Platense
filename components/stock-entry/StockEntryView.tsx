import React, { useState, useMemo, useContext, useCallback } from 'react';
import { Product, StockEntryItem } from '../../types';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { EntryList } from './EntryList';
import { StockEntryProductCard } from './StockEntryProductCard';
import { ProductDetailModal } from '../pos/ProductDetailModal';

interface StockEntryViewProps {
  products: Product[];
  refreshData: () => void;
  isLoading: boolean;
}

export const StockEntryView: React.FC<StockEntryViewProps> = ({ products, refreshData, isLoading }) => {
  const [entryList, setEntryList] = useState<StockEntryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isConfirming, setIsConfirming] = useState(false);
  const [productForDetail, setProductForDetail] = useState<Product | null>(null);
  
  const { currentUser } = useContext(AuthContext);
  const { addToast } = useToast();

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
      const result = await api.recordStockEntry(itemsToSend, currentUser.ID_Usuario);
      const updatedCount = result.updatedCostCount || 0;
      let message = 'Ingreso de stock registrado con éxito.';
      if (updatedCount > 0) {
        message += ` Se actualizó el costo y/o precio de ${updatedCount} producto(s).`;
      }
      addToast(message, 'success');
      handleClearList();
      refreshData();
    } catch (error) {
      console.error("Failed to record stock entry", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addToast(`Error al registrar el ingreso: ${errorMessage}`, 'error');
    } finally {
      setIsConfirming(false);
    }
  }, [entryList, currentUser, addToast, refreshData, handleClearList]);


  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 h-[calc(100vh-80px)]">
      <div className="lg:col-span-2 bg-gray-50 rounded-xl p-6 flex flex-col">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Seleccionar Productos para Ingresar</h2>
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
             <div className="flex-grow overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pr-2 -mr-4">
                {filteredProducts.map(product => (
                    <StockEntryProductCard 
                        key={product.cod} 
                        product={product} 
                        onAddToEntryList={handleAddToEntryList}
                        onViewDetails={setProductForDetail}
                    />
                ))}
             </div>
        )}
      </div>

      <div className="lg:col-span-1">
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

      <ProductDetailModal
        isOpen={!!productForDetail}
        onClose={() => setProductForDetail(null)}
        product={productForDetail}
      />
    </div>
  );
};
