export interface ProductBrand {
  id: number;
  storeId: number;
  name: string;
  description?: string | null;
  logo?: string | null;
  website?: string | null;
  countryOfOrigin?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertProductBrand = Omit<ProductBrand, 'id' | 'createdAt' | 'updatedAt'>;
