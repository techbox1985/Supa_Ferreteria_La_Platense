
// Google Apps Script para Refrigeración Tolosa POS
// Fuente de verdad: Google Sheets

const SPREADSHEET_ID = '1L2wt60AlSlD32IrURe5wSSGWhCunVwRPIx5PslkSsY8';

const SHEETS = {
  PRODUCTOS: 'Productos',
  CLIENTES: 'Clientes',
  VENTAS: 'Ventas',
  CUENTA_CORRIENTE: 'CuentaCorriente',
  TURNOS: 'Turnos',
  GASTOS: 'Gastos',
  USUARIOS: 'Usuarios',
  PROVEEDORES: 'Proveedores',
  LOGS: 'Logs'
};

function logOperation(action, id, status, message) {
  try {
    const sheet = getSheet(SHEETS.LOGS);
    sheet.appendRow([new Date(), action, id, status, message]);
  } catch (e) {
    console.error('Error logging operation:', e);
  }
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Hoja '" + name + "' no encontrada.");
  return sheet;
}

function getColumnHeaders(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => { map[h] = i + 1; });
  return map;
}

function findRowByValue(sheet, value, column) {
  const data = sheet.getRange(1, column, sheet.getLastRow(), 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(value)) return i + 1;
  }
  return -1;
}

function getFirstEmptyRow(sheet) {
  const column = sheet.getRange('A:A').getValues();
  for (var i = 0; i < column.length; i++) {
    if (column[i][0] === "") return i + 1;
  }
  return column.length + 1;
}

function parseSheetNumber(val) {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return 0;
  const sanitized = val.replace(/[$\s.]/g, '').replace(',', '.');
  return parseFloat(sanitized) || 0;
}

function formatDateForSheet(date) {
  return Utilities.formatDate(date, "GMT-3", "yyyy-MM-dd HH:mm:ss");
}

function generateUniqueId() {
  return Utilities.getUuid();
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const payload = request.payload;
    let result;

    switch (action) {
      case 'getProductsAndSyncStatus': result = getProductsAndSyncStatus(); break;
      case 'login': result = login(payload); break;
      case 'openShift': result = openShift(payload); break;
      case 'closeShift': result = closeShift(payload); break;
      case 'addSale': result = addSale(payload); break;
      case 'massUpdatePrices': result = massUpdatePrices(payload); break;
      case 'recordStockEntry': result = recordStockEntry(payload); break;
      case 'addCustomer': result = addCustomer(payload); break;
      case 'updateCustomer': result = updateCustomer(payload); break;
      case 'updateProduct': result = updateProduct(payload); break;
      case 'deleteProduct': result = deleteProduct(payload); break;
      case 'addProduct': result = addProduct(payload); break;
      case 'annulSale': result = annulSale(payload); break;
      case 'recordPayment': result = recordPayment(payload); break;
      case 'addExpense': result = addExpense(payload); break;
      case 'updateExpense': result = updateExpense(payload); break;
      case 'deleteExpense': result = deleteExpense(payload); break;
      case 'addSupplier': result = addSupplier(payload); break;
      case 'updateSupplier': result = updateSupplier(payload); break;
      case 'getAllUsersForAdmin': result = getAllUsersForAdmin(); break;
      case 'getCategoriesData': result = getCategoriesData(); break;
      case 'markSaleAsBilled': result = markSaleAsBilled(payload); break;
      
      // Presupuestos
      case 'addBudget': result = addBudget(payload); break;
      case 'updateBudget': result = updateBudget(payload); break;
      case 'updateBudgetStatus': result = updateBudgetStatus(payload); break;
      case 'deleteBudget': result = deleteBudget(payload); break;
      case 'updateBudgetToSale': result = updateBudgetToSale(payload); break;
      
      case 'createElectronicInvoice': result = { status: 'success', data: { cae: 'PROCESO_EXTERNO', nro: 'PENDIENTE' } }; break;
      case 'searchProducts': result = searchProducts(payload); break;
      default: throw new Error("Acción no reconocida: " + action);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: result }))
      .setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function getProductsAndSyncStatus() {
  const sheet = getSheet(SHEETS.PRODUCTOS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const item = {};
    headers.forEach((h, j) => { item[h] = data[i][j]; });
    result.push(item);
  }
  return result;
}

