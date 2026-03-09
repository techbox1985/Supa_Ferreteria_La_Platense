import React, { useState, useEffect, useMemo } from 'react';
import { Sale } from '../../types';
import { useToast } from '../../contexts/ToastContext';
import { Icon } from '../ui/Icon';

const FIELD_NAMES = ['Código', 'Descripción', 'Cantidad', 'Precio'];

export const BillingCopilotWindow: React.FC = () => {
  const [sale, setSale] = useState<Sale | null>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const { addToast } = useToast();

  useEffect(() => {
    document.title = "Copiloto de Facturación";
    
    const channel = new BroadcastChannel('billing_assistant_channel');
    channel.onmessage = (event) => {
      if (event.data.sale) {
        setSale(event.data.sale);
        setCurrentItemIndex(0);
        setCurrentFieldIndex(0);
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  const currentItem = useMemo(() => {
    return sale?.items[currentItemIndex];
  }, [sale, currentItemIndex]);

  const { currentValue, currentFieldName } = useMemo(() => {
    if (!currentItem) return { currentValue: '', currentFieldName: '' };
    
    const fieldName = FIELD_NAMES[currentFieldIndex];
    let value: any = '';

    switch (currentFieldIndex) {
      case 0: value = currentItem.product.cod; break;
      case 1: value = currentItem.product.Producto; break;
      case 2: value = currentItem.quantity; break;
      case 3: value = currentItem.price; break;
    }
    return { currentValue: String(value), currentFieldName: fieldName };
  }, [currentItem, currentFieldIndex]);

  const handleCopyAndAdvance = () => {
    if (!currentItem) return;

    navigator.clipboard.writeText(currentValue).then(() => {
      addToast(`${currentFieldName} copiado: ${currentValue}`, 'success');
      
      // Advance to the next field or item
      if (currentFieldIndex < FIELD_NAMES.length - 1) {
        setCurrentFieldIndex(prev => prev + 1);
      } else {
        if (sale && currentItemIndex < sale.items.length - 1) {
          setCurrentItemIndex(prev => prev + 1);
          setCurrentFieldIndex(0);
        } else {
          // Reached the end
          addToast('¡Todos los productos han sido procesados!', 'info');
        }
      }
    }).catch(err => {
      addToast('Error al copiar el dato.', 'error');
    });
  };
  
  const handleReset = () => {
      setCurrentItemIndex(0);
      setCurrentFieldIndex(0);
      addToast('Asistente reiniciado al primer producto.', 'info');
  }
  
  const isFinished = sale && currentItemIndex === sale.items.length - 1 && currentFieldIndex === FIELD_NAMES.length - 1;

  if (!sale) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-4 text-center">
        <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <h1 className="text-xl font-bold text-gray-800">Esperando datos de la venta...</h1>
        <p className="text-gray-600">Por favor, inicie el asistente desde el panel de ventas.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 p-4 font-sans">
      <div className="text-center pb-3 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-800">Copiloto de Facturación</h1>
        <p className="text-sm text-gray-500">Venta #{sale.id.slice(0, 8)}</p>
      </div>

      <div className="flex-grow flex flex-col justify-center items-center text-center p-4 space-y-4">
        <div className="w-full">
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                PRODUCTO {currentItemIndex + 1} DE {sale.items.length}
            </p>
            <p className="text-base font-bold text-blue-700 truncate" title={currentItem?.product.Producto}>
                {currentItem?.product.Producto}
            </p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-md w-full">
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                CAMPO: {currentFieldName}
            </p>
            <p className="text-2xl font-mono text-gray-900 bg-gray-100 p-2 rounded mt-1 break-all">
                {currentValue}
            </p>
        </div>

        <button
            onClick={handleCopyAndAdvance}
            disabled={!!isFinished}
            className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 text-lg disabled:bg-gray-400"
        >
            <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-6 h-6"/>
            <span>Copiar y Avanzar</span>
        </button>

         {isFinished && (
             <div className="text-center p-4 bg-green-50 text-green-800 rounded-lg">
                <p className="font-bold">¡Completado!</p>
                <p className="text-sm">Todos los datos han sido procesados.</p>
             </div>
         )}
      </div>
      
      <div className="flex-shrink-0 pt-3 border-t border-gray-200">
          <button onClick={handleReset} className="text-sm text-gray-500 hover:underline w-full text-center">
            Reiniciar al primer producto
          </button>
      </div>
    </div>
  );
};
