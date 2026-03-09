import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Customer } from '../../types';
import { Icon } from '../ui/Icon';

interface CompleteCustomerDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onComplete: (customer: Customer) => void;
}

export const CompleteCustomerDataModal: React.FC<CompleteCustomerDataModalProps> = ({ isOpen, onClose, customer, onComplete }) => {
  const [localCustomer, setLocalCustomer] = useState<Customer | null>(customer);
  const [prevCustomer, setPrevCustomer] = useState<Customer | null>(customer);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (customer !== prevCustomer || isOpen !== prevIsOpen) {
    setPrevCustomer(customer);
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setLocalCustomer(customer);
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!localCustomer) return;
    const { name, value } = e.target;
    setLocalCustomer({ ...localCustomer, [name]: value });
  };

  const handleSubmit = () => {
    if (localCustomer) {
      onComplete(localCustomer);
    }
    onClose();
  };
  
  if (!localCustomer) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Completar Datos del Cliente para el Presupuesto">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Puede agregar la información faltante del cliente para que se incluya en este presupuesto.
          Estos cambios no modificarán el registro principal del cliente.
        </p>

        <div className="bg-gray-50 p-3 rounded-md">
            <label className="block text-sm font-medium text-gray-500">Nombre</label>
            <p className="font-semibold text-lg">{localCustomer['Nombre y Apellido']}</p>
        </div>
        
        <div>
          <label htmlFor="Documento" className="block text-sm font-medium text-gray-700">Documento (CUIT/DNI)</label>
          <input
            type="text"
            id="Documento"
            name="Documento"
            value={localCustomer.Documento || ''}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
          />
        </div>

        <div>
          <label htmlFor="Whatsapp" className="block text-sm font-medium text-gray-700">WhatsApp</label>
          <input
            type="text"
            id="Whatsapp"
            name="Whatsapp"
            value={localCustomer.Whatsapp || ''}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
          />
        </div>

        <div>
          <label htmlFor="Condicion_IVA" className="block text-sm font-medium text-gray-700">Condición ante el IVA</label>
          <select
            id="Condicion_IVA"
            name="Condicion_IVA"
            value={localCustomer.Condicion_IVA || 'Consumidor Final'}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
          >
            <option>Consumidor Final</option>
            <option>Responsable Inscripto</option>
            <option>Responsable Monotributo</option>
            <option>Sujeto Exento</option>
            <option>Sujeto no Categorizado</option>
            <option>IVA No Alcanzado</option>
          </select>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300">
                Cancelar
            </button>
            <button type="button" onClick={handleSubmit} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center space-x-2">
                <Icon path="M4.5 12.75l6 6 9-13.5" className="w-5 h-5"/>
                <span>Guardar y Continuar</span>
            </button>
        </div>
      </div>
    </Modal>
  );
};