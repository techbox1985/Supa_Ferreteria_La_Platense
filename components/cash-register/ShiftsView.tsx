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

    const fetchShiftsAndUsers = async () => {
        setIsLoadingView(true);
        try {
            const [fetchedShifts, fetchedUsers] = await Promise.all([
                api.getShifts(),
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
        return shifts
            .map(shift => ({
                ...shift,
                user: usersMap.get(shift.ID_Usuario)
            }))
            .filter(shift => {
                // Always show open shifts
                if (shift.Estado === 'Abierto') {
                    return true;
                }

                // For closed shifts, only show them if there was financial activity.
                // Activity is defined as having sales, expenses, or a cash difference.
                const hadSales = (shift.Total_Ventas_Efectivo || 0) !== 0;
                const hadExpenses = (shift.Total_Gastos_Efectivo || 0) !== 0;
                const hasDifference = (shift.Diferencia || 0) !== 0;
                
                return hadSales || hadExpenses || hasDifference;
            });
    }, [shifts, users]);

    const handleRefresh = () => {
        refreshData(); // Refresh all app data
        fetchShiftsAndUsers(); // Also re-fetch local data for this view
    }

    const totalLoading = isAppLoading || isLoadingView;

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Historial de Turnos de Caja</h1>
                <button onClick={handleRefresh} disabled={totalLoading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:bg-gray-400">
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className={`w-5 h-5 ${totalLoading ? 'animate-spin' : ''}`}/>
                    <span>Actualizar</span>
                </button>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[75vh]">
                    {totalLoading ? (
                         <div className="p-10 text-center text-gray-500">Cargando historial...</div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Apertura</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cierre</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto Apertura</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ventas Efectivo</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gastos Efectivo</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Efectivo Esperado</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto Declarado</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Diferencia</th>
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
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-green-600">{formatCurrency(shift.Total_Ventas_Efectivo)}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-red-600">{formatCurrency(shift.Total_Gastos_Efectivo)}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-bold text-blue-800">{formatCurrency(shift.Efectivo_Esperado)}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-medium text-gray-800">{formatCurrency(shift.Monto_Cierre_Declarado)}</td>
                                        <td className={`px-4 py-2 whitespace-nowrap text-sm text-right font-bold ${!shift.Diferencia || shift.Diferencia === 0 ? 'text-gray-700' : shift.Diferencia > 0 ? 'text-green-700' : 'text-red-700'}`}>
                                            {formatCurrency(shift.Diferencia)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                     { !totalLoading && shiftsWithUsers.length === 0 && (
                        <p className="p-10 text-center text-gray-500">No se encontraron turnos con actividad en el historial.</p>
                    )}
                </div>
            </div>
        </div>
    );
};