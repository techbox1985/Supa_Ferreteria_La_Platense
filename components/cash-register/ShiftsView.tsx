import React, { useState, useEffect, useMemo } from 'react';
import { Shift, User } from '../../types';
import * as api from '../../services/api';
import { Icon } from '../ui/Icon';

const formatCurrency = (value: number | undefined) => {
    if (typeof value !== 'number') return '$ -';
    return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const formatDate = (date: Date | undefined | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('es-AR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
}

const getLocalDateInputValue = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const statusStyles = {
    Abierto: 'bg-green-100 text-green-800',
    Cerrado: 'bg-gray-100 text-gray-800',
};

interface ShiftsViewProps {
    isLoading: boolean;
    refreshData: () => void;
}

export const ShiftsView: React.FC<ShiftsViewProps> = ({ isLoading: isAppLoading, refreshData }) => {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoadingView, setIsLoadingView] = useState(true);

    const today = getLocalDateInputValue();
    const [dateFrom, setDateFrom] = useState(today);
    const [dateTo, setDateTo] = useState(today);

    const fetchShiftsAndUsers = async () => {
        setIsLoadingView(true);
        try {
            const [fetchedShifts, fetchedUsers] = await Promise.all([
                api.getShiftsSupabase(),
                api.getUsers()
            ]);
            setShifts(fetchedShifts);
            setUsers(fetchedUsers);
        } catch (error) {
            console.error("Failed to fetch shifts or users", error);
            alert("No se pudo cargar el historial de turnos.");
        } finally {
            setIsLoadingView(false);
        }
    };

    useEffect(() => {
        fetchShiftsAndUsers();
    }, []);

    const shiftsWithUsers = useMemo(() => {
        const usersMap = new Map(users.map(u => [u.ID_Usuario, u]));

        // Calcular límites de fecha locales para el filtro
        const [fromY, fromM, fromD] = dateFrom.split('-').map(Number);
        const [toY, toM, toD] = dateTo.split('-').map(Number);
        const startOfDay = new Date(fromY, fromM - 1, fromD, 0, 0, 0, 0);
        const endOfDay = new Date(toY, toM - 1, toD, 23, 59, 59, 999);

        return shifts
            .map(shift => ({
                ...shift,
                user: usersMap.get(shift.ID_Usuario)
            }))
            .filter(shift => {
                const openDate = shift.Fecha_Apertura ? new Date(shift.Fecha_Apertura) : null;
                if (!openDate || isNaN(openDate.getTime())) return false;
                return openDate >= startOfDay && openDate <= endOfDay;
            })
            .sort((a, b) => new Date(b.Fecha_Apertura).getTime() - new Date(a.Fecha_Apertura).getTime());
    }, [shifts, users, dateFrom, dateTo]);

    const summary = useMemo(() => {
        const abiertos = shiftsWithUsers.filter(s => s.Estado === 'Abierto').length;
        const cerrados = shiftsWithUsers.filter(s => s.Estado === 'Cerrado').length;
        const totalApertura = shiftsWithUsers.reduce((sum, s) => sum + (s.Monto_Apertura || 0), 0);
        const totalDeclarado = shiftsWithUsers.reduce((sum, s) => sum + (s.Monto_Cierre_Declarado || 0), 0);
        const diferencia = totalDeclarado - totalApertura;
        return { abiertos, cerrados, totalApertura, totalDeclarado, diferencia };
    }, [shiftsWithUsers]);

    const handleRefresh = () => {
        refreshData();
        fetchShiftsAndUsers();
    };

    const totalLoading = isAppLoading || isLoadingView;

    return (
        <div className="p-6 space-y-6">
            {/* Título y botón */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Historial de Turnos de Caja</h1>
                    <p className="text-sm text-slate-500 mt-1">Turnos de apertura y cierre de caja por rango de fechas.</p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={totalLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                    <Icon path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" className={`h-5 w-5 ${totalLoading ? 'animate-spin' : ''}`} />
                    Actualizar
                </button>
            </div>

            {/* Filtros de fecha */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4 bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Desde</label>
                    <input
                        type="date"
                        value={dateFrom}
                        max={dateTo}
                        onChange={e => setDateFrom(e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Hasta</label>
                    <input
                        type="date"
                        value={dateTo}
                        min={dateFrom}
                        onChange={e => setDateTo(e.target.value)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                </div>
            </div>

            {/* Tarjetas resumen */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Abiertos</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-600">{summary.abiertos}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cerrados</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{summary.cerrados}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total apertura</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(summary.totalApertura)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total declarado</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(summary.totalDeclarado)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Diferencia declarada</p>
                    <p className={`mt-1 text-xl font-bold ${summary.diferencia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(summary.diferencia)}
                    </p>
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[60vh]">
                    {totalLoading ? (
                        <div className="p-10 text-center text-gray-500">Cargando historial...</div>
                    ) : shiftsWithUsers.length === 0 ? (
                        <div className="p-10 text-center text-slate-500">
                            No hay turnos de caja para el rango seleccionado.
                        </div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Apertura</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cierre</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto Apertura</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto Declarado</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notas</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {shiftsWithUsers.map(shift => (
                                    <tr key={shift.ID_Turno} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{shift.user?.Nombre || shift.ID_Usuario}</td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusStyles[shift.Estado]}`}>
                                                {shift.Estado}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{formatDate(shift.Fecha_Apertura)}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{formatDate(shift.Fecha_Cierre)}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-700">{formatCurrency(shift.Monto_Apertura)}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-medium text-gray-800">{formatCurrency(shift.Monto_Cierre_Declarado)}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{shift.Notas}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
