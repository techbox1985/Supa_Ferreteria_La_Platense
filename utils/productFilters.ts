import type { Product } from '../types';

export const isDeleted = (value: any): boolean => {
  if (value === true) return true;
  if (value === 1) return true;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === '1' || lower === 'true') return true;
  }
  return false;
};

type ProductSearchCandidate = Partial<Product> & {
  name?: string;
  description?: string;
  barcode?: string;
};

export const normalizeSearchText = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

export const getProductSearchText = (product: ProductSearchCandidate): string => {
  const parts = [
    product.Producto,
    product.name,
    product.Descripcion,
    product.description,
    product.cod,
    product['cod.barras'],
    product.barcode,
  ];

  return parts
    .map(normalizeSearchText)
    .filter(Boolean)
    .join(' ');
};

export const matchesProductSearch = (product: ProductSearchCandidate, query: string): boolean => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return getProductSearchText(product).includes(normalizedQuery);
};
