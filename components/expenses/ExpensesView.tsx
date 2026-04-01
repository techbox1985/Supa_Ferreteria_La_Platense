// ...


import React, { useState, useMemo, useContext } from 'react';
import { Expense, Shift, User } from '../../types';
import * as api from '../../services/api';
import { Icon } from '../ui/Icon';
import { StatCard } from '../dashboard/StatCard';
import { ExpenseFormModal } from './ExpenseFormModal';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmationModal } from '../ui/ConfirmationModal';

const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Helpers de blindaje total para solo fecha
const safeDateOnly = (d: Date | null | undefined, raw?: string): string => {
  // 1. Prioridad: Fallback al Raw string si es procesable (Evita desfases UTC del Date object)
  if (raw && typeof raw === 'string' && raw.trim() !== '') {
    const str = raw.trim();

    // Caso ISO o similar: YYYY-MM-DD
    const matchISO = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (matchISO) return `${matchISO[3]}/${matchISO[2]}/${matchISO[1]}`;

    // Caso Slash: DD/MM/YYYY
    const matchSlash = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (matchSlash) return `${matchSlash[1].padStart(2, '0')}/${matchSlash[2].padStart(2, '0')}/${matchSlash[3]}`;
    
    // Si no matchea nada pero tiene longitud de fecha, truncamos
    if (str.length >= 10) {
        // Podría ser DD-MM-YYYY o similar
        const parts = str.substring(0, 10).split(/[-/]/);
        if (parts.length === 3) {
            // Intentar detectar si es YYYY-MM-DD
            if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            // Asumir DD/MM/YYYY
            return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
        }
    }
  }

  // 2. Si hay objeto Date válido y no pudimos extraer del Raw
  if (d instanceof Date && !isNaN(d.getTime())) {
    return d.toLocaleDateString("es-AR", {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  return "Sin fecha";
};

interface ExpensesViewProps {
    expenses: Expense[];
    shifts: Shift[];
    allUsers: User[];
    isLoading: boolean;
    refreshExpenses: () => Promise<void>;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({ expenses, isLoading, refreshExpenses }) => {
    const [isFormOpen, setFormOpen] = useState(false);
    const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
    const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
    const { addToast } = useToast();

    const toYYYYMMDD = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [startDate, setStartDate] = useState(toYYYYMMDD(new Date()));
    const [endDate, setEndDate] = useState(toYYYYMMDD(new Date()));
    const { activeShift, currentUser } = useContext(AuthContext);

    const safeExpensesSource = useMemo(() => Array.isArray(expenses) ? expenses : [], [expenses]);

    // Mostrar todos los gastos por defecto para todos los roles
    const visibleExpenses = useMemo(() => {
        if (!currentUser) return [];
        return safeExpensesSource;
        // Si se quiere filtrar por turno, implementar un filtro adicional aquí
    }, [safeExpensesSource, currentUser]);

    const filteredExpenses = useMemo(() => {
        if (!startDate || !endDate) return [];

        const [startY, startM, startD] = startDate.split('-').map(Number);
        const [endY, endM, endD] = endDate.split('-').map(Number);

        const startTs = new Date(startY, startM - 1, startD, 0, 0, 0, 0).getTime();
        const endTs = new Date(endY, endM - 1, endD, 23, 59, 59, 999).getTime();

        return visibleExpenses
            .filter(e => {
                if (!e.Fecha) return true; 
                const ts = new Date(e.Fecha).getTime();
                if (isNaN(ts)) return true;
                return ts >= startTs && ts <= endTs;
            });
    }, [visibleExpenses, startDate, endDate]);

    const stats = useMemo(() => {
        const total = filteredExpenses.reduce((sum, e) => sum + (e.Monto || 0), 0);
        const cash = filteredExpenses.reduce((sum, e) => sum + (e.Efectivo || 0), 0);
        const digital = filteredExpenses.reduce((sum, e) => sum + (e.Digital || 0), 0);
        return { total, cash, digital, count: filteredExpenses.length };
    }, [filteredExpenses]);
    
    const handleAddNew = () => { setExpenseToEdit(null); setFormOpen(true); };
    const handleEdit = (expense: Expense) => { setExpenseToEdit(expense); setFormOpen(true); };
    const handleDelete = (expense: Expense) => setExpenseToDelete(expense);

    const handleConfirmDelete = async () => {
        if (!expenseToDelete) return;
        try {
            await api.deleteExpense(expenseToDelete.id_gastos);
            addToast('Gasto eliminado.', 'success');
            await refreshExpenses();
            setExpenseToDelete(null);
        } catch (error) {
            addToast('Error al eliminar.', 'error');
        }
    };

    const handleSaveExpense = async (data: { id_gastos?: string; detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; tipo: 'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros' }) => {
        try {
            if (data.id_gastos) {
                                if (typeof data.id_gastos === 'string' && data.id_gastos.length > 0) {
                                    const dataWithId: typeof data & { id_gastos: string } = { ...data, id_gastos: data.id_gastos };
                                    await api.updateExpense(dataWithId);
                                }
                addToast('Gasto actualizado.', 'success');
            } else {
                const isSeller = currentUser?.Rol === 'Vendedor';
                if (isSeller && !activeShift) throw new Error("No hay turno activo");
                await api.addExpense({ ...data, shiftId: isSeller ? activeShift?.ID_Turno : undefined });
                addToast('Gasto registrado.', 'success');
            }
            await refreshExpenses();
            setFormOpen(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error al guardar.';
            addToast(`Error al guardar: ${message}`, 'error');
        }
    };
    
    if (isLoading && safeExpensesSource.length === 0) {
        return (
            <div className="flex-grow flex items-center justify-center h-[calc(100vh-80px)]">
                <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-12 h-12 text-blue-500 animate-spin mx-auto"/>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Gestión de Gastos</h1>
                <button onClick={handleAddNew} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2">
                    <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-5 h-5"/>
                    <span>Nuevo Gasto</span>
                </button>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row md:items-end gap-4">
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-700">Desde</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 block w-full px-3 py-2 border rounded-md"/>
                </div>
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-700">Hasta</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 block w-full px-3 py-2 border rounded-md"/>
                </div>
                <button onClick={() => { const today = toYYYYMMDD(new Date()); setStartDate(today); setEndDate(today); }} className="bg-gray-100 px-4 py-2 rounded-lg h-[42px]">Hoy</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Total" value={formatCurrency(stats.total)} iconPath="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.826-2.997.11-2.003 1.189z" iconBgColor="bg-red-500" description={`${stats.count} registros`} />
                <StatCard title="Efectivo" value={formatCurrency(stats.cash)} iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75m-15.75 0v-2.25a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121.75 16.5v2.25" iconBgColor="bg-orange-500" />
                <StatCard title="Digital" value={formatCurrency(stats.digital)} iconPath="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z" iconBgColor="bg-sky-500" />
            </div>
            
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[60vh]">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalle</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                                <th className="px-6 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredExpenses.length > 0 ? filteredExpenses.map(expense => {
                                const isDateInvalid = !expense.Fecha || isNaN(new Date(expense.Fecha).getTime());
                                return (
                                <tr key={expense.id_gastos} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                                        <span className={isDateInvalid ? 'text-gray-400 italic' : ''}>
                                            {safeDateOnly(expense.Fecha, expense.FechaRaw)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">{expense.Detalle}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
                                            {expense.Tipo || 'Otros'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-red-600">{formatCurrency(expense.Monto)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        <button onClick={() => handleEdit(expense)} className="text-blue-600 hover:text-blue-800"><Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="w-5 h-5" /></button>
                                        <button onClick={() => handleDelete(expense)} className="text-red-600 hover:text-red-800"><Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-5 h-5" /></button>
                                    </td>
                                </tr>
                            )}) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-gray-500">Sin registros para este rango de fechas.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <ExpenseFormModal isOpen={isFormOpen} onClose={() => setFormOpen(false)} onSave={handleSaveExpense} expenseToEdit={expenseToEdit} />
            <ConfirmationModal isOpen={!!expenseToDelete} onClose={() => setExpenseToDelete(null)} onConfirm={handleConfirmDelete} title="Eliminar Gasto" message={`¿Confirmar eliminación de "${expenseToDelete?.Detalle}"?`} />
        </div>
    );
}

export default ExpensesView;

