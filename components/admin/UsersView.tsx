import React, { useState, useMemo } from 'react';
import { User } from '../../types';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { UserFormModal } from './UserFormModal';
import { useToast } from '../../contexts/ToastContext';

interface UsersViewProps {
    allUsers: User[];
    refreshUsers: () => void;
    isLoading: boolean;
}

export const UsersView: React.FC<UsersViewProps> = ({ allUsers, refreshUsers, isLoading }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setFormOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<User | null>(null);
    const { addToast } = useToast();

    const filteredUsers = useMemo(() => {
        return allUsers.filter(u =>
            (u.Nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (u.ID_Usuario || '').toLowerCase().includes(searchTerm.toLowerCase())
        ).sort((a,b) => (a.Nombre || '').localeCompare(b.Nombre || ''));
    }, [allUsers, searchTerm]);
    
    const handleAddNew = () => {
        setUserToEdit(null);
        setFormOpen(true);
    };

    const handleEdit = (user: User) => {
        setUserToEdit(user);
        setFormOpen(true);
    };

    const handleSaveUser = async (userData: Omit<User, 'ID_Usuario'> | User) => {
        try {
            if ('ID_Usuario' in userData) {
                await api.updateUser(userData);
            } else {
                await api.addUser(userData);
            }
            refreshUsers();
            addToast('Usuario guardado con éxito.', 'success');
            setFormOpen(false);
        } catch (error) {
            console.error('Failed to save user:', error);
            const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
            addToast(`Error al guardar el usuario: ${errorMessage}`, 'error');
            throw error; // Re-throw to keep the modal open
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Gestión de Usuarios</h1>
                <button onClick={handleAddNew} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2">
                    <Icon path="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" className="w-5 h-5"/>
                    <span>Nuevo Usuario</span>
                </button>
            </div>
            
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="p-4 border-b">
                     <input
                        type="text"
                        placeholder="Buscar por nombre o ID de usuario..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full max-w-lg pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                 <div className="overflow-x-auto">
                    {isLoading ? (
                        <div className="p-10 text-center text-gray-500">Cargando usuarios...</div>
                    ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Usuario</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Acciones</span></th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200">
                            {filteredUsers.map(user => (
                                <tr key={user.ID_Usuario} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.Nombre}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{user.ID_Usuario}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{user.Rol}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.Activo === 'SI' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {user.Activo === 'SI' ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                         <button onClick={() => handleEdit(user)} className="text-blue-600 hover:text-blue-800" title="Editar Usuario">
                                            <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                         </tbody>
                    </table>
                     )}
                 </div>
            </div>
             <UserFormModal
                isOpen={isFormOpen}
                onClose={() => setFormOpen(false)}
                onSave={handleSaveUser}
                userToEdit={userToEdit}
            />
        </div>
    );
};