function login(payload) {
  const usersSheet = getSheet(SHEETS.USUARIOS);
  const shiftsSheet = getSheet(SHEETS.TURNOS);
  const users = usersSheet.getDataRange().getValues();
  const headers = users[0];
  let user = null;
  for(let i=1; i<users.length; i++) {
    if (String(users[i][0]) === String(payload.userId) && String(users[i][2]) === String(payload.pin)) {
      user = {};
      headers.forEach((h, j) => { user[h] = users[i][j]; });
      break;
    }
  }
  if (!user) throw new Error("ID de usuario o PIN incorrecto.");
  if (user.Activo !== 'SI') throw new Error("Usuario inactivo.");
  const shifts = shiftsSheet.getDataRange().getValues();
  const shiftHeaders = shifts[0];
  let activeShift = null;
  for(let i=shifts.length-1; i>=1; i--) {
    if (String(shifts[i][1]) === String(payload.userId) && shifts[i][10] === 'Abierto') {
      activeShift = {};
      shiftHeaders.forEach((h, j) => { activeShift[h] = shifts[i][j]; });
      break;
    }
  }
  return { user, activeShift };
}

function updateStock(items) {
  const sheet = getSheet(SHEETS.PRODUCTOS);
  const headers = getColumnHeaders(sheet);
  const vendidosCol = headers['Vendidos'];
  const pvCol = headers['Venta.PV'];
  
  items.forEach(item => {
    if (item.product.cod.startsWith('COMMON_')) return;
    const row = findRowByValue(sheet, item.product.cod, 1);
    if (row > -1) {
      if (vendidosCol) {
        const cell = sheet.getRange(row, vendidosCol);
        cell.setValue(parseSheetNumber(cell.getValue()) + item.quantity);
      }
      if (pvCol) {
        const cell = sheet.getRange(row, pvCol);
        cell.setValue(parseSheetNumber(cell.getValue()) + item.quantity);
      }
    }
  });
}

