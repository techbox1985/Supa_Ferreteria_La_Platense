import React, { useState } from 'react';
import { Product } from '../../types';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onAddToCart?: (product: Product) => void; // Optional for different contexts
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ isOpen, onClose, product, onAddToCart }) => {
  const [isZoomed, setIsZoomed] = useState(false);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setIsZoomed(false);
    }
  }

  if (!isOpen || !product) return null;

  const canBeAdded = product.stockk > 0;
  const isOnSale = product['Precio de Oferta'] && product['Precio de Oferta'] > 0;
  const finalPrice = isOnSale ? product['Precio de Oferta']! : product['Precio Final'];
  const originalPrice = product['Precio Final'];

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={product.Producto} size="lg">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-1/2">
            <img 
              src={product.FOTOGRAFIA || 'https://picsum.photos/400'} 
              alt={product.Producto}
              className="w-full h-auto object-contain rounded-lg shadow-lg max-h-96 cursor-zoom-in transition-transform duration-200 hover:scale-105"
              onClick={() => setIsZoomed(true)}
            />
          </div>
          <div className="md:w-1/2 flex flex-col space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{product.Producto}</h2>
              <p className="text-sm text-gray-500">{product.Categoria}</p>
            </div>
            
            <div className="bg-gray-50 p-3 rounded-md max-h-32 overflow-y-auto">
              <h4 className="font-semibold text-gray-700">Descripción</h4>
              <p className="text-sm text-gray-600 mt-1">{product.Descripcion || 'No hay descripción disponible.'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="font-semibold text-gray-700">Código</p>
                <p className="font-mono text-gray-600">{product.cod}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="font-semibold text-gray-700">Stock</p>
                <p className="font-bold text-lg">{product.stockk}</p>
              </div>
            </div>
            
            <div className="mt-auto pt-4 flex flex-col items-end gap-4">
                {isOnSale ? (
                 <div className="text-right">
                   <p className="text-4xl font-extrabold text-red-600">${finalPrice.toLocaleString('es-AR')}</p>
                   <del className="text-xl font-medium text-gray-500">${originalPrice.toLocaleString('es-AR')}</del>
                 </div>
               ) : (
                 <p className="text-4xl font-extrabold text-gray-900">${finalPrice.toLocaleString('es-AR')}</p>
               )}
              {onAddToCart && (
                <button
                  onClick={() => onAddToCart(product)}
                  disabled={!canBeAdded}
                  className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-lg"
                >
                  <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-6 h-6"/>
                  <span>Añadir al Carrito</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {isZoomed && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-80 z-[60] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setIsZoomed(false)}
        >
          <img 
            src={product.FOTOGRAFIA || 'https://picsum.photos/400'} 
            alt={product.Producto}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image itself
          />
          <button
            onClick={() => setIsZoomed(false)}
            className="absolute top-4 right-4 text-white text-opacity-80 hover:text-opacity-100 transition-opacity"
            aria-label="Cerrar zoom"
          >
            <Icon path="M6 18L18 6M6 6l12 12" className="w-10 h-10" />
          </button>
        </div>
      )}
    </>
  );
};