import React from 'react';
import { CartItem } from '../../types';
import { Icon } from '../ui/Icon';
import { sanitizeProductDisplayText } from '../../utils/productFilters';

interface CartProps {
  cart: CartItem[];
  onUpdateQuantity: (productId: string, newQuantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  onBudget: () => void;
  onUpdateCartItemDetails: (productId: string, details: { name?: string; price?: number }) => void;
  onSendToCashier?: () => void;
}

const CartEntry: React.FC<{ 
    item: CartItem;
    onUpdateQuantity: (productId: string, newQuantity: number) => void;
    onRemoveItem: (productId: string) => void;
    onUpdateCartItemDetails: (productId: string, details: { name?: string; price?: number }) => void;
}> = ({ item, onUpdateQuantity, onRemoveItem, onUpdateCartItemDetails }) => {
    const isCommonProduct = item.product.cod.startsWith('COMMON_');
  const displayName = sanitizeProductDisplayText(item.product.Producto);

    return (
        <div className="flex items-center justify-between py-3">
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
                <p className="font-semibold text-gray-800 text-sm truncate" title={displayName}>{displayName}</p>
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
    )
}

export const Cart: React.FC<CartProps> = ({ cart, onUpdateQuantity, onRemoveItem, onClearCart, onCheckout, onBudget, onUpdateCartItemDetails, onSendToCashier }) => {
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div className="bg-white rounded-xl shadow-lg p-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-lg font-bold text-gray-800">Carrito</h2>
        <button onClick={onClearCart} disabled={cart.length === 0} className="text-sm text-red-500 hover:underline disabled:text-gray-400 disabled:cursor-not-allowed">
          Vaciar Carrito
        </button>
      </div>
      
      {/* Checkout section */}
      {cart.length > 0 && (
        <>
        <div className="border-b-2 border-dashed py-4 flex-shrink-0 flex gap-2 items-stretch">
            <div className="flex-grow bg-gray-50 rounded-lg flex justify-between items-center p-3">
                <span className="text-xl font-bold text-gray-800">Total</span>
                <span className="text-2xl font-bold text-gray-800">${total.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
            <button
              onClick={onCheckout}
              disabled={cart.length === 0}
              className="bg-green-600 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <Icon path="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z" className="w-6 h-6"/>
              <span>Cobrar</span>
            </button>
            <button
              onClick={onBudget}
              disabled={cart.length === 0}
              className="bg-blue-600 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <Icon path="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-6 h-6"/>
              <span>Presupuestar</span>
            </button>
        </div>
        {onSendToCashier && (
          <button
            onClick={onSendToCashier}
            disabled={cart.length === 0}
            className="mt-2 w-full bg-orange-500 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            <Icon path="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" className="w-5 h-5"/>
            <span>Enviar a caja</span>
          </button>
        )}
        </>
      )}

      {/* Items list / Empty state */}
      <div className="flex-grow overflow-y-auto pt-4 -mr-3 pr-3">
        {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-gray-500 h-full">
                <Icon path="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c.51 0 .962-.343 1.087-.835l.383-1.437M7.5 14.25L5.106 5.165A2.25 2.25 0 002.894 3H2.25" className="w-16 h-16 mb-4 text-gray-300" />
                <p className="font-medium">Tu carrito está vacío</p>
                <p className="text-sm text-center">Agrega productos para comenzar una venta.</p>
            </div>
        ) : (
            <div className="divide-y divide-gray-100">
            {cart.map(item => (
                <CartEntry key={item.product.cod} item={item} onUpdateQuantity={onUpdateQuantity} onRemoveItem={onRemoveItem} onUpdateCartItemDetails={onUpdateCartItemDetails} />
            ))}
            </div>
        )}
      </div>
    </div>
  );
};