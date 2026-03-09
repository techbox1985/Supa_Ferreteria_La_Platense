import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmationModal } from '../ui/ConfirmationModal';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChange: () => void;
}

type EditState = { type: 'category' | 'subcategory'; oldName: string; category?: string };

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ isOpen, onClose, onDataChange }) => {
    const [categoriesData, setCategoriesData] = useState<{ [key: string]: string[] }>({});
    const [isLoading, setIsLoading] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newSubCategoryName, setNewSubCategoryName] = useState('');
    const [editing, setEditing] = useState<EditState | null>(null);
    const [editValue, setEditValue] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [confirmModalState, setConfirmModalState] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {},
    });
    
    const { addToast } = useToast();

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const rawData = await api.getCategoriesData();
            const structuredData: { [key: string]: string[] } = {};
            rawData.forEach(item => {
                // FIX: Added a more robust guard to filter out invalid or empty category names.
                if (!item.categoria || typeof item.categoria !== 'string' || item.categoria.trim() === '') {
                    return;
                }
                if (!structuredData[item.categoria]) {
                    structuredData[item.categoria] = [];
                }
                if (item.subCategoria && item.subCategoria !== '-') {
                    structuredData[item.categoria].push(item.subCategoria);
                }
            });
            for (const cat in structuredData) {
                structuredData[cat].sort((a, b) => a.localeCompare(b));
            }
            setCategoriesData(structuredData);
            
            // Auto-select the first category if none is selected or the selected one is gone
            const sortedCategories = Object.keys(structuredData).sort();
            if (sortedCategories.length > 0) {
                 if (!selectedCategory || !structuredData[selectedCategory]) {
                    setSelectedCategory(sortedCategories[0]);
                }
            } else {
                setSelectedCategory(null);
            }

        } catch (error) {
            addToast('Error al cargar las categorías.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchData();
        } else {
            // Reset state when modal is closed
            setSelectedCategory(null);
        }
    }, [isOpen]);
    
    const handleApiCall = async (apiFunc: Promise<any>, successMessage: string) => {
        setIsProcessing(true);
        try {
            await apiFunc;
            addToast(successMessage, 'success');
            await fetchData(); // Await the fetch to ensure data is fresh
            onDataChange(); // Notify parent of changes
        } catch (error) {
            const message = error instanceof Error ? error.message : "Ocurrió un error.";
            addToast(message, 'error');
        } finally {
            setIsProcessing(false);
            setEditing(null);
            setEditValue('');
            setConfirmModalState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
        }
    };

    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;
        const name = newCategoryName.trim();
        handleApiCall(api.addCategory(name), `Categoría '${name}' agregada.`).then(() => {
             setSelectedCategory(name); // Select the newly created category
        });
        setNewCategoryName('');
    };

    const handleAddSubCategory = () => {
        if (!selectedCategory || !newSubCategoryName.trim()) return;
        handleApiCall(api.addSubCategory(selectedCategory, newSubCategoryName.trim()), `Subcategoría '${newSubCategoryName.trim()}' agregada a '${selectedCategory}'.`);
        setNewSubCategoryName('');
    };

    const handleStartEdit = (type: 'category' | 'subcategory', oldName: string, category?: string) => {
        setEditing({ type, oldName, category });
        setEditValue(oldName);
    };

    const handleConfirmEdit = () => {
        if (!editing || !editValue.trim() || editValue.trim() === editing.oldName) {
            setEditing(null);
            return;
        }

        if (editing.type === 'category') {
            const newName = editValue.trim();
            handleApiCall(api.renameCategory(editing.oldName, newName), `Categoría renombrada a '${newName}'.`).then(() => {
                setSelectedCategory(newName);
            });
        } else if (editing.type === 'subcategory' && editing.category) {
            handleApiCall(api.renameSubCategory(editing.category, editing.oldName, editValue.trim()), `Subcategoría renombrada a '${editValue.trim()}'.`);
        }
    };
    
    const handleDelete = (type: 'category' | 'subcategory', name: string, category?: string) => {
        const title = type === 'category' ? `Eliminar Categoría '${name}'` : `Eliminar Subcategoría '${name}'`;
        const message = type === 'category'
            ? `¿Está seguro? Se eliminará la categoría '${name}' y se quitará de todos los productos asociados.`
            : `¿Está seguro? Se eliminará la subcategoría '${name}' de '${category}' y se quitará de todos los productos asociados.`;

        const confirmAction = () => {
            if (type === 'category') {
                handleApiCall(api.deleteCategory(name), `Categoría '${name}' eliminada.`);
            } else if (type === 'subcategory' && category) {
                handleApiCall(api.deleteSubCategory(category, name), `Subcategoría '${name}' eliminada.`);
            }
        };

        setConfirmModalState({
            isOpen: true,
            title,
            message,
            onConfirm: confirmAction,
        });
    };

    const sortedCategories = useMemo(() => Object.keys(categoriesData).sort((a,b)=> a.localeCompare(b)), [categoriesData]);

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title="Gestionar Categorías y Subcategorías" size="xl">
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Columna de Categorías */}
                        <div className="border p-4 rounded-lg flex flex-col">
                            <h3 className="text-lg font-semibold mb-2">Categorías</h3>
                            <div className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    placeholder="Nueva categoría..."
                                    className="flex-grow border-gray-300 rounded-md shadow-sm"
                                />
                                <button onClick={handleAddCategory} className="bg-blue-500 text-white px-3 py-1 rounded-md hover:bg-blue-600 flex-shrink-0">&raquo;</button>
                            </div>
                            <div className="flex-grow max-h-96 overflow-y-auto space-y-2 pr-2">
                                {isLoading ? <p>Cargando...</p> : sortedCategories.map(cat => (
                                    <div 
                                        key={cat} 
                                        onClick={() => { setEditing(null); setSelectedCategory(cat) }}
                                        className={`p-2 rounded-md cursor-pointer transition-colors ${selectedCategory === cat ? 'bg-blue-100 ring-2 ring-blue-300' : 'bg-gray-50 hover:bg-gray-100'}`}
                                    >
                                    {editing?.type === 'category' && editing.oldName === cat ? (
                                            <div className="flex items-center gap-2">
                                                <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus onBlur={handleConfirmEdit} onKeyDown={e => e.key === 'Enter' && handleConfirmEdit()} className="flex-grow border-gray-300 rounded-md" />
                                                <button onClick={handleConfirmEdit} className="text-green-500"><Icon path="M4.5 12.75l6 6 9-13.5" className="w-5 h-5"/></button>
                                                <button onClick={() => setEditing(null)} className="text-red-500"><Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5"/></button>
                                            </div>
                                    ) : (
                                            <div className="flex justify-between items-center">
                                                <span className="font-medium">{cat}</span>
                                                <div className="space-x-2">
                                                    <button onClick={(e) => { e.stopPropagation(); handleStartEdit('category', cat)}} className="text-gray-500 hover:text-blue-600"><Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" className="w-4 h-4"/></button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete('category', cat)}} className="text-gray-500 hover:text-red-600"><Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-4 h-4"/></button>
                                                </div>
                                            </div>
                                    )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Columna de Subcategorías */}
                        <div className="border p-4 rounded-lg flex flex-col">
                            <h3 className="text-lg font-semibold mb-2">
                                {selectedCategory ? `Subcategorías de "${selectedCategory}"` : 'Subcategorías'}
                            </h3>
                            {selectedCategory ? (
                                <>
                                    <div className="flex gap-2 mb-4">
                                        <input
                                            type="text"
                                            value={newSubCategoryName}
                                            onChange={(e) => setNewSubCategoryName(e.target.value)}
                                            placeholder="Nueva subcategoría..."
                                            className="flex-grow border-gray-300 rounded-md shadow-sm"
                                        />
                                        <button onClick={handleAddSubCategory} className="bg-blue-500 text-white px-3 py-1 rounded-md hover:bg-blue-600 flex-shrink-0">&raquo;</button>
                                    </div>
                                    <div className="flex-grow max-h-96 overflow-y-auto space-y-2 pr-2">
                                        {categoriesData[selectedCategory].length === 0 && <p className="text-sm text-gray-500">Sin subcategorías.</p>}
                                        {categoriesData[selectedCategory].map(sub => (
                                            <div key={sub} className="p-2 rounded-md bg-gray-50 hover:bg-gray-100">
                                                {editing?.type === 'subcategory' && editing.category === selectedCategory && editing.oldName === sub ? (
                                                        <div className="flex items-center gap-2">
                                                        <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus onBlur={handleConfirmEdit} onKeyDown={e => e.key === 'Enter' && handleConfirmEdit()} className="flex-grow border-gray-300 rounded-md text-sm" />
                                                        <button onClick={handleConfirmEdit} className="text-green-500"><Icon path="M4.5 12.75l6 6 9-13.5" className="w-4 h-4"/></button>
                                                        <button onClick={() => setEditing(null)} className="text-red-500"><Icon path="M6 18L18 6M6 6l12 12" className="w-4 h-4"/></button>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span>{sub}</span>
                                                        <div className="space-x-2">
                                                                <button onClick={() => handleStartEdit('subcategory', sub, selectedCategory)} className="text-gray-500 hover:text-blue-600"><Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" className="w-4 h-4"/></button>
                                                                <button onClick={() => handleDelete('subcategory', sub, selectedCategory)} className="text-gray-500 hover:text-red-600"><Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-4 h-4"/></button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-center h-full text-center text-gray-500 bg-gray-50 rounded-md">
                                    <p>Seleccione una categoría<br/>para ver y administrar sus subcategorías.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Modal>
            <ConfirmationModal
                isOpen={confirmModalState.isOpen}
                onClose={() => setConfirmModalState({ ...confirmModalState, isOpen: false })}
                onConfirm={confirmModalState.onConfirm}
                title={confirmModalState.title}
                message={confirmModalState.message}
                isProcessing={isProcessing}
                confirmText="Sí, Eliminar"
            />
        </>
    );
};