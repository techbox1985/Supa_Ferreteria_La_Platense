import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { Supplier, SupplierInvoiceBalance, SupplierAccountSummary, SupplierPayment } from '../../types';
import * as api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

interface SupplierPaymentRow {
    id: string;
    supplier_id: string;
    invoice_id: string | null;
    invoice_number: string | null;
    amount: number;
    payment_date: string;
    payment_method: string;
    notes: string;
    created_at?: string;
}

interface SupplierCuentaCorrienteModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier;
    onPaymentRecorded: () => void;
}

const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Otro'];

const formatCurrency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n);

const formatDate = (iso: string) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const estadoBadge = (estado: string) => {
    const map: Record<string, { bg: string; text: string }> = {
        'Pagado': { bg: 'bg-green-100', text: 'text-green-800' },
        'Parcial': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
        'Pendiente': { bg: 'bg-red-100', text: 'text-red-800' },
    };
    const style = map[estado] ?? { bg: 'bg-gray-100', text: 'text-gray-800' };
    return (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${style.bg} ${style.text}`}>
            {estado || 'Sin estado'}
        </span>
    );
};

export const SupplierCuentaCorrienteModal: React.FC<SupplierCuentaCorrienteModalProps> = ({
    isOpen,
    onClose,
    supplier,
    onPaymentRecorded,
}) => {
    const { addToast } = useToast();
    const [localSummary, setLocalSummary] = useState<SupplierAccountSummary | null>(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);
    const [invoiceBalances, setInvoiceBalances] = useState<SupplierInvoiceBalance[]>([]);
    const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
    const [payments, setPayments] = useState<SupplierPaymentRow[]>([]);
    const [isLoadingPayments, setIsLoadingPayments] = useState(false);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [editingPayment, setEditingPayment] = useState<SupplierPaymentRow | null>(null);

    // Payment form state
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState('Transferencia');
    const [paymentInvoiceId, setPaymentInvoiceId] = useState<string>('');
    const [paymentNotes, setPaymentNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Edit payment form state
    const [editAmount, setEditAmount] = useState('');
    const [editDate, setEditDate] = useState('');
    const [editMethod, setEditMethod] = useState('Transferencia');
    const [editInvoiceId, setEditInvoiceId] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);
    const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

    const loadSummary = useCallback(async () => {
        if (!supplier?.ID_Proveedor) return;
        setIsLoadingSummary(true);
        try {
            const data = await api.getSupplierAccountSummary(supplier.ID_Proveedor);
            setLocalSummary(data);
        } catch {
            // No bloquear si la vista no existe aún
        } finally {
            setIsLoadingSummary(false);
        }
    }, [supplier?.ID_Proveedor]);

    const loadInvoiceBalances = useCallback(async () => {
        if (!supplier?.ID_Proveedor) return;
        setIsLoadingInvoices(true);
        try {
            const data = await api.getSupplierInvoiceBalances(supplier.ID_Proveedor);
            setInvoiceBalances(data);
        } catch (e) {
            addToast('Error al cargar historial de facturas.', 'error');
        } finally {
            setIsLoadingInvoices(false);
        }
    }, [supplier?.ID_Proveedor, addToast]);

    const loadPayments = useCallback(async () => {
        if (!supplier?.ID_Proveedor) return;
        setIsLoadingPayments(true);
        try {
            const data = await api.getSupplierPayments(supplier.ID_Proveedor);
            setPayments(data as SupplierPaymentRow[]);
        } catch (e) {
            addToast('Error al cargar historial de pagos.', 'error');
        } finally {
            setIsLoadingPayments(false);
        }
    }, [supplier?.ID_Proveedor, addToast]);

    const refreshAll = useCallback(async () => {
        await Promise.all([loadSummary(), loadInvoiceBalances(), loadPayments()]);
    }, [loadSummary, loadInvoiceBalances, loadPayments]);

    useEffect(() => {
        if (isOpen) {
            refreshAll();
            setShowPaymentForm(false);
            setEditingPayment(null);
            setPaymentAmount('');
            setPaymentDate(new Date().toISOString().split('T')[0]);
            setPaymentMethod('Transferencia');
            setPaymentInvoiceId('');
            setPaymentNotes('');
        }
    }, [isOpen, refreshAll]);

    const handleSavePayment = async () => {
        const amount = parseFloat(paymentAmount);
        if (!amount || amount <= 0) {
            addToast('El monto debe ser mayor a cero.', 'error');
            return;
        }
        if (!paymentDate) {
            addToast('Ingresá la fecha del pago.', 'error');
            return;
        }
        setIsSaving(true);
        try {
            const rawInvoiceId = (paymentInvoiceId || '').trim();
            const normalizedInvoiceId =
                !rawInvoiceId ||
                rawInvoiceId === '— Pago general —' ||
                rawInvoiceId === 'Pago general' ||
                rawInvoiceId === 'general payment'
                    ? null
                    : rawInvoiceId;

            const payment: SupplierPayment = {
                supplier_id: supplier.ID_Proveedor,
                invoice_id: normalizedInvoiceId,
                amount,
                payment_date: paymentDate,
                payment_method: paymentMethod,
                notes: paymentNotes,
            };
            await api.recordSupplierPayment(payment);
            addToast('Pago registrado con éxito.', 'success');
            setShowPaymentForm(false);
            setPaymentAmount('');
            setPaymentNotes('');
            setPaymentInvoiceId('');
            await refreshAll();
            onPaymentRecorded();
        } catch (e: any) {
            console.error('[SupplierCuentaCorrienteModal] Error al registrar pago:', {
                supplier_id: supplier.ID_Proveedor,
                invoice_id: paymentInvoiceId,
                amount: paymentAmount,
                payment_date: paymentDate,
                payment_method: paymentMethod,
                notes: paymentNotes,
                message: e?.message,
                details: e?.details,
                hint: e?.hint,
                code: e?.code,
                raw: e,
            });
            const msg = e?.message || e?.details || e?.hint || 'Error al registrar pago.';
            addToast(msg, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartEditPayment = (row: SupplierPaymentRow) => {
        setEditingPayment(row);
        setEditAmount(String(row.amount || ''));
        setEditDate((row.payment_date || '').slice(0, 10));
        setEditMethod(row.payment_method || 'Transferencia');
        setEditInvoiceId(row.invoice_id || '');
        setEditNotes(row.notes || '');
    };

    const handleCancelEditPayment = () => {
        setEditingPayment(null);
        setEditAmount('');
        setEditDate('');
        setEditMethod('Transferencia');
        setEditInvoiceId('');
        setEditNotes('');
    };

    const handleUpdatePayment = async () => {
        if (!editingPayment) return;
        const amount = parseFloat(editAmount);
        if (!amount || amount <= 0) {
            addToast('El monto debe ser mayor a cero.', 'error');
            return;
        }
        if (!editDate) {
            addToast('Ingresá la fecha del pago.', 'error');
            return;
        }

        const rawInvoiceId = (editInvoiceId || '').trim();
        const normalizedInvoiceId =
            !rawInvoiceId ||
            rawInvoiceId === '— Pago general —' ||
            rawInvoiceId === 'Pago general' ||
            rawInvoiceId === 'general payment'
                ? null
                : rawInvoiceId;

        setIsUpdatingPayment(true);
        try {
            await api.updateSupplierPayment(editingPayment.id, {
                amount,
                payment_date: editDate,
                payment_method: editMethod,
                notes: editNotes,
                invoice_id: normalizedInvoiceId,
            });
            addToast('Pago actualizado con éxito.', 'success');
            handleCancelEditPayment();
            await refreshAll();
            onPaymentRecorded();
        } catch (e: any) {
            console.error('[SupplierCuentaCorrienteModal] Error al actualizar pago:', {
                payment_id: editingPayment.id,
                message: e?.message,
                details: e?.details,
                hint: e?.hint,
                code: e?.code,
                raw: e,
            });
            const msg = e?.message || e?.details || e?.hint || 'Error al actualizar pago.';
            addToast(msg, 'error');
        } finally {
            setIsUpdatingPayment(false);
        }
    };

    const handleDeletePayment = async (paymentId: string) => {
        const confirmed = window.confirm('¿Eliminar este pago? Esta acción no se puede deshacer.');
        if (!confirmed) return;

        setDeletingPaymentId(paymentId);
        try {
            await api.deleteSupplierPayment(paymentId);
            addToast('Pago eliminado con éxito.', 'success');
            if (editingPayment?.id === paymentId) {
                handleCancelEditPayment();
            }
            await refreshAll();
            onPaymentRecorded();
        } catch (e: any) {
            console.error('[SupplierCuentaCorrienteModal] Error al eliminar pago:', {
                payment_id: paymentId,
                message: e?.message,
                details: e?.details,
                hint: e?.hint,
                code: e?.code,
                raw: e,
            });
            const msg = e?.message || e?.details || e?.hint || 'Error al eliminar pago.';
            addToast(msg, 'error');
        } finally {
            setDeletingPaymentId(null);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Cuenta Corriente — ${supplier.Nombre}`} size="4xl">
            {/* Account Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-blue-600 font-semibold uppercase mb-1">Total Facturado</p>
                    <p className="text-xl font-bold text-blue-800">
                        {isLoadingSummary ? '…' : formatCurrency(localSummary?.total_facturado ?? 0)}
                    </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-green-600 font-semibold uppercase mb-1">Total Pagado</p>
                    <p className="text-xl font-bold text-green-800">
                        {isLoadingSummary ? '…' : formatCurrency(localSummary?.total_pagado ?? 0)}
                    </p>
                </div>
                <div className={`rounded-lg p-4 text-center ${(localSummary?.saldo_pendiente ?? 0) > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <p className={`text-xs font-semibold uppercase mb-1 ${(localSummary?.saldo_pendiente ?? 0) > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        Saldo Pendiente
                    </p>
                    <p className={`text-xl font-bold ${(localSummary?.saldo_pendiente ?? 0) > 0 ? 'text-red-800' : 'text-gray-700'}`}>
                        {isLoadingSummary ? '…' : formatCurrency(localSummary?.saldo_pendiente ?? 0)}
                    </p>
                </div>
            </div>

            {/* Payment Form */}
            {showPaymentForm ? (
                <div className="border border-blue-200 rounded-xl p-5 bg-blue-50/40 mb-6 space-y-4">
                    <h3 className="text-base font-semibold text-gray-800">Registrar Pago</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor</label>
                            <input type="text" value={supplier.Nombre} readOnly
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-600" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Factura (opcional)</label>
                            <select value={paymentInvoiceId} onChange={e => setPaymentInvoiceId(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                                <option value="">— Pago general —</option>
                                {invoiceBalances.filter(inv => inv.saldo_pendiente > 0).map(inv => (
                                    <option key={inv.id} value={inv.id}>
                                        {inv.invoice_number} — Saldo: {formatCurrency(inv.saldo_pendiente)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Monto *</label>
                            <input type="number" min="0.01" step="0.01" placeholder="0.00"
                                value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha *</label>
                            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Método de Pago *</label>
                            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Nota</label>
                            <input type="text" placeholder="Opcional..." value={paymentNotes}
                                onChange={e => setPaymentNotes(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={() => setShowPaymentForm(false)} disabled={isSaving}
                            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                            Cancelar
                        </button>
                        <button onClick={handleSavePayment} disabled={isSaving}
                            className="px-5 py-2 text-sm rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                            {isSaving && <Icon path="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 00-10 10h2z" className="w-4 h-4 animate-spin" />}
                            Confirmar Pago
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex justify-end mb-4">
                    <button onClick={() => setShowPaymentForm(true)}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2">
                        <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-4 h-4" />
                        Registrar Pago
                    </button>
                </div>
            )}

            {/* Invoice Balance Table */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700">Historial de Facturas</h3>
                </div>
                {isLoadingInvoices ? (
                    <div className="p-8 text-center text-gray-500 text-sm">Cargando facturas...</div>
                ) : invoiceBalances.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">Sin facturas registradas.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Factura</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pagado</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {invoiceBalances.map(inv => (
                                    <tr key={inv.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm font-medium text-gray-800">{inv.invoice_number}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(inv.created_at)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-gray-800">{formatCurrency(inv.total_amount)}</td>
                                        <td className="px-4 py-3 text-sm text-right text-green-700 font-medium">{formatCurrency(inv.total_pagado)}</td>
                                        <td className="px-4 py-3 text-sm text-right font-semibold text-red-700">{formatCurrency(inv.saldo_pendiente)}</td>
                                        <td className="px-4 py-3 text-sm text-center">{estadoBadge(inv.estado_pago)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden mt-6">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700">Historial de Pagos</h3>
                </div>

                {isLoadingPayments ? (
                    <div className="p-8 text-center text-gray-500 text-sm">Cargando pagos...</div>
                ) : payments.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">Sin pagos registrados.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Método</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nota</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Factura Asociada</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {payments.map(p => (
                                    <tr key={p.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-700">{formatDate(p.payment_date)}</td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-green-700">{formatCurrency(p.amount)}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{p.payment_method || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600 max-w-[220px] truncate" title={p.notes || ''}>{p.notes || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{p.invoice_number || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-center">
                                            <div className="flex items-center justify-center gap-3">
                                                <button
                                                    onClick={() => handleStartEditPayment(p)}
                                                    className="text-blue-600 hover:text-blue-800"
                                                    title="Editar pago"
                                                >
                                                    <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePayment(p.id)}
                                                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                                    disabled={deletingPaymentId === p.id}
                                                    title="Eliminar pago"
                                                >
                                                    <Icon path="M6 7.5h12m-1.5 0-.663 9.954A2.25 2.25 0 0113.59 19.5H10.41a2.25 2.25 0 01-2.247-2.046L7.5 7.5m3-3h3m-3 0A1.5 1.5 0 009 6v1.5h6V6a1.5 1.5 0 00-1.5-1.5m-3 0h3" className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {editingPayment && (
                <div className="border border-amber-200 rounded-xl p-5 bg-amber-50/40 mt-6 space-y-4">
                    <h3 className="text-base font-semibold text-gray-800">Editar Pago</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Factura (opcional)</label>
                            <select
                                value={editInvoiceId}
                                onChange={(e) => setEditInvoiceId(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                            >
                                <option value="">— Pago general —</option>
                                {invoiceBalances.map(inv => (
                                    <option key={inv.id} value={inv.id}>
                                        {inv.invoice_number} — Saldo: {formatCurrency(inv.saldo_pendiente)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Monto *</label>
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={editAmount}
                                onChange={(e) => setEditAmount(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha *</label>
                            <input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Método de Pago *</label>
                            <select
                                value={editMethod}
                                onChange={(e) => setEditMethod(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                            >
                                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Nota</label>
                            <input
                                type="text"
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={handleCancelEditPayment}
                            disabled={isUpdatingPayment}
                            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleUpdatePayment}
                            disabled={isUpdatingPayment}
                            className="px-5 py-2 text-sm rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isUpdatingPayment && <Icon path="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 00-10 10h2z" className="w-4 h-4 animate-spin" />}
                            Guardar Cambios
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
};
