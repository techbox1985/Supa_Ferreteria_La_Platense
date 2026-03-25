import React from 'react';
import { Budget } from '../../types';

interface BudgetToSaleModalProps {
	isOpen: boolean;
	budget: Budget | null;
	onClose: () => void;
	onConfirm: () => void | Promise<void>;
}

export const BudgetToSaleModal: React.FC<BudgetToSaleModalProps> = ({ isOpen, budget, onClose, onConfirm }) => {
	console.log('[BudgetToSaleModal] open:', isOpen, 'budget:', budget?.id);
	if (!isOpen || !budget) return null;
	const customerName = budget.customer?.['Nombre y Apellido'] || 'Consumidor Final';
	const itemsCount = Array.isArray(budget.items) ? budget.items.length : 0;
	const subtotal = budget.subtotal ?? 0;
	const adjustment = budget.adjustment_amount ?? 0;
	const total = budget.total ?? 0;
	console.log('[BudgetToSaleModal] render modal', { id: budget.id, itemsCount, total });
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
			<div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
				<h2 className="text-xl font-bold mb-4">Convertir presupuesto a venta</h2>
				<div className="mb-2">
					<div className="text-sm text-gray-500">Cliente</div>
					<div className="font-semibold">{customerName}</div>
				</div>
				<div className="mb-2 text-sm">Cantidad de ítems: <span className="font-mono">{itemsCount}</span></div>
				<div className="mb-2 flex justify-between text-sm">
					<span>Subtotal:</span>
					<span>${subtotal.toLocaleString('es-AR')}</span>
				</div>
				<div className="mb-2 flex justify-between text-sm">
					<span>Ajuste:</span>
					<span>${adjustment.toLocaleString('es-AR')}</span>
				</div>
				<div className="mb-4 flex justify-between text-base font-bold">
					<span>Total:</span>
					<span>${total.toLocaleString('es-AR')}</span>
				</div>
				<div className="flex justify-end gap-2">
					<button className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300" onClick={onClose}>Cancelar</button>
					<button className="px-4 py-2 rounded bg-blue-600 text-white font-semibold" onClick={onConfirm}>Confirmar conversión</button>
				</div>
			</div>
		</div>
	);
};
