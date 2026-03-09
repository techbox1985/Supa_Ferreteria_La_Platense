import React from 'react';
import { Product } from '../../types';
import { Icon } from '../ui/Icon';

interface StockEntryProductCardProps {
  product: Product;
  onAddToEntryList: (product: Product) => void;
  onViewDetails: (product: Product) => void;
}

export const StockEntryProductCard: React.FC<StockEntryProductCardProps> = React.memo(({ product, onAddToEntryList, onViewDetails }) => {
  const cost = product['P.Costo'];
  const salePrice = product['Precio Final'];
  const margin = cost > 0 ? ((salePrice - cost) / cost) * 100 : salePrice > 0 ? Infinity : 0;
  const hasNegativeMargin = salePrice < cost && salePrice > 0;

  return (
    <div
      onClick={() => onAddToEntryList(product)}
      className={`bg-white rounded-lg shadow-md overflow-hidden flex flex-col transition-transform duration-300 hover:scale-105 hover:shadow-xl cursor-pointer border-2 ${hasNegativeMargin ? 'border-red-500' : 'border-transparent'}`}
    >
      {hasNegativeMargin && (
        <div className="bg-red-500 text-white text-xs font-bold text-center py-1 flex items-center justify-center space-x-1">
          <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-4 h-4"/>
          <span>Costo &gt; Venta</span>
        </div>
      )}
      <div className="relative">
        <img
          src={product.FOTOGRAFIA || 'https://picsum.photos/400'}
          alt={product.Producto}
          className="w-full h-32 object-cover"
        />
        <div className="absolute top-2 right-2 text-xs px-2 py-1 rounded-full font-medium bg-blue-100 text-blue-800">
          Stock: {product.stockk}
        </div>
        <button 
            onClick={(e) => { e.stopPropagation(); onViewDetails(product); }}
            className="absolute top-2 left-2 bg-black bg-opacity-40 text-white rounded-full p-1.5 hover:bg-opacity-60 transition-all duration-200"
            title="Ver detalles del producto"
            aria-label="Ver detalles del producto"
            >
            <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" className="w-5 h-5" />
        </button>
      </div>
      <div className="p-3 flex flex-col flex-grow">
        <h3 className="text-sm font-semibold text-gray-800 h-10 line-clamp-2" title={product.Producto}>{product.Producto}</h3>
        <p className="text-xs text-gray-500">Cod: {product.cod}</p>
        
        <div className="mt-auto pt-3">
          <p className="text-xs text-gray-500">P. Costo</p>
          <p className="text-2xl font-bold text-gray-900">${cost.toLocaleString('es-AR')}</p>
          <div className="flex justify-between items-center mt-1">
            <div>
              <p className="text-xs text-gray-500">P. Venta</p>
              <p className="text-sm font-semibold text-gray-700">${salePrice.toLocaleString('es-AR')}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Margen</p>
              <p className={`text-sm font-bold ${margin < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {isFinite(margin) ? `${margin.toFixed(0)}%` : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
StockEntryProductCard.displayName = 'StockEntryProductCard';
