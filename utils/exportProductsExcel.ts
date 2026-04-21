import { utils, writeFile } from 'xlsx';
import { Product } from '../types';


export interface ProductExportRow {
  proveedor: string;
  cod: string;
  barcode: string;
  name: string;
  category: string;
  cost_price: number | string;
  offer_price: number | string;
  stock: number | string;
  brand: string;
  unit: string;
  // Add more fields as needed for import compatibility
}

export function mapProductToExportRow(product: Product): ProductExportRow {
  return {
    proveedor: String(product.Proveedor || ''),
    cod: String(product.cod || ''),
    barcode: String(product['cod.barras'] || ''),
    name: String(product.Producto || ''),
    category: String(product.Categoria || ''),
    cost_price: product['P.Costo'] ?? '',
    offer_price: product['Precio de Oferta'] ?? '',
    stock: product.stockk ?? '',
    brand: String(product.Marca || ''),
    unit: (product as any).Unidad ? String((product as any).Unidad) : '',
  };
}

export function exportProductsToExcel(products: Product[]): void {
  const exportRows = products.map(mapProductToExportRow);
  const ws = utils.json_to_sheet(exportRows, { header: [
    'proveedor',
    'cod',
    'barcode',
    'name',
    'category',
    'cost_price',
    'offer_price',
    'stock',
    'brand',
    'unit',
  ] });
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Productos');
  writeFile(wb, 'productos_export.xlsx');
}
