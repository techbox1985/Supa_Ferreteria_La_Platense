import React, { useState, useEffect, useCallback } from 'react';
import { SyncRequest, Customer } from '../../types';
// FIX: Corrected import from namespace to named import.
import { offlineService } from '../../services/offlineService';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { useToast } from '../../contexts/ToastContext';

interface SyncQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncQueue: () => Promise<void>;
  onQueueChanged: () => void;
  customers: Customer[];
}

export const SyncQueueModal: React.FC<SyncQueueModalProps> = ({ isOpen, onClose, syncQueue, onQueueChanged, customers }) => {
  const [queue, setQueue] = useState<SyncRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [itemForDetails, setItemForDetails] = useState<SyncRequest | null>(null);
  const [itemToDelete, setItemToDelete] = useState<SyncRequest | null>(null);
  const { addToast } = useToast();

  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await offlineService.getQueue();
      setQueue(items);
    } catch (error) {
      addToast('Error al cargar la cola de sincronización.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (isOpen) {
      loadQueue();
    }
  }, [isOpen, loadQueue]);

  const generateSummary = useCallback((request: SyncRequest): string => {
    const { action, payload } = request;
    const formatCurrency = (val: number) => `$${(val || 0).toLocaleString('es-AR')}`;

    try {
      switch (action) {
        case 'addSale':
          return `Venta a ${payload.customer?.['Nombre y Apellido'] || 'Consumidor Final'} por ${formatCurrency(payload.total)}`;
        case 'addCustomer':
          return `Nuevo Cliente: ${payload['Nombre y Apellido']}`;
        case 'addExpense':
          return `Gasto: "${payload.Detalle}" por ${formatCurrency(payload.Monto)}`;
        case 'recordPayment': {
          const customer = customers.find(c => c.Id_Cliente === payload.customerId);
          return `Pago de ${customer?.['Nombre y Apellido'] || `ID ${payload.customerId}`} por ${formatCurrency(payload.amount)}`;
        }
        case 'createCreditNote': {
          const customer = customers.find(c => c.Id_Cliente === payload.customerId);
          return `Nota de Crédito para ${customer?.['Nombre y Apellido'] || `ID ${payload.customerId}`} por ${formatCurrency(payload.total)}`;
        }
        case 'updateProduct':
          return `Actualizar Producto: ${payload.Producto || payload.cod}`;
        case 'annulSale':
          return `Anular Venta ID: ${payload.saleId.slice(0, 8)}`;
        default:
          return `Acción: ${action}`;
      }
    } catch (e) {
      return `Error al procesar resumen para la acción: ${action}`;
    }
  }, [customers]);

  const handleRetry = async () => {
    setIsSyncing(true);
    await syncQueue();
    await loadQueue();
    onQueueChanged();
    setIsSyncing(false);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;

    try {
      await offlineService.removeFromQueue(itemToDelete.id);
      addToast('Operación eliminada de la cola.', 'success');
      setQueue(prev => prev.filter(item => item.id !== itemToDelete.id));
      onQueueChanged();
    } catch (error) {
      addToast('Error al eliminar la operación.', 'error');
    } finally {
      setItemToDelete(null);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Cola de Sincronización" size="xl">
        <div className="space-y-4">
          <div className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              Estas son las operaciones guardadas localmente que no se han podido sincronizar con el servidor.
            </p>
            <div className="flex space-x-2">
              <button onClick={loadQueue} disabled={isLoading || isSyncing} className="bg-white text-gray-700 px-3 py-1.5 rounded-md font-medium border border-gray-300 hover:bg-gray-50 flex items-center space-x-2 text-sm disabled:opacity-50">
                 <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}/>
                 <span>Refrescar Lista</span>
              </button>
              <button onClick={handleRetry} disabled={isLoading || isSyncing} className="bg-green-600 text-white px-3 py-1.5 rounded-md font-medium hover:bg-green-700 flex items-center space-x-2 text-sm disabled:bg-gray-400">
                <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}/>
                <span>Reintentar Sincronización</span>
              </button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2">
            {isLoading ? (
              <p className="text-center text-gray-500 py-4">Cargando...</p>
            ) : queue.length === 0 ? (
              <div className="text-center py-8 text-green-600 bg-green-50 rounded-lg">
                <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-10 h-10 mx-auto mb-2"/>
                <p className="font-semibold">¡Todo sincronizado!</p>
                <p className="text-sm">No hay operaciones pendientes.</p>
              </div>
            ) : (
              queue.map(request => (
                <div key={request.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <p className="font-semibold text-gray-800">{generateSummary(request)}</p>
                        {request.status === 'error' && (
                          <span className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                            ERROR ({request.retryCount})
                          </span>
                        )}
                        {request.status === 'syncing' && (
                          <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                            SINCRONIZANDO...
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-mono">
                        {new Date(request.timestamp).toLocaleString('es-AR')}
                      </p>
                      {request.lastError && (
                        <p className="text-[10px] text-red-500 mt-1 italic line-clamp-1" title={request.lastError}>
                          Último error: {request.lastError}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <button onClick={() => setItemForDetails(request)} className="text-sm text-blue-600 hover:underline">Ver Detalles</button>
                      <button onClick={() => setItemToDelete(request)} className="text-sm text-red-600 hover:underline">Eliminar</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {itemForDetails && (
        <Modal isOpen={!!itemForDetails} onClose={() => setItemForDetails(null)} title={`Detalles de Operación (${itemForDetails.action})`} size="lg">
          <pre className="bg-gray-100 p-4 rounded-md text-xs max-h-96 overflow-auto">
            {JSON.stringify(itemForDetails.payload, null, 2)}
          </pre>
        </Modal>
      )}

      <ConfirmationModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleDelete}
        title="Eliminar Operación de la Cola"
        message="¿Está seguro de que desea eliminar esta operación pendiente? Esta acción es irreversible y la operación no se enviará al servidor."
        confirmText="Sí, Eliminar"
      />
    </>
  );
};
