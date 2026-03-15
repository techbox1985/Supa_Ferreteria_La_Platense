import React, { useMemo } from 'react';
import { Product } from '../../types';
import { Icon } from '../ui/Icon';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  onViewDetails: (product: Product) => void;
  allowOutOfStock?: boolean;
  imageHeightClass?: string;
}

// A more robust date parser that handles ISO, YYYY-MM-DD, and DD/MM/YYYY formats.
const parseDate = (dateString: string | null | undefined): Date | null => {
    if (!dateString || typeof dateString !== 'string') return null;

    // Try parsing with the default constructor first. It's good at ISO and other standard formats.
    let date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        return date;
    }

    // If that fails, it might be in DD/MM/YYYY format, which is ambiguous for new Date().
    const parts = dateString.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        
        // Month is 0-indexed in JavaScript Date
        if (day && month && year && year > 1900) {
            date = new Date(year, month - 1, day);
            // Verify that the constructor didn't create an invalid date (e.g., from month 13)
            if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
                return date;
            }
        }
    }
    
    // Return null if all parsing attempts fail.
    return null;
}

export const ProductCard: React.FC<ProductCardProps> = React.memo(({ product, onAddToCart, onViewDetails, allowOutOfStock = false, imageHeightClass = 'h-48' }) => {
  const stock = product.stockk ?? 0;
  const minimo = product.Minimo ?? 0;
  const canBeAdded = product.Activo && (allowOutOfStock || stock > 0);
  const isLowOnStock = stock > 0 && minimo > 0 && stock < minimo;
  const isOnSale = product['Precio de Oferta'] && product['Precio de Oferta'] > 0;

  const handleImageClick = () => {
    if (canBeAdded) {
      onAddToCart(product);
    }
  };
  
  // POS Mode (original logic)
  const stockColor = stock > 10 ? 'bg-green-100 text-green-800' : 
                     stock > 0 ? 'bg-yellow-100 text-yellow-800' : 
                     'bg-red-100 text-red-800';
  
  const isPriceUpdatedOnline = product.Precio !== product['Precio Final'];
  const lastUpdateStr = product['Ultima.Actualizacion'];
  const lastUpdatedDate = useMemo(() => parseDate(lastUpdateStr), [lastUpdateStr]);
  const isValidDate = lastUpdatedDate instanceof Date && !isNaN(lastUpdatedDate.getTime());

  // Check if the price is stale (older than 3 months)
  const isStale = useMemo(() => {
    if (!isValidDate || !lastUpdatedDate) return false;
    
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    return lastUpdatedDate < threeMonthsAgo;
  }, [lastUpdatedDate, isValidDate]);
  
  const originalPrice = product['Precio Final'];


  return (
    <div className={`bg-white rounded-2xl shadow-soft border border-slate-200/60 overflow-hidden flex flex-col transition-all duration-300 p-3 sm:p-4 ${!canBeAdded ? 'opacity-60' : 'hover:scale-[1.02] hover:shadow-premium'} ${isLowOnStock ? 'border-2 border-orange-400' : ''}`}>
      <div className="relative">
        <img
          src={product.FOTOGRAFIA || 'https://picsum.photos/400'}
          alt={product.Producto}
          className={`w-full ${imageHeightClass} object-cover bg-slate-100 ${canBeAdded ? 'cursor-pointer' : ''} ${!canBeAdded ? 'filter grayscale' : ''}`}
          onClick={handleImageClick}
          title={canBeAdded ? `Añadir "${product.Producto}" al carrito` : `${product.Producto} - Sin Stock`}
          loading="lazy"
          decoding="async"
        />
         {isOnSale && (
            <div className="absolute top-3 left-3 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider shadow-lg">
                Oferta
            </div>
         )}
         <div 
            className={`absolute top-3 right-3 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-tight flex items-center space-x-1 shadow-sm ${stockColor}`}
            title={isLowOnStock ? `Bajo stock (Mínimo: ${product.Minimo})` : undefined}
         >
            {isLowOnStock && <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-3 h-3"/>}
            <span>Stock: {stock}</span>
        </div>
        <button 
            onClick={() => onViewDetails(product)}
            className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm text-slate-700 rounded-xl p-2 hover:bg-primary-900 hover:text-white transition-all duration-300 shadow-sm"
            title="Ver detalles del producto"
            aria-label="Ver detalles del producto"
            >
            <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" className="w-5 h-5" />
        </button>
      </div>
      <div className="p-5 flex flex-col flex-grow">
        <h3 className="text-base font-bold text-slate-800 h-12 line-clamp-2 leading-tight" title={product.Producto}>{product.Producto}</h3>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{product.Categoria}</p>
        
        <div className="flex-grow"></div>
        
        <div className="mt-auto pt-5">
            <p className="text-[10px] font-bold text-primary-800 bg-primary-50 inline-block px-2 py-1 rounded-lg mb-3 uppercase tracking-wider border border-primary-100">
                Cod: {product.cod}
            </p>
            <div className="flex justify-between items-end">
              <div>
                {isOnSale ? (
                  <div>
                    <p className="text-2xl font-black text-red-600 leading-none">${product['Precio de Oferta']!.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                    {typeof originalPrice === 'number' && !isNaN(originalPrice) && (
                      <del className="text-xs font-bold text-slate-400 ml-0.5">${originalPrice.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</del>
                    )}
                  </div>
                ) : (
                  (typeof originalPrice === 'number' && !isNaN(originalPrice) && (
                    <p className="text-2xl font-black text-slate-900 leading-none">${originalPrice.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                  ))
                )}
                {isPriceUpdatedOnline ? (
                    <p className="text-[10px] font-black text-green-600 uppercase tracking-tighter mt-1">Actualizado Online</p>
                ) : (
                    isValidDate && lastUpdatedDate && (
                        <p 
                            className={`text-[10px] font-bold uppercase tracking-tighter mt-1 ${isStale ? 'text-red-500' : 'text-slate-400'}`}
                            title={`Precio actualizado el: ${lastUpdatedDate.toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })}`}
                        >
                            Act.: {lastUpdatedDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </p>
                    )
                )}
              </div>
              <button
                onClick={() => onAddToCart(product)}
                disabled={!canBeAdded}
                className="bg-primary-900 text-white rounded-xl p-2.5 hover:bg-primary-950 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-300 shadow-soft active:scale-90"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
        </div>

      </div>
    </div>
  );
});
ProductCard.displayName = 'ProductCard';