import React, { useState, useMemo, useEffect } from 'react';
import { Customer, Product, CartItem, AccountTransaction } from '../../types';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { useToast } from '../../contexts/ToastContext';
import { SearchableSelect } from '../ui/SearchableSelect';
import { getProductSearchText } from '../../utils/productFilters';

interface CreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  products: Product[];
  onSave: (data: { items: CartItem[], description: string, total: number }) => Promise<void>;
  initialItems?: CartItem[];
  allCreditNotesForSale?: AccountTransaction[];
}

export const CreditNoteModal: React.FC<CreditNoteModalProps> = ({ isOpen, onClose, customer, products, onSave, initialItems = [], allCreditNotesForSale = [] }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const { addToast } = useToast();

  const isReturnFromSale = useMemo(() => initialItems.length > 0, [initialItems]);
  const total = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);

  // Effect to reset the component's internal state ONLY when it opens.
  useEffect(() => {
    if (isOpen) {
      const isForSaleReturn = initialItems.length > 0;
      
      if (isForSaleReturn) {
          const previouslyReturnedQuantities = new Map<string, number>();
          allCreditNotesForSale.forEach(note => {
            note.items?.forEach(item => {
              previouslyReturnedQuantities.set(item.product.cod, (previouslyReturnedQuantities.get(item.product.cod) || 0) + item.quantity);
            });
          });

          const itemsToReturn = initialItems.map(item => {
              const alreadyReturned = previouslyReturnedQuantities.get(item.product.cod) || 0;
              const availableToReturn = item.quantity - alreadyReturned;
              return { ...item, quantity: availableToReturn };
          }).filter(item => item.quantity > 0);
          setItems(itemsToReturn);
      } else {
          setItems([]);
      }
      
      setDescription(isForSaleReturn ? 'Devolución de Venta' : 'Ajuste manual de cuenta');
      setIsSaving(false);
      setProductSearch('');
    }
  }, [isOpen, initialItems, allCreditNotesForSale]);

  const productOptions = useMemo(() => 
    products
        .filter(p => p.Activo)
        .sort((a, b) => a.Producto.localeCompare(b.Producto))
        .map(p => {
          const precioFinal = typeof p['Precio Final'] === 'number' ? p['Precio Final'] : 0;
          return {
            value: p.cod,
            label: `[${p.cod}] ${p.Producto} - $${precioFinal.toLocaleString('es-AR')}`,
            searchText: getProductSearchText(p),
          };
        })
  , [products]);


  const handleManualProductAdd = (selectedCod: string) => {
    if (!selectedCod) return;

    const product = products.find(p => p.cod === selectedCod);
    if (product) {
      setItems(currentItems => {
        const precioFinal = typeof product['Precio Final'] === 'number' ? product['Precio Final'] : 0;
        const existing = currentItems.find(i => i.product.cod === product.cod);
        if (existing) {
          return currentItems.map(i => 
            i.product.cod === product.cod ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [...currentItems, { product, quantity: 1, price: precioFinal }];
      });
    }
    setProductSearch(''); // Reset the selector after adding a product
  };

  const handleUpdateReturnQuantity = (productId: string, newReturnQuantity: number, maxQuantity: number) => {
    const validatedQuantity = Math.max(0, Math.min(newReturnQuantity, maxQuantity));
    
    setItems(prevItems => {
        const existingItemIndex = prevItems.findIndex(i => i.product.cod === productId);

        if (validatedQuantity === 0) {
            return prevItems.filter(i => i.product.cod !== productId);
        }

        if (existingItemIndex > -1) {
            const updatedItems = [...prevItems];
            updatedItems[existingItemIndex].quantity = validatedQuantity;
            return updatedItems;
        } else {
            const originalItem = initialItems.find(i => i.product.cod === productId);
            if (originalItem) {
                return [...prevItems, { ...originalItem, quantity: validatedQuantity }];
            }
        }
        return prevItems;
    });
  };

  const updateManualItemQuantity = (productId: string, quantity: number) => {
      setItems(prev => prev.map(i => i.product.cod === productId ? { ...i, quantity: Math.max(0, quantity) } : i).filter(i => i.quantity > 0));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
        addToast('Debe seleccionar una cantidad mayor a 0 para al menos un producto.', 'error');
        return;
    }
    if (!description) {
        addToast('Por favor, ingrese un motivo para la nota de crédito.', 'error');
        return;
    }
    setIsSaving(true);
    try {
        await onSave({ items, description, total });
    } catch (error: any) {
        console.error("Failed to save credit note:", error);
        addToast(`Error al procesar la operación: ${error.message || 'Intente de nuevo.'}`, 'error');
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={isSaving ? () => {} : onClose} title={`Nueva Nota de Crédito para ${customer['Nombre y Apellido']}`} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {isReturnFromSale ? (
           <div className="space-y-3 max-h-60 overflow-y-auto pr-2 border rounded-lg p-3 bg-gray-50">
             <h4 className="text-sm font-medium text-gray-700">Ajuste la cantidad a devolver de cada producto:</h4>
             {initialItems.map(initialItem => {
                 const alreadyReturned = (allCreditNotesForSale || []).reduce((sum, note) => {
                    const itemInNote = note.items?.find(i => i.product.cod === initialItem.product.cod);
                    return sum + (itemInNote?.quantity || 0);
                 }, 0);
                 const availableToReturn = initialItem.quantity - alreadyReturned;
                 const itemToReturn = items.find(i => i.product.cod === initialItem.product.cod);
                 const returnQuantity = itemToReturn ? itemToReturn.quantity : 0;
   
                 if (availableToReturn <= 0) {
                     return (
                         <div key={initialItem.product.cod} className="flex items-center justify-between text-sm p-2 bg-gray-200 rounded text-gray-500 gap-4">
                            <p className="font-semibold truncate flex-1" title={initialItem.product.Producto}>{initialItem.product.Producto}</p>
                            <p className="text-xs">Todos los items ya fueron devueltos.</p>
                         </div>
                     )
                 }

                 return (
                    <div key={initialItem.product.cod} className="flex items-center justify-between text-sm p-2 bg-white rounded shadow-sm gap-4">
                       <div className="flex-1">
                           <p className="font-semibold text-gray-800 truncate" title={initialItem.product.Producto}>{initialItem.product.Producto}</p>
                           <p className="text-xs text-gray-500">
                               Cant. Original: {initialItem.quantity} / Disp: {availableToReturn} / P.U.: ${Number(initialItem.price || 0).toLocaleString('es-AR')}
                           </p>
                       </div>
                       <div className="flex items-center space-x-2">
                           <label htmlFor={`return-qty-${initialItem.product.cod}`} className="text-xs text-gray-600">Devolver:</label>
                           <input 
                               type="text"
                               inputMode="decimal"
                               id={`return-qty-${initialItem.product.cod}`}
                               value={returnQuantity} 
                               onChange={e => handleUpdateReturnQuantity(initialItem.product.cod, parseFloat(e.target.value.replace(',', '.')) || 0, availableToReturn)} 
                               className="w-16 border rounded p-1 text-center disabled:bg-gray-200"
                               disabled={isSaving}
                               autoFocus={initialItems.length === 1}
                           />
                       </div>
                   </div>
                 )
             })}
           </div>
        ) : (
          <div>
            <div className="mb-2">
              <label className="block text-sm font-medium text-gray-700">Añadir Producto para Crédito Manual</label>
              <SearchableSelect
                  options={productOptions}
                  value={productSearch}
                  onChange={handleManualProductAdd}
                  placeholder="Buscar producto por nombre o código..."
              />
            </div>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 border rounded-lg p-3 bg-gray-50">
              <h4 className="text-sm font-medium text-gray-700">Productos a acreditar:</h4>
              {items.length === 0 && <p className="text-center text-gray-500 py-4">Agregue productos para generar el crédito.</p>}
              {items.map(item => (
                <div key={item.product.cod} className="flex items-center justify-between text-sm p-2 bg-white rounded shadow-sm gap-4">
                    <div className="flex-1">
                        <p className="font-semibold text-gray-800 truncate" title={item.product.Producto}>{item.product.Producto}</p>
                        <p className="text-xs text-gray-500">P.U: ${Number(item.price || 0).toLocaleString('es-AR')}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                        <label htmlFor={`qty-${item.product.cod}`} className="text-xs text-gray-600">Cantidad:</label>
                        <input
                            type="text"
                            inputMode="decimal"
                            id={`qty-${item.product.cod}`}
                            value={item.quantity}
                            onChange={(e) => updateManualItemQuantity(item.product.cod, parseFloat(e.target.value.replace(',', '.')) || 0)}
                            className="w-16 border rounded p-1 text-center"
                            disabled={isSaving}
                        />
                    </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="border-t pt-4">
          <div className="flex justify-between text-xl font-bold mb-4">
            <span>Monto del Crédito:</span>
            <span>${Number(total || 0).toLocaleString('es-AR')}</span>
          </div>
          
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">Motivo / Descripción</label>
            <input
              type="text"
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200"
              required
              disabled={isSaving}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors disabled:opacity-50" disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" className="bg-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-700 transition-colors flex items-center justify-center space-x-2 w-64 disabled:bg-gray-400" disabled={isSaving || items.length === 0}>
             {isSaving ? (
                <>
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                    <span>Procesando...</span>
                </>
            ) : (
                 <>
                    <Icon path="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" className="w-5 h-5"/>
                    <span>Confirmar Nota de Crédito</span>
                 </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
