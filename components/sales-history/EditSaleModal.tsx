import React, { useState, useEffect, useMemo } from 'react';
import { Sale, Customer } from '../../types';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { SearchableSelect } from '../ui/SearchableSelect';
// ...existing code...

interface EditSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale;
  customers: Customer[];
  onSave: (updatedSale: Sale) => Promise<void>;
}

const parseLocaleNumber = (value: string): number => {
    if (typeof value !== 'string' || !value) return 0;
    return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
};

export const EditSaleModal: React.FC<EditSaleModalProps> = ({ isOpen, onClose, sale, customers, onSave }) => {
  const [editedSale, setEditedSale] = useState<Sale | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // ...existing code...

  const [discountPercent, setDiscountPercent] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [incrementPercent, setIncrementPercent] = useState('');
  const [incrementAmount, setIncrementAmount] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Deep copy the sale object to avoid direct mutation
      setEditedSale(JSON.parse(JSON.stringify(sale)));

      setDiscountPercent('');
      setIncrementPercent('');
      const adj = sale.adjustmentAmount || 0;
      if (adj < 0) {
        setDiscountAmount(String(Math.abs(adj)).replace('.', ','));
        setIncrementAmount('');
      } else if (adj > 0) {
        setIncrementAmount(String(adj).replace('.', ','));
        setDiscountAmount('');
      } else {
        setDiscountAmount('');
        setIncrementAmount('');
      }

      setIsSaving(false);
    }
  }, [isOpen, sale]);

  const handleFieldChange = (field: keyof Sale, value: any) => {
    if (!editedSale) return;
    setEditedSale(prev => prev ? { ...prev, [field]: value } : null);
  };
  
  const handlePaymentChange = (method: keyof Sale['payment'], value: string) => {
      if (!editedSale) return;
      const numericValue = parseLocaleNumber(value);
      setEditedSale(prev => prev ? {
          ...prev,
          payment: { ...prev.payment, [method]: numericValue }
      } : null);
  };
  
  const handleItemChange = (index: number, field: 'quantity' | 'price', value: string) => {
      if (!editedSale) return;
      const numericValue = parseLocaleNumber(value);
      const updatedItems = [...editedSale.items];
      updatedItems[index] = { ...updatedItems[index], [field]: numericValue };
      setEditedSale(prev => prev ? { ...prev, items: updatedItems } : null);
  };

  const { finalTotal, adjustmentAmount, adjustmentDescription } = useMemo(() => {
    if (!editedSale) return { finalTotal: 0, adjustmentAmount: 0, adjustmentDescription: '' };
    
    const currentSubtotal = editedSale.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    
    let adjustment = 0;
    const descriptions: string[] = [];
    
    const discP = parseLocaleNumber(discountPercent);
    const incP = parseLocaleNumber(incrementPercent);
    const discA = parseLocaleNumber(discountAmount);
    const incA = parseLocaleNumber(incrementAmount);

    if (discP > 0) {
      adjustment -= (currentSubtotal * discP) / 100;
      descriptions.push(`Descuento (${discP}%)`);
    } else if (discA > 0) {
      adjustment -= discA;
      descriptions.push(`Descuento ($${discA.toLocaleString('es-AR')})`);
    }
    
    if (incP > 0) {
      adjustment += (currentSubtotal * incP) / 100;
      descriptions.push(`Recargo (${incP}%)`);
    } else if (incA > 0) {
      adjustment += incA;
      descriptions.push(`Recargo ($${incA.toLocaleString('es-AR')})`);
    }

    return { 
      finalTotal: currentSubtotal + adjustment, 
      adjustmentAmount: adjustment, 
      adjustmentDescription: descriptions.join(' y ')
    };
  }, [editedSale, discountPercent, discountAmount, incrementPercent, incrementAmount]);

  const handleSubmit = async () => {
      if (!editedSale) return;
      
      const currentSubtotal = editedSale.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

      const saleToSave: Sale = {
          ...editedSale,
          subtotal: currentSubtotal,
          total: finalTotal,
          adjustmentAmount: adjustmentAmount,
          adjustmentDescription: adjustmentDescription
      };

      setIsSaving(true);
      try {
          await onSave(saleToSave);
      } catch (error) {
          // Parent handles toast
      } finally {
          setIsSaving(false);
      }
  };

  if (!isOpen || !editedSale) return null;

  return (
    <Modal isOpen={isOpen} onClose={isSaving ? () => {} : onClose} title={`Editando Venta #${sale.id.slice(0, 8)}`} size="xl">
      <div className="space-y-4 max-h-[80vh] flex flex-col">
        {/* Customer and Invoice */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b pb-4">
             <div>
                <label className="block text-sm font-medium text-gray-700">Cliente</label>
                <SearchableSelect
                  options={customers.map(c => ({ value: c.Id_Cliente, label: c['Nombre y Apellido'] }))}
                  value={editedSale.customer?.Id_Cliente || '0'}
                  onChange={(value) => handleFieldChange('customer', customers.find(c => c.Id_Cliente === value) || null)}
                  disabled={isSaving}
                />
            </div>
             <div>
                <label className="block text-sm font-medium text-gray-700">Tipo Factura</label>
                <select
                    value={editedSale.facturacion || 'N'}
                    onChange={(e) => handleFieldChange('facturacion', e.target.value as Sale['facturacion'])}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    disabled={isSaving}
                >
                    <option value="N">N (Sin Factura)</option>
                    <option value="A">Factura A</option>
                    <option value="B">Factura B</option>
                    <option value="C">Factura C</option>
                </select>
            </div>
        </div>

        {/* Items */}
        <div className="flex-grow overflow-y-auto space-y-2 pr-2">
            <h3 className="text-lg font-semibold">Productos</h3>
            {editedSale.items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-x-4 gap-y-2 items-center bg-gray-50 p-2 rounded-md">
                    <div className="col-span-6">
                        <p className="font-medium truncate">{item.product.Producto}</p>
                    </div>
                    <div className="col-span-2">
                         <label className="text-xs">Cant.</label>
                         <input type="text" inputMode="decimal" value={String(item.quantity).replace('.',',')} onChange={e => handleItemChange(index, 'quantity', e.target.value)} className="w-full border-gray-300 rounded-md text-sm p-1" />
                    </div>
                    <div className="col-span-3">
                         <label className="text-xs">P. Unitario</label>
                         <input type="text" inputMode="decimal" value={String(item.price).replace('.',',')} onChange={e => handleItemChange(index, 'price', e.target.value)} className="w-full border-gray-300 rounded-md text-sm p-1" />
                    </div>
                    <div className="col-span-1 text-right">
                         <p className="font-semibold">${(item.quantity * item.price).toLocaleString('es-AR')}</p>
                    </div>
                </div>
            ))}
        </div>
        
        {/* Adjustments Section */}
        <div className="border-t pt-4">
            <h3 className="text-lg font-medium text-gray-800 mb-2">Ajustes de Total</h3>
            <div className="bg-gray-50 p-4 rounded-lg grid grid-cols-2 gap-4">
                {/* Discount */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Descuento</label>
                    <div className="flex space-x-2">
                        <input type="text" inputMode="decimal" placeholder="%" value={discountPercent} onChange={e => { setDiscountPercent(e.target.value); setDiscountAmount(''); }} className="w-full border-gray-300 rounded-md shadow-sm text-sm" />
                        <input type="text" inputMode="decimal" placeholder="$" value={discountAmount} onChange={e => { setDiscountAmount(e.target.value); setDiscountPercent(''); }} className="w-full border-gray-300 rounded-md shadow-sm text-sm" />
                    </div>
                </div>
                {/* Increment */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Recargo</label>
                    <div className="flex space-x-2">
                        <input type="text" inputMode="decimal" placeholder="%" value={incrementPercent} onChange={e => { setIncrementPercent(e.target.value); setIncrementAmount(''); }} className="w-full border-gray-300 rounded-md shadow-sm text-sm" />
                        <input type="text" inputMode="decimal" placeholder="$" value={incrementAmount} onChange={e => { setIncrementAmount(e.target.value); setIncrementPercent(''); }} className="w-full border-gray-300 rounded-md shadow-sm text-sm" />
                    </div>
                </div>
            </div>
        </div>
        
        {/* Payments & Totals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-4">
            {/* Payments */}
            <div className="space-y-2">
                 <h3 className="text-lg font-semibold">Pagos</h3>
                 <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs">Efectivo</label>
                        <input type="text" inputMode="decimal" value={String(editedSale.payment.cash).replace('.',',')} onChange={e => handlePaymentChange('cash', e.target.value)} className="w-full border-gray-300 rounded-md text-sm p-1" />
                    </div>
                    <div>
                        <label className="text-xs">Digital</label>
                        <input type="text" inputMode="decimal" value={String(editedSale.payment.digital).replace('.',',')} onChange={e => handlePaymentChange('digital', e.target.value)} className="w-full border-gray-300 rounded-md text-sm p-1" />
                    </div>
                    <div>
                        <label className="text-xs">Cta. Cte.</label>
                        <input type="text" inputMode="decimal" value={String(editedSale.payment.credit).replace('.',',')} onChange={e => handlePaymentChange('credit', e.target.value)} className="w-full border-gray-300 rounded-md text-sm p-1" />
                    </div>
                     {/* FIX: Display sum of echeqs as read-only, as detailed editing is not supported here. */}
                     <div>
                        <label className="text-xs">E-Cheq (Total)</label>
                        <input type="text" inputMode="decimal" value={String(editedSale.payment.echeqs?.reduce((s, e) => s + e.amount, 0) || 0).replace('.',',')} readOnly title="La edición detallada de E-Cheqs no está soportada aquí." className="w-full border-gray-300 rounded-md text-sm p-1 bg-gray-100" />
                    </div>
                 </div>
            </div>
            {/* Totals & Adjustments */}
            <div className="space-y-2">
                 <h3 className="text-lg font-semibold">Totales</h3>
                 <div className="bg-blue-50 p-2 rounded-md text-right space-y-1 mt-2">
                    <p>Subtotal: <span className="font-semibold">${(editedSale.items.reduce((sum, item) => sum + item.price * item.quantity, 0)).toLocaleString('es-AR')}</span></p>
                    {adjustmentAmount !== 0 && (
                        <p className={`${adjustmentAmount < 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {adjustmentDescription}: <span className="font-semibold">{adjustmentAmount < 0 ? '-' : '+'}$ {Math.abs(adjustmentAmount).toLocaleString('es-AR')}</span>
                        </p>
                    )}
                    <p className="text-xl font-bold">Total Final: <span className="text-blue-700">${finalTotal.toLocaleString('es-AR')}</span></p>
                 </div>
            </div>
        </div>


        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button onClick={onClose} disabled={isSaving} className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50">Cancelar</button>
          <button onClick={handleSubmit} disabled={isSaving} className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 flex items-center space-x-2">
            {isSaving ? (
                 <>
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                    <span>Guardando...</span>
                </>
            ) : (
                <>
                    <Icon path="M4.5 12.75l6 6 9-13.5" className="w-5 h-5"/>
                    <span>Guardar Cambios</span>
                </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