function addSale(saleData) {
    const lock = LockService.getPublicLock();
    try {
      // Intentar obtener el lock por 10 segundos
      lock.waitLock(10000);
      
      const ventasSheet = getSheet(SHEETS.VENTAS);
      const ccSheet = getSheet(SHEETS.CUENTA_CORRIENTE);
      const ventasHeaders = getColumnHeaders(ventasSheet);

      // IDEMPOTENCIA: Buscar si el sale_id ya existe
      const existingSaleRow = findRowByValue(ventasSheet, saleData.id, ventasHeaders['ID_Venta'] || 1);
      if (existingSaleRow !== -1) {
        logOperation('addSale', saleData.id, 'success', 'Venta ya existía (idempotencia)');
        return { status: 'success', message: 'La venta ya existe.', sale_id: saleData.id, server_ts: new Date().getTime() };
      }
      
      // BLINDAJE CONTRA UNDEFINED EN PAGO
      const payment = saleData.payment || { cash: 0, digital: 0, credit: 0, echeqs: [] };
      const echeqs = payment.echeqs || [];
      const totalEcheq = echeqs.reduce((sum, e) => sum + (e.amount || 0), 0);

      const newRowIndex = getFirstEmptyRow(ventasSheet);
      const rowValues = new Array(ventasSheet.getLastColumn()).fill('');
      
      const mapping = {
        'ID_Venta': saleData.id, 'Fecha': saleData.date, 'ID_Cliente': saleData.customer.Id_Cliente,
        'Nombre_Cliente': saleData.customer['Nombre y Apellido'], 'Cant_Productos': saleData.itemCount,
        'Subtotal': saleData.subtotal, 'Descripcion_Ajuste': saleData.adjustmentDescription,
        'Monto_Ajuste': saleData.adjustmentAmount, 'Total': saleData.total,
        'Pago_Efectivo': payment.cash, 'Pago_Digital': payment.digital,
        'Productos (JSON)': JSON.stringify(saleData.items), 'Estado': 'Completada',
        'ID_Turno': saleData.shiftId, 'Facturacion': saleData.facturacion,
        'Pago_Cuenta_Corriente': payment.credit, 'Pago_Echeq': totalEcheq,
        'Echeqs (JSON)': JSON.stringify(echeqs)
      };

      Object.keys(mapping).forEach(header => {
        const colIndex = ventasHeaders[header];
        if (colIndex) rowValues[colIndex - 1] = mapping[header];
      });

      ventasSheet.getRange(newRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      
      updateStock(saleData.items);

      if (payment.credit > 0 && saleData.customer.Id_Cliente !== '0') {
          ccSheet.appendRow([generateUniqueId(), saleData.date, saleData.customer.Id_Cliente, 'Venta', `Venta ID: ${saleData.id.slice(0, 8)}`, payment.credit, 0, 0, saleData.id, '', 'Cta. Cte.', saleData.shiftId]);
      }
      
      logOperation('addSale', saleData.id, 'success', 'Venta insertada correctamente');
      return { status: 'success', sale_id: saleData.id, server_ts: new Date().getTime() };
    } catch (e) {
      logOperation('addSale', saleData.id, 'error', e.message);
      throw e;
    } finally {
      lock.releaseLock();
    }
}

function addBudget(budgetData) {
  const ventasSheet = getSheet(SHEETS.VENTAS);
  const headers = getColumnHeaders(ventasSheet);
  const newRowIndex = getFirstEmptyRow(ventasSheet);
  const rowValues = new Array(ventasSheet.getLastColumn()).fill('');
  
  const mapping = {
    'ID_Venta': budgetData.id,
    'Fecha': budgetData.date,
    'ID_Cliente': budgetData.customer.Id_Cliente,
    'Nombre_Cliente': budgetData.customer['Nombre y Apellido'],
    'Cant_Productos': budgetData.items.reduce((sum, i) => sum + i.quantity, 0),
    'Subtotal': budgetData.total,
    'Total': budgetData.total,
    'Productos (JSON)': JSON.stringify(budgetData.items),
    'Estado': 'Pendiente'
  };

  Object.keys(mapping).forEach(header => {
    const colIndex = headers[header];
    if (colIndex) rowValues[colIndex - 1] = mapping[header];
  });

  ventasSheet.getRange(newRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  return { status: 'success' };
}

function updateBudget(payload) {
  const sheet = getSheet(SHEETS.VENTAS);
  const headers = getColumnHeaders(sheet);
  const row = findRowByValue(sheet, payload.id, headers['ID_Venta'] || 1);
  if (row === -1) throw new Error("Presupuesto no encontrado.");
  
  const mapping = {
    'Fecha': payload.date,
    'ID_Cliente': payload.customer.Id_Cliente,
    'Nombre_Cliente': payload.customer['Nombre y Apellido'],
    'Cant_Productos': payload.items.reduce((sum, i) => sum + i.quantity, 0),
    'Subtotal': payload.total,
    'Total': payload.total,
    'Productos (JSON)': JSON.stringify(payload.items)
  };

  Object.keys(mapping).forEach(key => {
    const col = headers[key];
    if (col) sheet.getRange(row, col).setValue(mapping[key]);
  });
  return { status: 'success' };
}

function updateBudgetStatus(payload) {
  const sheet = getSheet(SHEETS.VENTAS);
  const headers = getColumnHeaders(sheet);
  const row = findRowByValue(sheet, payload.budgetId, headers['ID_Venta'] || 1);
  if (row === -1) throw new Error("Presupuesto no encontrado.");
  
  const statusMap = { 'pending': 'Pendiente', 'approved': 'Aprobado', 'rejected': 'Rechazado' };
  const statusCol = headers['Estado'];
  if (statusCol) sheet.getRange(row, statusCol).setValue(statusMap[payload.status] || payload.status);
  return { status: 'success' };
}

function deleteBudget(payload) {
  const sheet = getSheet(SHEETS.VENTAS);
  const headers = getColumnHeaders(sheet);
  const row = findRowByValue(sheet, payload.budgetId, headers['ID_Venta'] || 1);
  if (row === -1) throw new Error("Presupuesto no encontrado.");
  
  sheet.deleteRow(row);
  return { status: 'success' };
}

function updateBudgetToSale(payload) {
  const ventasSheet = getSheet(SHEETS.VENTAS);
  const ccSheet = getSheet(SHEETS.CUENTA_CORRIENTE);
  const headers = getColumnHeaders(ventasSheet);
  const row = findRowByValue(ventasSheet, payload.id, headers['ID_Venta'] || 1);
  
  if (row === -1) throw new Error("Presupuesto no encontrado.");
  
  const payment = payload.payment || { cash: 0, digital: 0, credit: 0, echeqs: [] };
  const echeqs = payment.echeqs || [];
  const totalEcheq = echeqs.reduce((sum, e) => sum + (e.amount || 0), 0);

  const mapping = {
    'Estado': 'Completada',
    'Fecha': payload.date,
    'ID_Turno': payload.shiftId,
    'Facturacion': payload.facturacion,
    'Pago_Efectivo': payment.cash,
    'Pago_Digital': payment.digital,
    'Pago_Cuenta_Corriente': payment.credit,
    'Pago_Echeq': totalEcheq,
    'Echeqs (JSON)': JSON.stringify(echeqs),
    'Monto_Ajuste': payload.adjustmentAmount,
    'Descripcion_Ajuste': payload.adjustmentDescription,
    'Total': payload.total
  };
  
  Object.keys(mapping).forEach(header => {
    const colIndex = headers[header];
    if (colIndex) ventasSheet.getRange(row, colIndex).setValue(mapping[header]);
  });
  
  updateStock(payload.items);

  if (payment.credit > 0 && payload.customer.Id_Cliente !== '0') {
      ccSheet.appendRow([generateUniqueId(), payload.date, payload.customer.Id_Cliente, 'Venta', `Venta ID: ${payload.id.slice(0, 8)}`, payment.credit, 0, 0, payload.id, '', 'Cta. Cte.', payload.shiftId]);
  }
  
  return { status: 'success' };
}

function massUpdatePrices(payload) {
  const { filterBy, filterValue, targetPrice, updateType, updateValue } = payload;
  const sheet = getSheet(SHEETS.PRODUCTOS);
  const data = sheet.getDataRange().getValues();
  const headers = getColumnHeaders(sheet);
  const targetColIndex = headers[targetPrice];
  const lastUpdateColIndex = headers['Ultima.Actualizacion'];
  const filterColIndex = headers[filterBy];
  if (!targetColIndex) throw new Error(`Columna de precio '${targetPrice}' no encontrada.`);
  let updatedCount = 0;
  const nowStr = formatDateForSheet(new Date());
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let matches = false;
    if (filterBy === 'All') matches = true;
    else if (filterColIndex && String(row[filterColIndex - 1]) === String(filterValue)) matches = true;
    if (matches) {
      const currentPrice = parseSheetNumber(row[targetColIndex - 1]);
      let newPrice = currentPrice;
      if (updateType === 'percentage') newPrice = currentPrice * (1 + updateValue / 100);
      else newPrice = currentPrice + updateValue;
      const rowIndex = i + 1;
      sheet.getRange(rowIndex, targetColIndex).setValue(newPrice);
      if (lastUpdateColIndex) sheet.getRange(rowIndex, lastUpdateColIndex).setValue(nowStr);
      updatedCount++;
    }
  }
  return { status: 'success', message: `Se actualizaron ${updatedCount} productos.` };
}

function recordStockEntry(payload) {
  const sheet = getSheet(SHEETS.PRODUCTOS);
  const headers = getColumnHeaders(sheet);
  const ingresosCol = headers['Ingresos'];
  const costoCol = headers['P.Costo'];
  const precioCol = headers['Precio'];
  const activoCol = headers['Activo'];
  let updatedCostCount = 0;

  payload.items.forEach(item => {
    const row = findRowByValue(sheet, item.product.cod, 1);
    if (row > -1) {
      if (ingresosCol) {
        const cell = sheet.getRange(row, ingresosCol);
        cell.setValue(parseSheetNumber(cell.getValue()) + item.quantity);
      }
      if (costoCol && item.costPrice > 0) {
        sheet.getRange(row, costoCol).setValue(item.costPrice);
        updatedCostCount++;
      }
      if (precioCol && item.salePrice > 0) {
        sheet.getRange(row, precioCol).setValue(item.salePrice);
      }
      if (activoCol && item.reactivate) {
        sheet.getRange(row, activoCol).setValue('SI');
      }
    }
  });
  return { updatedCostCount };
}

function addCustomer(payload) {
  const sheet = getSheet(SHEETS.CLIENTES);
  sheet.appendRow([generateUniqueId(), payload['Nombre y Apellido'], payload.Whatsapp, payload['Tipo.Documento'], payload.Documento, payload.Condicion_IVA, 0, 0, payload['Fecha Creacion']]);
  return { status: 'success' };
}

function updateCustomer(payload) {
  const sheet = getSheet(SHEETS.CLIENTES);
  const headers = getColumnHeaders(sheet);
  const row = findRowByValue(sheet, payload.Id_Cliente, 1);
  if (row === -1) throw new Error("Cliente no encontrado.");
  Object.keys(payload).forEach(key => {
    const col = headers[key];
    if (col && key !== 'Id_Cliente') sheet.getRange(row, col).setValue(payload[key]);
  });
  return { status: 'success' };
}

function updateProduct(payload) {
  const sheet = getSheet(SHEETS.PRODUCTOS);
  const headers = getColumnHeaders(sheet);
  const row = findRowByValue(sheet, payload.cod, 1);
  if (row === -1) throw new Error("Producto no encontrado.");
  Object.keys(payload).forEach(key => {
    const col = headers[key];
    if (col && key !== 'cod') sheet.getRange(row, col).setValue(payload[key]);
  });
  const updateCol = headers['Ultima.Actualizacion'];
  if (updateCol) sheet.getRange(row, updateCol).setValue(formatDateForSheet(new Date()));
  return { status: 'success' };
}

function deleteProduct(payload) {
  const productosSheet = getSheet(SHEETS.PRODUCTOS);
  let headers = getColumnHeaders(productosSheet);
  const productoRow = findRowByValue(productosSheet, payload.cod, 1);

  if (productoRow === -1) throw new Error("Producto no encontrado.");

  // Asegurar que las columnas 'Eliminado' y 'Eliminado_At' existan
  let lastCol = productosSheet.getLastColumn();
  if (!headers['Eliminado']) {
    productosSheet.getRange(1, ++lastCol).setValue('Eliminado');
    headers = getColumnHeaders(productosSheet); // Recargar headers
  }
  if (!headers['Eliminado_At']) {
    productosSheet.getRange(1, ++lastCol).setValue('Eliminado_At');
    headers = getColumnHeaders(productosSheet); // Recargar headers
  }

  const eliminadoColIndex = headers['Eliminado'];
  const eliminadoAtColIndex = headers['Eliminado_At'];

  if (eliminadoColIndex) {
    productosSheet.getRange(productoRow, eliminadoColIndex).setValue(true);
  }
  if (eliminadoAtColIndex) {
    productosSheet.getRange(productoRow, eliminadoAtColIndex).setValue(formatDateForSheet(new Date()));
  }

  return { status: 'success', deleted: true };
}

function searchProducts(payload) {
  const productosSheet = getSheet(SHEETS.PRODUCTOS);
  const headers = getColumnHeaders(productosSheet);
  const data = productosSheet.getDataRange().getValues();

  const searchTerm = (payload.searchTerm || '').toLowerCase();
  const page = payload.page ? parseInt(payload.page) : 1;
  const pageSize = payload.pageSize ? parseInt(payload.pageSize) : 50;
  const filters = payload.filters || {};

  const filteredAndSearchedItems = [];

  for (let i = 1; i < data.length; i++) {
    const item = {};
    headers.forEach((h, j) => { item[h] = data[i][j]; });

    // Excluir siempre Eliminados
    const eliminadoColIndex = headers['Eliminado'];
    const isDeleted = (eliminadoColIndex !== undefined && (item[headers[eliminadoColIndex]] === true || String(item[headers[eliminadoColIndex]]).toLowerCase() === 'true' || String(item[headers[eliminadoColIndex]]) === '1'));
    if (isDeleted) continue;

    // Aplicar búsqueda por searchTerm
    const matchesSearchTerm = searchTerm === '' ||
      String(item.Producto || '').toLowerCase().includes(searchTerm) ||
      String(item.cod || '').toLowerCase().includes(searchTerm) ||
      String(item.Descripcion || '').toLowerCase().includes(searchTerm) ||
      String(item['cod.barras'] || '').toLowerCase().includes(searchTerm);

    if (!matchesSearchTerm) continue;

    // Aplicar filtros
    const matchesFilters = 
      (filters.categoria === 'All' || !filters.categoria || String(item.Categoria || '').toUpperCase() === String(filters.categoria || '').toUpperCase()) &&
      (filters.proveedor === 'All' || !filters.proveedor || String(item.Proveedor || '').toUpperCase() === String(filters.proveedor || '').toUpperCase()) &&
      (filters.activo === 'All' || !filters.activo || (filters.activo === 'Active' ? (item.Activo === true || String(item.Activo).toUpperCase() === 'SI') : (item.Activo === false || String(item.Activo).toUpperCase() === 'NO'))) &&
      (filters.online === 'All' || !filters.online || (filters.online === 'Yes' ? (item.Online === true || String(item.Online).toUpperCase() === 'SI') : (item.Online === false || String(item.Online).toUpperCase() === 'NO')));

    if (!matchesFilters) continue;

    filteredAndSearchedItems.push(item);
  }

  const total = filteredAndSearchedItems.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const items = filteredAndSearchedItems.slice(start, end);

  return { status: 'success', data: { items: items, total: total, page: page, pageSize: pageSize } };
}

function addProduct(payload) {
  const sheet = getSheet(SHEETS.PRODUCTOS);
  const headers = getColumnHeaders(sheet);
  const lastCol = sheet.getLastColumn();
  const rowValues = new Array(lastCol).fill('');
  Object.keys(payload).forEach(key => {
    const colIndex = headers[key];
    if (colIndex) rowValues[colIndex - 1] = payload[key];
  });
  sheet.appendRow(rowValues);
  return { status: 'success' };
}

function recordPayment(payload) {
  const lock = LockService.getPublicLock();
  try {
    lock.waitLock(10000);
    const ccSheet = getSheet(SHEETS.CUENTA_CORRIENTE);
    ccSheet.appendRow([generateUniqueId(), payload.date, payload.customerId, 'Pago', payload.description, 0, payload.amount, 0, '', '', payload.paymentMethod, payload.shiftId]);
    logOperation('recordPayment', payload.customerId, 'success', `Pago de ${payload.amount} registrado`);
    return { status: 'success' };
  } catch (e) {
    logOperation('recordPayment', payload.customerId, 'error', e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function addExpense(payload) {
  const lock = LockService.getPublicLock();
  try {
    lock.waitLock(10000);
    const sheet = getSheet(SHEETS.GASTOS);
    const headers = getColumnHeaders(sheet);
    const rowValues = new Array(sheet.getLastColumn()).fill('');
    Object.keys(payload).forEach(key => {
      const colIndex = headers[key];
      if (colIndex) rowValues[colIndex - 1] = payload[key];
    });
    sheet.appendRow(rowValues);
    logOperation('addExpense', payload.id_gastos, 'success', `Gasto de ${payload.Monto} registrado`);
    return { status: 'success' };
  } catch (e) {
    logOperation('addExpense', payload.id_gastos, 'error', e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function updateExpense(payload) {
  const sheet = getSheet(SHEETS.GASTOS);
  const headers = getColumnHeaders(sheet);
  const row = findRowByValue(sheet, payload.id_gastos, headers['id_gastos'] || 1);
  if (row === -1) throw new Error("Gasto no encontrado.");
  Object.keys(payload).forEach(key => {
    const col = headers[key];
    if (col && key !== 'id_gastos') sheet.getRange(row, col).setValue(payload[key]);
  });
  return { status: 'success' };
}

function deleteExpense(payload) {
  const sheet = getSheet(SHEETS.GASTOS);
  const headers = getColumnHeaders(sheet);
  const row = findRowByValue(sheet, payload.id_gastos, headers['id_gastos'] || 1);
  if (row === -1) throw new Error("Gasto no encontrado.");
  sheet.deleteRow(row);
  return { status: 'success' };
}

function annulSale(payload) {
  const ventasSheet = getSheet(SHEETS.VENTAS);
  const productosSheet = getSheet(SHEETS.PRODUCTOS);
  const ccSheet = getSheet(SHEETS.CUENTA_CORRIENTE);
  const headers = getColumnHeaders(ventasSheet);
  const prodHeaders = getColumnHeaders(productosSheet);
  const row = findRowByValue(ventasSheet, payload.saleId, headers['ID_Venta'] || 1);
  if (row === -1) throw new Error("Venta no encontrada.");
  
  const statusCol = headers['Estado'];
  if (statusCol) ventasSheet.getRange(row, statusCol).setValue('Anulada');
  
  const itemsJson = ventasSheet.getRange(row, headers['Productos (JSON)']).getValue();
  if (itemsJson) {
    const items = JSON.parse(itemsJson);
    items.forEach(item => {
      const pRow = findRowByValue(productosSheet, item.product.cod, 1);
      if (pRow > -1) {
        const vendidosCell = productosSheet.getRange(pRow, prodHeaders['Vendidos']);
        const pvCell = productosSheet.getRange(pRow, prodHeaders['Venta.PV']);
        if (vendidosCell) vendidosCell.setValue(parseSheetNumber(vendidosCell.getValue()) - item.quantity);
        if (pvCell) pvCell.setValue(parseSheetNumber(pvCell.getValue()) - item.quantity);
      }
    });
  }
  
  const ccHeaders = getColumnHeaders(ccSheet);
  const ccData = ccSheet.getDataRange().getValues();
  for (let i = ccData.length - 1; i >= 1; i--) {
    if (String(ccData[i][ccHeaders['Venta_Original_ID'] - 1]) === String(payload.saleId)) {
      ccSheet.deleteRow(i + 1);
    }
  }
  return { status: 'success' };
}

function getAllUsersForAdmin() {
  const sheet = getSheet(SHEETS.USUARIOS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const item = {};
    headers.forEach((h, j) => { item[h] = data[i][j]; });
    result.push(item);
  }
  return result;
}

function getCategoriesData() {
  const sheet = getSheet(SHEETS.PRODUCTOS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const catIdx = headers.indexOf('Categoria');
  const subCatIdx = headers.indexOf('Sub Categoria');
  const result = [];
  const seen = new Set();
  for (let i = 1; i < data.length; i++) {
    const key = data[i][catIdx] + '|' + data[i][subCatIdx];
    if (!seen.has(key)) {
      result.push({ categoria: data[i][catIdx], subCategoria: data[i][subCatIdx] });
      seen.add(key);
    }
  }
  return result;
}

function markSaleAsBilled(payload) {
  const sheet = getSheet(SHEETS.VENTAS);
  const headers = getColumnHeaders(sheet);
  const row = findRowByValue(sheet, payload.saleId, headers['ID_Venta'] || 1);
  if (row === -1) throw new Error("Venta no encontrada.");
  
  const map = {
    'Factura_CAE': payload.cae,
    'Factura_Nro': payload.nro,
    'Factura_Vto_CAE': payload.vtoCae,
    'Factura_QR_Data': payload.qrData,
    'Factura_Fecha': payload.date,
    'Factura_URL': payload.url,
    'Facturacion': payload.facturacion
  };
  
  Object.keys(map).forEach(key => {
    const col = headers[key];
    if (col && map[key] !== undefined) sheet.getRange(row, col).setValue(map[key]);
  });
  return { status: 'success' };
}

function addSupplier(payload) {
  const sheet = getSheet(SHEETS.PROVEEDORES);
  sheet.appendRow([generateUniqueId(), payload.Nombre, payload.CUIT, payload.Condicion_IVA, payload.Email, payload.Telefono, payload.Contacto, payload.Direccion, payload.Activo]);
  return { status: 'success' };
}

function updateSupplier(payload) {
  const sheet = getSheet(SHEETS.PROVEEDORES);
  const headers = getColumnHeaders(sheet);
  const row = findRowByValue(sheet, payload.ID_Proveedor, 1);
  if (row === -1) throw new Error("Proveedor no encontrado.");
  Object.keys(payload).forEach(key => {
    const col = headers[key];
    if (col && key !== 'ID_Proveedor') sheet.getRange(row, col).setValue(payload[key]);
  });
  return { status: 'success' };
}

function openShift(payload) {
  const sheet = getSheet(SHEETS.TURNOS);
  const id = generateUniqueId();
  const dateStr = formatDateForSheet(new Date());
  // [ID_Turno, ID_Usuario, Fecha_Apertura, Fecha_Cierre, Monto_Apertura, Monto_Cierre_Declarado, Total_Ventas_Efectivo, Total_Gastos_Efectivo, Efectivo_Esperado, Diferencia, Estado]
  sheet.appendRow([id, payload.userId, dateStr, '', payload.openingAmount, 0, 0, 0, payload.openingAmount, 0, 'Abierto']);
  return { ID_Turno: id, ID_Usuario: payload.userId, Fecha_Apertura: dateStr, Monto_Apertura: payload.openingAmount, Estado: 'Abierto' };
}

function closeShift(payload) {
  const sheet = getSheet(SHEETS.TURNOS);
  const headers = getColumnHeaders(sheet);
  const row = findRowByValue(sheet, payload.shiftId, 1);
  if (row === -1) throw new Error("Turno no encontrado.");
  
  const dateStr = formatDateForSheet(new Date());
  sheet.getRange(row, headers['Fecha_Cierre']).setValue(dateStr);
  sheet.getRange(row, headers['Monto_Cierre_Declarado']).setValue(payload.closingAmount);
  sheet.getRange(row, headers['Estado']).setValue('Cerrado');
  
  return { status: 'success' };
}
