
import React from 'react';
import { StockEntryItem } from '../../types';
import { Icon } from '../ui/Icon';

interface EntryListProps {
  entryList: StockEntryItem[];
  onUpdateQuantity: (productId: string, newQuantity: number) => void;
  onUpdateCostPrice: (productId:string, newCostPrice: number) => void;
  onUpdateSalePrice: (productId: string, newSalePrice: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearList: () => void;
  onConfirm: () => void;
  isConfirming: boolean;
}

interface EntryListItemProps {
  item: StockEntryItem;
  onUpdateQuantity: (productId: string, newQuantity: number) => void;
  onUpdateCostPrice: (productId:string, newCostPrice: number) => void;
  onUpdateSalePrice: (productId: string, newSalePrice: number) => void;
  onRemoveItem: (productId: string) => void;
}

const EntryListItem: React.FC<EntryListItemProps> = ({ item, onUpdateQuantity, onUpdateCostPrice, onUpdateSalePrice, onRemoveItem }) => {
    const cost = item.costPrice;
    const salePrice = item.salePrice;
  const isAutoPrice = item.product.auto_price === true;
  const markupPct = Number.isFinite(Number(item.product.markup_pct)) ? Number(item.product.markup_pct) : 40;
  const autoFinalPricePreview = Number((cost * (1 + (markupPct / 100))).toFixed(2));
    const margin = cost > 0 ? ((salePrice - cost) / cost) * 100 : salePrice > 0 ? Infinity : 0;
    const marginColor = margin >= 0 ? 'text-green-600' : 'text-red-600';

    return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0 pr-4">
                <p className="font-semibold text-gray-800 text-base truncate" title={item.product.Producto}>
                    {item.product.Producto}
                </p>
                 <p className="text-xs text-gray-500">
                    Stock Actual: <span className="font-medium">{item.product.stockk}</span> | 
                    Costo Ant: <span className="font-medium">${typeof item.product['P.Costo'] === 'number' ? item.product['P.Costo'].toLocaleString('es-AR') : '-'}</span> |
                    Venta Ant: <span className="font-medium">${typeof item.product.Precio === 'number' ? item.product.Precio.toLocaleString('es-AR') : '-'}</span>
                </p>
            </div>
            <button onClick={() => onRemoveItem(item.product.cod)} aria-label={`Remover ${item.product.Producto}`} className="text-red-500 hover:text-red-700 p-1">
                <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
            </button>
        </div>
        
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
            {/* Cantidad a Ingresar */}
            <div>
                <label className="block text-xs font-medium text-gray-600">Cantidad</label>
                <input
                    type="number"
                    step="any"
                    min="0"
                    aria-label={`Cantidad para ${item.product.Producto}`}
                    value={item.quantity}
                    onChange={(e) => onUpdateQuantity(item.product.cod, parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full text-center border border-gray-300 rounded-md py-1.5"
                />
            </div>
            {/* Nuevo Costo */}
            <div>
                <label className="block text-xs font-medium text-gray-600">Nuevo Costo</label>
                 <div className="relative mt-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                        type="text" inputMode="decimal"
                        aria-label={`Nuevo costo para ${item.product.Producto}`}
                        value={item.costPrice}
                        onChange={(e) => onUpdateCostPrice(item.product.cod, parseFloat(e.target.value.replace(',', '.')) || 0)}
                        className="w-full text-center border border-gray-300 rounded-md py-1.5 pl-4"
                    />
                </div>
            </div>
             {/* Nuevo Precio Venta */}
            <div>
                <label className="block text-xs font-medium text-gray-600">Nuevo P. Venta</label>
                 <div className="relative mt-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                        type="text" inputMode="decimal"
                        aria-label={`Nuevo precio de venta para ${item.product.Producto}`}
                        value={item.salePrice}
                  onChange={(e) => {
                    if (isAutoPrice) return;
                    onUpdateSalePrice(item.product.cod, parseFloat(e.target.value.replace(',', '.')) || 0);
                  }}
                  disabled={isAutoPrice}
                  className={`w-full text-center border border-gray-300 rounded-md py-1.5 pl-4 ${isAutoPrice ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                    />
                </div>
              {isAutoPrice && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-[11px] text-amber-700">Precio se calcula automáticamente según proveedor</p>
                  <p className="text-[11px] text-gray-600">
                    Preview Precio Final: <span className="font-semibold">${autoFinalPricePreview.toLocaleString('es-AR')}</span>
                  </p>
                </div>
              )}
            </div>
            {/* Margen */}
            <div className="text-center">
                <label className="block text-xs font-medium text-gray-600">Margen %</label>
                <p className={`mt-1 text-xl font-bold ${marginColor}`}>
                     {isFinite(margin) ? `${margin.toFixed(0)}%` : 'N/A'}
                </p>
            </div>
        </div>
    </div>
    )
};


export const EntryList: React.FC<EntryListProps> = ({
  entryList,
  onUpdateQuantity,
  onUpdateCostPrice,
  onUpdateSalePrice,
  onRemoveItem,
  onClearList,
  onConfirm,
  isConfirming,
}) => {
  const totalCost = entryList.reduce((sum, item) => sum + item.costPrice * item.quantity, 0);
  const totalUnits = entryList.reduce((sum, item) => sum + item.quantity, 0);
  const canConfirm = entryList.length > 0 && !isConfirming;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col h-full">
      <div className="flex justify-between items-center pb-4 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-2xl font-bold text-gray-800">Lista de Ingreso</h2>
        {entryList.length > 0 && (
          <button onClick={onClearList} className="text-sm text-red-500 hover:underline">
            Vaciar Lista
          </button>
        )}
      </div>

      {entryList.length > 0 && (
        <div className="flex-shrink-0 py-4 border-b-2 border-dashed space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center text-lg">
              <span className="font-semibold text-gray-700">Costo Total de Mercadería</span>
              <span className="font-bold text-2xl text-gray-900">${totalCost.toLocaleString('es-AR')}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-gray-600">
              <span>Total Unidades a Ingresar</span>
              <span className="font-medium">{totalUnits}</span>
            </div>
          </div>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="w-full bg-green-600 text-white py-3 rounded-lg text-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isConfirming ? (
              <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
            ) : (
              <Icon path="M4.5 12.75l6 6 9-13.5" className="w-6 h-6"/>
            )}
            <span>Confirmar Ingreso de Stock</span>
          </button>
        </div>
      )}

      <div className="flex-grow overflow-y-auto pt-4 -mr-3 pr-3 space-y-3">
        {entryList.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-gray-500 h-full">
            <Icon path="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.232 15.18a3 3 0 01-3.375 2.565h-1.5a3 3 0 01-3-3V9.622c0-1.02.622-1.921 1.543-2.311l4.5-1.928a3 3 0 012.914 0l4.5 1.928c.921.39 1.543 1.29 1.543 2.31v5.378a3 3 0 01-1.258 2.45l-4.5 3.288z" className="w-16 h-16 mb-4 text-gray-300" />
            <p className="font-medium">La lista está vacía</p>
            <p className="text-sm text-center">Seleccione productos para ingresar.</p>
          </div>
        ) : (
          entryList.map(item => (
            <EntryListItem
                key={item.product.cod}
                item={item}
                onUpdateQuantity={onUpdateQuantity}
                onUpdateCostPrice={onUpdateCostPrice}
                onUpdateSalePrice={onUpdateSalePrice}
                onRemoveItem={onRemoveItem}
            />
          ))
        )}
      </div>
    </div>
  );
};
