
import React, { useState, useEffect, useMemo, useContext } from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { Budget, Customer, Sale, ECheq } from '../../types';
import { useToast } from '../../contexts/ToastContext';
import * as api from '../../services/api';
import { AuthContext } from '../../contexts/AuthContext';
import { generateReceiptHtml, generateInvoiceHtml } from '../pos/Receipt';
import { getPrintStyles } from '../../utils/printStyles';
import { sendTicketViaWhatsApp } from '../../utils/whatsappHelper';

interface ConvertBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  budget: Budget;
  onSaleFinalized: (sale: Sale) => void;
  customers: Customer[];
}

const parseLocaleNumber = (value: string): number => {
    if (typeof value !== 'string' || !value) return 0;
    return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
};

const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const ConvertBudgetModal: React.FC<ConvertBudgetModalProps> = ({ isOpen, onClose, budget, onSaleFinalized, customers }) => {
  const [cash, setCash] = useState('');
  const [digital, setDigital] = useState('');
  const [credit, setCredit] = useState('');
  const [echeqs, setEcheqs] = useState<ECheq[]>([]);
  
  const [generateInvoice, setGenerateInvoice] = useState(false);
  const [condicionIVA, setCondicionIVA] = useState<Customer['Condicion_IVA']>('Consumidor Final');
  const [facturacionType, setFacturacionType] = useState<'A' | 'B'>('B');
  const [billingDoc, setBillingDoc] = useState('');
  const [billingDocType, setBillingDocType] = useState('DNI');

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer>(budget.customer);

  const [discountPercent, setDiscountPercent] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [recargoPercent, setRecargoPercent] = useState('');
  const [recargoAmount, setRecargoAmount] = useState('');

  const { addToast } = useToast();
  const { activeShift } = useContext(AuthContext);

  const subtotal = useMemo(() => budget.total, [budget.total]);
  
  const { total, adjustmentAmount, adjustmentDescription } = useMemo(() => {
    let currentTotal = subtotal;
    let adjustment = 0;
    const descriptions: string[] = [];

    const dP = parseLocaleNumber(discountPercent);
    const dA = parseLocaleNumber(discountAmount);
    const rP = parseLocaleNumber(recargoPercent);
    const rA = parseLocaleNumber(recargoAmount);

    if (dP > 0) {
      const discountValue = (subtotal * dP) / 100;
      adjustment -= discountValue;
      descriptions.push(`Desc ${dP}%`);
    }
    if (dA > 0) {
      adjustment -= dA;
      descriptions.push(`Desc ${formatCurrency(dA)}`);
    }

    if (rP > 0) {
      const recargoValue = (subtotal * rP) / 100;
      adjustment += recargoValue;
      descriptions.push(`Recargo ${rP}%`);
    }
    if (rA > 0) {
      adjustment += rA;
      descriptions.push(`Recargo ${formatCurrency(rA)}`);
    }
    
    currentTotal += adjustment;

    return { 
      total: currentTotal > 0 ? currentTotal : 0,
      adjustmentAmount: adjustment,
      adjustmentDescription: descriptions.join(' / ')
    };
  }, [subtotal, discountPercent, discountAmount, recargoPercent, recargoAmount]);
  
  const totalEcheqs = useMemo(() => echeqs.reduce((sum, echeq) => sum + echeq.amount, 0), [echeqs]);

  const totalPaid = useMemo(() => {
    return parseLocaleNumber(cash) + parseLocaleNumber(digital) + parseLocaleNumber(credit) + totalEcheqs;
  }, [cash, digital, credit, totalEcheqs]);

  const change = useMemo(() => totalPaid - total, [totalPaid, total]);

  // Inicialización del modal y búsqueda robusta del cliente
  useEffect(() => {
    if (isOpen) {
      setCash('');
      setDigital('');
      setCredit('');
      setEcheqs([]);
      setGenerateInvoice(false);
      setIsProcessing(false);
      setError('');
      
      // Buscar cliente actualizado usando comparación estricta de strings para evitar fallos por tipos
      const targetId = String(budget.customer.Id_Cliente).trim();
      const fullCustomer = customers.find(c => String(c.Id_Cliente).trim() === targetId) || budget.customer;
      
      setSelectedCustomer(fullCustomer);
      
      // Precargar datos de facturación inmediatamente con el cliente encontrado
      setCondicionIVA(fullCustomer.Condicion_IVA || 'Consumidor Final');
      setBillingDoc(fullCustomer.Documento || '');
      setBillingDocType(fullCustomer['Tipo.Documento'] || 'DNI');
      
      setDiscountPercent('');
      setDiscountAmount('');
      setRecargoPercent('');
      setRecargoAmount('');
    }
  }, [isOpen, budget, customers]);

  // Sincronización IVA -> Tipo de Factura y Tipo de Documento
  useEffect(() => {
    if (condicionIVA === 'Responsable Inscripto') {
        setFacturacionType('A');
        setBillingDocType('CUIT');
    } else {
        setFacturacionType('B');
    }
  }, [condicionIVA]);

  const handleAddEcheq = () => {
    setEcheqs(prev => [...prev, { amount: 0, days: 0 }]);
  };

  const handleEcheqChange = (index: number, field: 'amount' | 'days', value: string) => {
    const numericValue = parseInt(value, 10) || 0;
    setEcheqs(prev => prev.map((echeq, i) => i === index ? { ...echeq, [field]: numericValue } : echeq));
  };

  const handleRemoveEcheq = (index: number) => {
    setEcheqs(prev => prev.filter((_, i) => i !== index));
  };

  const handleFinalize = async () => {
    setError('');
    if (!activeShift) {
        setError('No hay un turno activo. No se puede registrar la venta.');
        return;
    }
    if (total > 0 && totalPaid < total) {
      setError(`El pago (${formatCurrency(totalPaid)}) es menor que el total (${formatCurrency(total)}).`);
      return;
    }

    if (generateInvoice) {
        if (selectedCustomer.Id_Cliente === '0' && total > 90000) {
            setError('No se puede facturar montos altos a "Consumidor Final" genérico. Identifique al cliente.');
            return;
        }
        if (condicionIVA === 'Responsable Inscripto' && billingDocType !== 'CUIT') {
            setError("Error: Para Responsable Inscripto el tipo de documento debe ser obligatoriamente CUIT.");
            return;
        }
        if (!billingDoc) {
            setError("Error: Debe ingresar el número de documento para generar la factura.");
            return;
        }
    }

    setIsProcessing(true);
    
    let saleObject: Sale = {
        ...budget,
        date: new Date(),
        customer: {
            ...selectedCustomer,
            Condicion_IVA: condicionIVA,
            Documento: billingDoc,
            'Tipo.Documento': billingDocType
        },
        subtotal: subtotal,
        total: total,
        adjustmentAmount: adjustmentAmount,
        adjustmentDescription: adjustmentDescription,
        payment: {
            cash: parseLocaleNumber(cash),
            digital: parseLocaleNumber(digital),
            credit: parseLocaleNumber(credit),
            echeqs: echeqs,
        },
        facturacion: generateInvoice ? facturacionType : 'N',
        shiftId: activeShift.ID_Turno,
        itemCount: budget.items.reduce((sum, item) => sum + item.quantity, 0),
        status: 'active',
    };
    
    try {
        if (generateInvoice) {
            addToast('Generando factura electrónica...', 'info');
            const invoiceResponse = await api.generateElectronicInvoice(saleObject);
            const invoiceData = invoiceResponse.data;
            if (!invoiceData || !invoiceData.cae || invoiceData.cae === 'DEV_MODE_NO_CAE') {
                throw new Error("El proveedor de facturación respondió sin un CAE. Venta NO registrada.");
            }
            saleObject.facturaInfo = {
                cae: invoiceData.cae, nro: invoiceData.nro, vtoCae: invoiceData.vtoCae,
                qrData: invoiceData.qrData, fecha: new Date().toLocaleString('es-AR'), url: invoiceData.url
            };
            addToast(`Factura ${invoiceData.nro} generada. Registrando venta...`, 'success');
        }

        const ticketWindow = window.open('', '_blank', 'width=350,height=650,scrollbars=yes,resizable=yes');
        if (ticketWindow) {
            const printStyles = getPrintStyles();
            const ticketHtml = saleObject.facturaInfo
                ? generateInvoiceHtml(saleObject, printStyles)
                : generateReceiptHtml(saleObject, printStyles);
            ticketWindow.document.write(ticketHtml);
            ticketWindow.document.close();
            setTimeout(() => {
                ticketWindow.focus();
                ticketWindow.print();
            }, 500);
        }

        await api.convertBudgetToSale(budget, saleObject.payment, activeShift.ID_Turno, saleObject.facturacion, saleObject.customer, total, adjustmentAmount, adjustmentDescription);
        onSaleFinalized(saleObject);
        onClose();

        setTimeout(() => {
            if (saleObject.customer && saleObject.customer.Id_Cliente !== '0' && saleObject.customer.Whatsapp) {
                sendTicketViaWhatsApp(saleObject, addToast);
            }
        }, 200);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };


  return (
    <Modal isOpen={isOpen} onClose={isProcessing ? () => {} : onClose} title="Convertir Presupuesto a Venta" size="4xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg flex justify-between items-center border border-gray-200">
                  <span className="text-xl font-bold text-gray-800">Total a Pagar</span>
                  <span className="text-3xl font-bold text-blue-600">{formatCurrency(total)}</span>
              </div>
              
              <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-800">Ajustes de Total</h3>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-2">
                           <label className="block text-sm font-medium text-green-800">Descuento</label>
                          <div className="flex items-center space-x-2">
                              <div className="relative flex-grow">
                                  <input type="text" inputMode="decimal" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} className="w-full border-green-300 rounded-md shadow-sm text-sm pl-2 pr-6" />
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500 text-sm">%</span>
                              </div>
                              <div className="relative flex-grow">
                                  <input type="text" inputMode="decimal" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} className="w-full border-green-300 rounded-md shadow-sm text-sm pl-6 pr-2" />
                                   <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-gray-500 text-sm">$</span>
                              </div>
                          </div>
                      </div>
                      <div className="bg-red-50 p-4 rounded-lg border border-red-200 space-y-2">
                          <label className="block text-sm font-medium text-red-800">Recargo</label>
                          <div className="flex items-center space-x-2">
                              <div className="relative flex-grow">
                                  <input type="text" inputMode="decimal" value={recargoPercent} onChange={e => setRecargoPercent(e.target.value)} className="w-full border-red-300 rounded-md shadow-sm text-sm pl-2 pr-6" />
                                  <span className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500 text-sm">%</span>
                              </div>
                              <div className="relative flex-grow">
                                  <input type="text" inputMode="decimal" value={recargoAmount} onChange={e => setRecargoAmount(e.target.value)} className="w-full border-red-300 rounded-md shadow-sm text-sm pl-6 pr-2" />
                                  <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-gray-500 text-sm">$</span>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 {['cash', 'digital', 'credit'].map(method => (
                    <div key={method}>
                        <label className="block text-sm font-medium text-gray-700 capitalize">{method === 'credit' ? 'Cta. Cte.' : method}</label>
                        <div className="relative mt-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={{ cash, digital, credit }[method as 'cash' | 'digital' | 'credit']}
                                onChange={e => {
                                    const value = e.target.value;
                                    if (method === 'cash') setCash(value);
                                    if (method === 'digital') setDigital(value);
                                    if (method === 'credit') setCredit(value);
                                }}
                                className="w-full text-lg border-gray-300 rounded-md py-1.5 pl-6"
                                disabled={isProcessing}
                            />
                        </div>
                    </div>
                ))}
              </div>
               <div className="space-y-2 pt-2">
                  <label className="block text-sm font-medium text-gray-700">E-Cheqs</label>
                  {echeqs.map((echeq, index) => (
                      <div key={index} className="flex items-center space-x-2 bg-gray-50 p-2 rounded">
                          <input type="number" placeholder="Monto" value={echeq.amount || ''} onChange={e => handleEcheqChange(index, 'amount', e.target.value)} className="w-1/2 border-gray-300 rounded-md text-sm" />
                          <input type="number" placeholder="Días" value={echeq.days || ''} onChange={e => handleEcheqChange(index, 'days', e.target.value)} className="w-1/3 border-gray-300 rounded-md text-sm" />
                          <button type="button" onClick={() => handleRemoveEcheq(index)} className="text-red-500 hover:text-red-700 p-1"><Icon path="M6 18L18 6M6 6l12 12" className="w-4 h-4" /></button>
                      </div>
                  ))}
                  <button type="button" onClick={handleAddEcheq} className="text-sm text-blue-600 hover:underline">+ Agregar E-Cheq</button>
                  {totalEcheqs > 0 && <p className="text-right text-sm font-semibold">Total E-Cheqs: {formatCurrency(totalEcheqs)}</p>}
              </div>
              
               <div className="bg-gray-100 p-4 rounded-lg space-y-3 border border-gray-200">
                  <div className="flex justify-between items-center text-lg">
                      <span className="font-semibold text-gray-700">Total Pagado</span>
                      <span className="font-bold">{formatCurrency(totalPaid)}</span>
                  </div>
                  <div className="flex justify-between items-center text-lg">
                      <span className={`font-semibold ${change < 0 ? 'text-red-600' : 'text-green-600'}`}>{change < 0 ? 'Faltan' : 'Vuelto'}</span>
                      <span className={`font-bold ${change < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(Math.abs(change))}</span>
                  </div>
              </div>
          </div>
          
          <div className="space-y-6 flex flex-col">
               <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <p className="text-sm font-medium text-gray-700">Cliente Asociado:</p>
                  <p className="text-xl font-bold text-gray-900">{selectedCustomer['Nombre y Apellido']}</p>
                  <p className="text-xs text-gray-500 mt-1">{selectedCustomer.Condicion_IVA} | {selectedCustomer.Documento || 'Sin doc.'}</p>
               </div>

               <div className="space-y-3 pt-4 border-t">
                  <label className="flex items-center space-x-3 cursor-pointer">
                      <input type="checkbox" checked={generateInvoice} onChange={e => setGenerateInvoice(e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600" disabled={isProcessing}/>
                      <span className="font-medium text-gray-700">Generar Factura Electrónica</span>
                  </label>
                  
                  {generateInvoice && (
                      <div className="bg-blue-50 p-4 rounded-lg space-y-4 border border-blue-200">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-sm font-medium text-gray-700">Condición ante el IVA</label>
                                  <select value={condicionIVA} onChange={e => setCondicionIVA(e.target.value as Customer['Condicion_IVA'])} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isProcessing}>
                                      <option>Consumidor Final</option>
                                      <option>Responsable Inscripto</option>
                                      <option>Responsable Monotributo</option>
                                      <option>Sujeto Exento</option>
                                      <option>Sujeto no Categorizado</option>
                                      <option>IVA No Alcanzado</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-gray-700">Tipo Factura</label>
                                  <select 
                                      value={facturacionType} 
                                      className="mt-1 block w-full border-gray-300 rounded-md bg-gray-100 font-bold" 
                                      disabled={true} 
                                      title="Se determina automáticamente según la condición ante el IVA"
                                  >
                                      <option value="A">Factura A</option>
                                      <option value="B">Factura B</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-gray-700">Tipo Documento</label>
                                  <select 
                                      value={billingDocType} 
                                      onChange={e => setBillingDocType(e.target.value)} 
                                      className={`mt-1 block w-full border-gray-300 rounded-md ${condicionIVA === 'Responsable Inscripto' ? 'bg-gray-100 font-bold' : ''}`}
                                      disabled={condicionIVA === 'Responsable Inscripto'}
                                  >
                                      <option value="DNI">DNI</option>
                                      <option value="CUIT">CUIT</option>
                                      <option value="CUIL">CUIL</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-gray-700">Nro. de Documento</label>
                                  <input 
                                      type="text" 
                                      value={billingDoc} 
                                      onChange={e => setBillingDoc(e.target.value)} 
                                      className="mt-1 block w-full border-gray-300 rounded-md"
                                      placeholder={billingDocType === 'CUIT' ? '20-XXXXXXXX-X' : 'XXXXXXXX'}
                                      disabled={isProcessing}
                                  />
                              </div>
                          </div>
                          <div className="flex justify-center pt-2">
                              <img src="https://dgrentas.arcat.gob.ar/IngresosBrutosAFIp/assets/img/Rentas-Logo-nuevo-chico.png" alt="Logo ARCA" className="h-10 opacity-75"/>
                          </div>
                      </div>
                  )}
              </div>

              <div className="flex-grow"></div>

              {error && <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm font-bold border border-red-200">{error}</div>}

              <div className="pt-4 border-t flex justify-end space-x-3">
                  <button onClick={onClose} disabled={isProcessing} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300">Cancelar</button>
                  <button onClick={handleFinalize} disabled={isProcessing} className="w-64 bg-green-600 text-white py-3 rounded-lg text-lg font-semibold hover:bg-green-700 flex items-center justify-center space-x-2 disabled:bg-gray-400">
                       {isProcessing ? (
                          <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                      ) : (
                          <Icon path="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z" className="w-6 h-6"/>
                      )}
                      <span>{isProcessing ? 'Procesando...' : 'Confirmar Venta'}</span>
                  </button>
              </div>
          </div>
      </div>
    </Modal>
  );
};
