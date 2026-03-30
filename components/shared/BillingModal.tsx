
import React, { useState, useEffect } from 'react';
import { Sale, Customer } from '../../types';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale;
  onSuccess: () => void;

  // NUEVO: si es false, NO abre ningún PDF/ticket automáticamente al facturar.
  // Default: true (para no cambiar el comportamiento del POS).
  autoOpen?: boolean;
}

interface BillingData {
    customerName: string;
    customerDoc: string;
    customerDocType: string;
    paymentCondition: string;
    condicionIVA: Customer['Condicion_IVA'];
    facturacionType: 'A' | 'B';
}

export const BillingModal: React.FC<BillingModalProps> = ({ isOpen, onClose, sale, onSuccess, autoOpen = true }) => {
      const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawApiResponse, setRawApiResponse] = useState<string | null>(null);
  const { addToast } = useToast();
  
  const [billingData, setBillingData] = useState<BillingData>({
      customerName: '',
      customerDoc: '',
      customerDocType: 'DNI',
      paymentCondition: 'Transferencia Bancaria',
      condicionIVA: 'Consumidor Final',
      facturacionType: 'B'
  });

  useEffect(() => {
    if (isOpen) {
      setError(null);
      
      const initialCondicion = sale.customer?.Condicion_IVA || 'Consumidor Final';
      const initialFacturacion = initialCondicion === 'Responsable Inscripto' ? 'A' : 'B';
      const initialDocType = initialFacturacion === 'A' ? 'CUIT' : (sale.customer?.['Tipo.Documento'] || 'DNI');

      setBillingData({
          customerName: sale.customer?.['Nombre y Apellido'] || 'Consumidor Final',
          customerDoc: sale.customer?.Documento || '',
          customerDocType: initialDocType,
          paymentCondition: 'Transferencia Bancaria',
          condicionIVA: initialCondicion,
          facturacionType: initialFacturacion
      });
      setIsProcessing(false);
      setRawApiResponse(null);
    }
  }, [isOpen, sale]);

  // Sincronización IVA -> Tipo Factura y Doc (Factura A solo para RI con CUIT)
  useEffect(() => {
    if (billingData.condicionIVA === 'Responsable Inscripto') {
      setBillingData(prev => ({...prev, facturacionType: 'A', customerDocType: 'CUIT'}));
    } else {
      setBillingData(prev => ({...prev, facturacionType: 'B'}));
    }
  }, [billingData.condicionIVA]);
  
  const handleDataChange = (field: keyof BillingData, value: string) => {
      setBillingData(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerateInvoice = async () => {
    setIsProcessing(true);
    setError(null);
    setRawApiResponse(null);

    // Validación de seguridad para evitar enviar inconsistencias al API
    if (billingData.facturacionType === 'A' && billingData.customerDocType !== 'CUIT') {
        setError("Error: Para Factura A la AFIP exige que el tipo de documento sea CUIT.");
        setIsProcessing(false);
        return;
    }

        const normalizedItems = (sale.items || []).map((item) => {
            const unitPrice = Number((item as any).price ?? item?.product?.Precio ?? item?.product?.['Precio Final'] ?? 0);
            const safePrice = Number.isFinite(unitPrice) ? unitPrice : 0;
            return {
                ...item,
                price: safePrice,
                product: {
                    ...item.product,
                    Precio: safePrice,
                }
            };
        });

        const saleForBilling: Sale = {
                id: sale.id,
                date: sale.date,
                items: normalizedItems,
        itemCount: sale.itemCount || sale.items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: sale.subtotal,
        adjustmentAmount: sale.adjustmentAmount || 0,
        adjustmentDescription: sale.adjustmentDescription || '',
        total: sale.total,
        payment: sale.payment,
        shiftId: sale.shiftId,
        facturacion: billingData.facturacionType,
                paymentCondition: billingData.paymentCondition || 'Transferencia Bancaria',
        customer: {
            ...(sale.customer || {
                Id_Cliente: '0',
                'Nombre y Apellido': '',
                Whatsapp: '',
                'Tipo.Documento': '',
                Documento: '',
                Condicion_IVA: 'Consumidor Final',
                Deuda: 0,
                Pagos: 0
            }),
            'Nombre y Apellido': String(billingData.customerName || '').trim() || 'Consumidor Final',
            Documento: String(billingData.customerDoc || '').trim(),
            Condicion_IVA: billingData.condicionIVA,
            'Tipo.Documento': billingData.customerDocType
        } as Customer
    };

    try {
      const apiResponse = await api.generateElectronicInvoice(saleForBilling);
      
      const debugInfo = apiResponse.debug || [];
      const rawResponseLine = debugInfo.find((line: string) => line.startsWith('API Response Body:'));
            const rawResponse = rawResponseLine ? rawResponseLine.substring('API Response Body: '.length) : (debugInfo.length ? debugInfo.join('\n') : 'Sin detalle técnico devuelto por la función.');
      setRawApiResponse(rawResponse);

      if (apiResponse.status !== 'facturado' || !apiResponse.data) {
        throw new Error(apiResponse.message || "El proveedor de facturación no devolvió datos válidos.");
      }

      const invoiceData = apiResponse.data;
      const { cae, nro, vtoCae, qrData } = invoiceData;
      
      const a4Url = invoiceData.comprobante_pdf_url || invoiceData.url;
      const ticketUrl = invoiceData.comprobante_ticket_url;
      
      if (!cae || !nro || cae === 'DEV_MODE_NO_CAE') {
        const noCaeError = new Error("Respuesta exitosa, pero no se recibió un CAE. La cuenta del proveedor puede estar en modo de prueba.");
        throw noCaeError;
      }

      const effectiveType = apiResponse.data?.effectiveType || billingData.facturacionType;
      await api.markSaleAsBilled(sale.id, cae, nro, vtoCae, qrData, new Date(), a4Url || '', ticketUrl, effectiveType);
      
      addToast(`Factura ${nro} generada y registrada con éxito.`, 'success');
      onSuccess();
      onClose();

// Abrir ticket oficial automáticamente tras éxito (solo si autoOpen === true)
if (autoOpen) {
  const officialUrl = ticketUrl || a4Url;
  if (officialUrl) {
    window.open(officialUrl, '_blank');
  }
}

    } catch (err) {
      const error = err as any;
      const errorMessage = error.message || "Ocurrió un error desconocido al generar la factura.";
      
      if (!rawApiResponse && error.debugInfo) {
        const debugInfo = error.debugInfo || [];
        const rawResponseLine = debugInfo.find((line: string) => line.startsWith('API Response Body:'));
                const rawResponse = rawResponseLine ? rawResponseLine.substring('API Response Body: '.length) : (debugInfo.length ? debugInfo.join('\n') : 'Sin detalle técnico devuelto por la función.');
        setRawApiResponse(rawResponse);
      }

      setError(errorMessage);
      addToast(errorMessage, 'error');

    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={isProcessing ? () => {} : onClose} title={`Facturar Venta #${sale.id.slice(0, 8)}`}>
        <div className="space-y-6">
            {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4">
                    <div className="flex">
                        <div className="flex-shrink-0">
                             <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="h-5 w-5 text-red-400"/>
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-bold text-red-800">Error al Facturar</h3>
                            <div className="mt-2 text-sm text-red-700">
                                <p className="font-bold">{error}</p>
                            </div>
                             {rawApiResponse && (
                                <details className="mt-2 text-xs">
                                    <summary className="cursor-pointer font-medium text-red-800 hover:underline">Mostrar detalles técnicos para el proveedor</summary>
                                    <pre className="mt-1 p-2 bg-red-100 text-red-900 rounded-md whitespace-pre-wrap break-all overflow-x-auto">
                                        <code>{rawApiResponse}</code>
                                    </pre>
                                </details>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            <fieldset className="border p-4 rounded-lg" disabled={isProcessing}>
                <legend className="text-sm font-semibold px-2">Datos para la Factura</legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="billing-customer-name" className="block text-sm font-medium text-gray-700">Nombre y Apellido / Razón Social</label>
                        <input
                            type="text"
                            id="billing-customer-name"
                            value={billingData.customerName}
                            onChange={(e) => handleDataChange('customerName', e.target.value)}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
                        />
                    </div>
                     <div>
                        <label htmlFor="billing-condicion-iva" className="block text-sm font-medium text-gray-700">Condición ante el IVA</label>
                        <select
                            id="billing-condicion-iva"
                            value={billingData.condicionIVA}
                            onChange={(e) => handleDataChange('condicionIVA', e.target.value as any)}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
                        >
                            <option>Consumidor Final</option>
                            <option>Responsable Inscripto</option>
                            <option>Responsable Monotributo</option>
                            <option>Sujeto Exento</option>
                            <option>Sujeto no Categorizado</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="billing-customer-doc-type" className="block text-sm font-medium text-gray-700">Tipo Documento</label>
                        <select
                            id="billing-customer-doc-type"
                            value={billingData.customerDocType}
                            onChange={(e) => handleDataChange('customerDocType', e.target.value)}
                            className={`mt-1 block w-full border-gray-300 rounded-md shadow-sm ${billingData.condicionIVA === 'Responsable Inscripto' ? 'bg-gray-100 font-bold' : ''}`}
                            disabled={billingData.condicionIVA === 'Responsable Inscripto'}
                        >
                            <option value="DNI">DNI</option>
                            <option value="CUIT">CUIT</option>
                            <option value="CUIL">CUIL</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="billing-customer-doc" className="block text-sm font-medium text-gray-700">Nro. de Documento</label>
                        <input
                            type="text"
                            id="billing-customer-doc"
                            value={billingData.customerDoc}
                            onChange={(e) => handleDataChange('customerDoc', e.target.value)}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
                            placeholder={billingData.customerDocType === 'CUIT' ? '20-XXXXXXXX-X' : 'XXXXXXXX'}
                        />
                    </div>
                     <div>
                        <label htmlFor="billing-payment-cond" className="block text-sm font-medium text-gray-700">Cond. Venta/Pago</label>
                        <input
                            type="text"
                            id="billing-payment-cond"
                            value={billingData.paymentCondition}
                            onChange={(e) => handleDataChange('paymentCondition', e.target.value)}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
                        />
                    </div>
                    <div>
                        <label htmlFor="billing-factura-tipo" className="block text-sm font-medium text-gray-700 font-bold">Tipo Factura</label>
                        <select
                            id="billing-factura-tipo"
                            value={billingData.facturacionType}
                            onChange={(e) => handleDataChange('facturacionType', e.target.value as any)}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
                            disabled={isProcessing}
                        >
                            <option value="A">Factura A</option>
                            <option value="B">Factura B</option>
                        </select>
                    </div>
                </div>
            </fieldset>
            
            <div className="flex justify-end space-x-3 pt-4 border-t">
                <button 
                    type="button" 
                    onClick={onClose} 
                    disabled={isProcessing}
                    className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50"
                >
                    Cancelar
                </button>
                <button 
                    type="button" 
                    onClick={handleGenerateInvoice}
                    disabled={isProcessing || (error !== null && !rawApiResponse)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center space-x-2 w-48 disabled:bg-gray-400"
                >
                    {isProcessing ? (
                        <>
                            <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                            <span>Generando...</span>
                        </>
                    ) : (
                        <>
                            <Icon path="M18 3H9v18M9 12h6" className="w-5 h-5"/>
                            <span>{error ? 'Reintentar' : 'Generar Factura'}</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    </Modal>
  );
};
