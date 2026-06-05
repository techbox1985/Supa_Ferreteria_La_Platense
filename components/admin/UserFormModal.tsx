
import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (userData: Omit<User, 'ID_Usuario'> | User) => Promise<void>;
  userToEdit?: User | null;
}

export const UserFormModal: React.FC<UserFormModalProps> = ({ isOpen, onClose, onSave, userToEdit }) => {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'Vendedor' | 'Admin' | 'Cajero'>('Vendedor');
  const [isActive, setIsActive] = useState<'SI' | 'NO'>('SI');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  
  const isEditing = !!userToEdit;
  
  useEffect(() => {
    if (isOpen) {
        if (isEditing) {
          setName(userToEdit.Nombre);
          setPin(userToEdit.PIN);
          setRole(userToEdit.Rol);
          setIsActive(userToEdit.Activo);
        } else {
          // Reset for new user
          setName('');
          setPin('');
          setRole('Vendedor');
          setIsActive('SI');
        }
        setIsSaving(false);
        setError('');
    }
  }, [isOpen, userToEdit, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        setError('El PIN debe ser un número de 4 dígitos.');
        return;
    }

    setIsSaving(true);
    
    const userData = {
      Nombre: name,
      PIN: pin,
      Rol: role,
      Activo: isActive,
      ...(isEditing && { ID_Usuario: userToEdit.ID_Usuario })
    };

    try {
        await onSave(userData);
    } catch (error) {
        // Parent component handles alert, we just need to reset the form's state
    } finally {
        setIsSaving(false);
    }
  };
  
  return (
    <Modal isOpen={isOpen} onClose={isSaving ? () => {} : onClose} title={isEditing ? "Editar Usuario" : "Nuevo Usuario"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}
        
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nombre</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            required
            disabled={isSaving}
          />
        </div>

        <div>
          <label htmlFor="pin" className="block text-sm font-medium text-gray-700">PIN (4 dígitos)</label>
          <input
            type="text"
            id="pin"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            required
            maxLength={4}
            pattern="\d{4}"
            disabled={isSaving}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">Rol</label>
              <select 
                id="role" 
                value={role} 
                onChange={e => setRole(e.target.value as 'Vendedor' | 'Admin' | 'Cajero')} 
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                disabled={isSaving}
              >
                <option value="Vendedor">Vendedor</option>
                <option value="Cajero">Cajero</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">Estado</label>
              <select 
                id="status" 
                value={isActive} 
                onChange={e => setIsActive(e.target.value as 'SI' | 'NO')} 
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                disabled={isSaving}
              >
                <option value="SI">Activo</option>
                <option value="NO">Inactivo</option>
              </select>
            </div>
        </div>
        
        <div className="flex justify-end space-x-3 pt-4">
          <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors disabled:opacity-50" disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 w-48 disabled:bg-gray-400 disabled:cursor-not-allowed" disabled={isSaving}>
             {isSaving ? (
                <>
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                    <span>Guardando...</span>
                </>
            ) : (
                <>
                    <Icon path="M4.5 12.75l6 6 9-13.5" className="w-5 h-5"/>
                    <span>Guardar Usuario</span>
                </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
