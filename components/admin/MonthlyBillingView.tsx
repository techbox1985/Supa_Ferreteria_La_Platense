import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Sale } from '../../types';
import { StatCard } from '../dashboard/StatCard';
import { Icon } from '../ui/Icon';
import { BillingModal } from '../shared/BillingModal';
import { useToast } from '../../contexts/ToastContext';
import * as api from '../../services/api';

interface MonthlyBillingViewProps {
    processedSales: Sale[];
    refreshData: () => void;
}

const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const MonthlyBillingView: React.FC<MonthlyBillingViewProps> = ({ processedSales, refreshData }) => {
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        // First day of the current month
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const tomorrow = new Date();
        // Set to tomorrow to include all of today's sales
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    });
    const [saleToBill, setSaleToBill] = useState<Sale | null>(null);
    const [isBulkBilling, setIsBulkBilling] = useState(false);
    const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
    const [lastBillingIncidents, setLastBillingIncidents] = useState<Array<{ saleId: string; customerName: string; reason: string }>>([]);
    const { addToast } = useToast();

    const hasInvoiceCae = useCallback((sale: Sale) => Boolean(sale.facturaInfo?.cae), []);

    const filteredSales = useMemo(() => {
        if (!startDate || !endDate || !processedSales.length) return [];

        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
        const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
        
        const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
        const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

        return processedSales.filter(sale => {
            const saleDate = new Date(sale.date);
            // FIX: Check for digital payment by summing the amounts from the echeqs array.
            const isDigitalPayment = sale.payment.digital > 0 || (sale.payment.echeqs?.reduce((sum, e) => sum + e.amount, 0) || 0) > 0;
            return saleDate >= start && saleDate <= end && sale.status !== 'annulled' && isDigitalPayment;
        });
    }, [processedSales, startDate, endDate]);
    
    const stats = useMemo(() => {
        const digitalSales = filteredSales;

        // FIX: Sum the amounts from the echeqs array for accurate total digital income.
        const totalDigitalIncome = digitalSales.reduce((sum, s) => sum + s.payment.digital + (s.payment.echeqs?.reduce((eSum, e) => eSum + e.amount, 0) || 0), 0);
        
        const billedSales = digitalSales.filter(hasInvoiceCae);
        // FIX: Sum the amounts from the echeqs array for accurate total billed amount.
        const totalBilled = billedSales.reduce((sum, s) => sum + s.payment.digital + (s.payment.echeqs?.reduce((eSum, e) => eSum + e.amount, 0) || 0), 0);
        
        const pendingToBill = totalDigitalIncome - totalBilled;

        return { totalDigitalIncome, totalBilled, pendingToBill };
    }, [filteredSales, hasInvoiceCae]);

    const pendingSales = useMemo(() => filteredSales.filter(s => !hasInvoiceCae(s)), [filteredSales, hasInvoiceCae]);
    const selectedPendingCount = useMemo(
        () => selectedSaleIds.filter(id => pendingSales.some(sale => sale.id === id)).length,
        [pendingSales, selectedSaleIds]
    );
    const areAllPendingSelected = pendingSales.length > 0 && selectedPendingCount === pendingSales.length;

    useEffect(() => {
        // Keep selection consistent with currently visible pending sales.
        const pendingIds = new Set(pendingSales.map(sale => sale.id));
        setSelectedSaleIds(prev => prev.filter(id => pendingIds.has(id)));
    }, [pendingSales]);
    
    const handleBillingSuccess = useCallback(() => {
        setSaleToBill(null);
        addToast('Factura generada con éxito.', 'success');
        refreshData();
    }, [addToast, refreshData]);

    const handleToggleSaleSelection = useCallback((saleId: string) => {
        setSelectedSaleIds(prev => (prev.includes(saleId) ? prev.filter(id => id !== saleId) : [...prev, saleId]));
    }, []);

    const handleToggleAllPendingSelection = useCallback(() => {
        if (areAllPendingSelected) {
            setSelectedSaleIds([]);
            return;
        }
        setSelectedSaleIds(pendingSales.map(sale => sale.id));
    }, [areAllPendingSelected, pendingSales]);

    const handleBulkBilling = useCallback(async () => {
        if (isBulkBilling || selectedPendingCount === 0) return;

        const selectedPendingSales = pendingSales.filter(sale => selectedSaleIds.includes(sale.id));
        if (selectedPendingSales.length === 0) return;

        setIsBulkBilling(true);
        let successful = 0;
        let failed = 0;
        let skipped = 0;
        const incidents: Array<{ saleId: string; customerName: string; reason: string }> = [];

        for (const sale of selectedPendingSales) {
            // Validación mínima: cliente con nombre identificable
            // El documento y otras normalizaciones se pueden manejar en el nivel de API
            const customerName = String(sale.customer?.['Nombre y Apellido'] ?? '').trim();

            if (!sale.customer || !customerName) {
              skipped += 1;
              incidents.push({
                saleId: sale.id.slice(0, 8),
                customerName: 'Sin cliente',
                reason: 'Datos de cliente insuficientes'
              });
              continue;
            }

            try {
                const apiResponse = await api.generateElectronicInvoice(sale);
                if (apiResponse.status !== 'facturado' || !apiResponse.data) {
                    failed += 1;
                    incidents.push({
                      saleId: sale.id.slice(0, 8),
                      customerName,
                      reason: apiResponse.message || 'Error en respuesta de facturación'
                    });
                    continue;
                }

                const invoiceData = apiResponse.data;
                const { cae, nro, vtoCae, qrData } = invoiceData;
                const a4Url = invoiceData.comprobante_pdf_url || invoiceData.url || '';
                const ticketUrl = invoiceData.comprobante_ticket_url;

                if (!cae || !nro || cae === 'DEV_MODE_NO_CAE') {
                    failed += 1;
                    incidents.push({
                      saleId: sale.id.slice(0, 8),
                      customerName,
                      reason: 'CAE o número de factura inválido'
                    });
                    continue;
                }

                const effectiveType = apiResponse.data?.effectiveType || sale.facturacion;
                await api.markSaleAsBilled(sale.id, cae, nro, vtoCae, qrData, new Date(), a4Url, ticketUrl, effectiveType);
                successful += 1;
            } catch (err) {
                failed += 1;
                incidents.push({
                  saleId: sale.id.slice(0, 8),
                  customerName,
                  reason: (err as any)?.message || 'Error inesperado'
                });
            }
        }

        setLastBillingIncidents(incidents);

        if (successful > 0 && failed === 0 && skipped === 0) {
            addToast(`Facturación masiva completada: ${successful} venta(s) facturada(s).`, 'success');
        } else if (successful > 0 || failed > 0 || skipped > 0) {
            let msg = `Facturación masiva finalizada: `;
            const parts = [];
            if (successful > 0) parts.push(`${successful} exitosa(s)`);
            if (failed > 0) parts.push(`${failed} fallida(s)`);
            if (skipped > 0) parts.push(`${skipped} sin datos válidos`);
            addToast(msg + parts.join(', ') + '.', successful > 0 ? 'info' : 'error');
        } else {
            addToast(`Facturación masiva: ninguna venta fue procesada.`, 'error');
        }

        await refreshData();
        setSelectedSaleIds([]);
        setIsBulkBilling(false);
    }, [addToast, isBulkBilling, pendingSales, refreshData, selectedPendingCount, selectedSaleIds]);

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h1 className="text-3xl font-bold text-gray-800">Facturación por Período</h1>
                {pendingSales.length > 0 && (
                    <button
                        type="button"
                        onClick={handleBulkBilling}
                        disabled={isBulkBilling || selectedPendingCount === 0}
                        className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {isBulkBilling ? (
                            <>
                                <Icon
                                    path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z"
                                    className="w-4 h-4 animate-spin"
                                />
                                <span>Facturando...</span>
                            </>
                        ) : (
                            <>
                                <Icon path="M18 3H9v18M9 12h6" className="w-4 h-4" />
                                <span>Facturar seleccionadas ({selectedPendingCount})</span>
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row md:items-end gap-4">
                <div className="flex-grow">
                    <label htmlFor="start-date-billing" className="block text-sm font-medium text-gray-700">Desde</label>
                    <input 
                        type="date" 
                        id="start-date-billing"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div className="flex-grow">
                    <label htmlFor="end-date-billing" className="block text-sm font-medium text-gray-700">Hasta</label>
                    <input 
                        type="date" 
                        id="end-date-billing"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard 
                    title="Total Ingresos Digitales" 
                    value={formatCurrency(stats.totalDigitalIncome)} 
                    iconPath="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z"
                    iconBgColor="bg-blue-500"
                />
                <StatCard 
                    title="Total Ya Facturado" 
                    value={formatCurrency(stats.totalBilled)} 
                    iconPath="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    iconBgColor="bg-green-500"
                />
                <StatCard 
                    title="Pendiente de Facturar" 
                    value={formatCurrency(stats.pendingToBill)} 
                    iconPath="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
                    iconBgColor="bg-orange-500"
                />
            </div>

            {/* Sales Table */}
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[60vh]">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                                    <input
                                        type="checkbox"
                                        checked={areAllPendingSelected}
                                        onChange={handleToggleAllPendingSelection}
                                        disabled={pendingSales.length === 0 || isBulkBilling}
                                        title="Seleccionar todas las pendientes visibles"
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                    />
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Venta</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto Digital</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado Factura</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredSales.length > 0 ? filteredSales.map(sale => {
                                const invoiceInfo = sale.facturaInfo;
                                const isBilled = hasInvoiceCae(sale);

                                return (
                                <tr key={sale.id}>
                                    <td className="px-4 py-4 text-center">
                                        {!isBilled ? (
                                            <input
                                                type="checkbox"
                                                checked={selectedSaleIds.includes(sale.id)}
                                                onChange={() => handleToggleSaleSelection(sale.id)}
                                                disabled={isBulkBilling}
                                                title="Seleccionar venta para facturación masiva"
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                            />
                                        ) : (
                                            <span className="text-gray-300">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(sale.date).toLocaleDateString('es-AR')}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sale.customer?.['Nombre y Apellido'] || 'Consumidor Final'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">{formatCurrency(sale.total)}</td>
                                    {/* FIX: Sum the amounts from the echeqs array for an accurate digital amount. */}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold">{formatCurrency(sale.payment.digital + (sale.payment.echeqs?.reduce((sum, e) => sum + e.amount, 0) || 0))}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                        {isBilled && invoiceInfo ? (
                                            <div className="flex items-center justify-center space-x-2">
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800" title={`CAE: ${invoiceInfo.cae}`}>
                                                    Facturada ({invoiceInfo.nro})
                                                </span>
                                                {invoiceInfo.url && (
                                                    <a
                                                        href={invoiceInfo.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:text-blue-800"
                                                        title="Abrir URL de la factura"
                                                    >
                                                        <Icon path="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" className="w-4 h-4" />
                                                    </a>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                                Pendiente
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {!isBilled && (
                                            <button 
                                                onClick={() => setSaleToBill(sale)} 
                                                className="text-blue-600 hover:text-blue-800"
                                                title="Facturar esta venta"
                                            >
                                                <Icon path="M18 3H9v18M9 12h6" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={7} className="text-center py-10 text-gray-500">
                                        No hay ventas con pagos digitales en el período seleccionado.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {lastBillingIncidents.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h3 className="font-semibold text-amber-900 text-sm mb-3">Detalle de incidencias (último lote)</h3>
                    <div className="space-y-2 text-sm">
                        {lastBillingIncidents.map((incident, idx) => (
                            <div key={idx} className="flex items-start gap-3 p-2 bg-white rounded border border-amber-100">
                                <span className="font-mono text-xs text-amber-600 flex-shrink-0">{incident.saleId}</span>
                                <div className="flex-grow min-w-0">
                                    <p className="font-medium text-amber-900">{incident.customerName}</p>
                                    <p className="text-amber-700 text-xs">{incident.reason}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {saleToBill && (
                <BillingModal
                    isOpen={!!saleToBill}
                    onClose={() => setSaleToBill(null)}
                    sale={saleToBill}
                    onSuccess={handleBillingSuccess}
                    autoOpen={false}
                />
            )}
        </div>
    );
};
