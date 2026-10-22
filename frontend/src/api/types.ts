export interface Product {
  id: number;
  sku: string;
  name: string;
  price: number;
  stock: number;
  is_active: boolean;
  created_at: string;
  last_movement_at: string | null;
}

export interface ProductListResponse {
  data: Product[];
  page: number;
  limit: number;
  total: number;
}

export type ProductStatusFilter = 'all' | 'active' | 'inactive' | 'low_stock';

export interface ListProductsParams {
  search?: string;
  status?: ProductStatusFilter;
  page?: number;
  limit?: number;
}

export interface ProductSummary {
  total_products: number;
  active_products: number;
  total_stock_value: number;
  low_stock_count: number;
}

export interface CreateProductRequest {
  sku: string;
  name: string;
  price: number;
  is_active?: boolean;
}

export interface UpdateProductRequest {
  sku: string;
  name: string;
  price: number;
  is_active?: boolean;
}

export type MovementType = 'in' | 'out';

export interface StockMovement {
  id: number;
  product_id: number;
  type: MovementType;
  qty: number;
  note: string | null;
  created_at: string;
}

export interface StockMovementsResponse {
  data: StockMovement[];
}

export interface AdjustStockRequest {
  type: MovementType;
  qty: number;
  note?: string | null;
}

export interface AdjustStockResponse {
  product: Product;
  movement: StockMovement;
}

export type OrderStatus = 'CREATED' | 'CANCELLED';

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

export interface Order {
  id: number;
  customer: string;
  status: OrderStatus;
  total: number;
  created_at: string;
  cancelled_at: string | null;
  items: OrderItem[];
}

export interface CreateOrderItemInput {
  sku: string;
  qty: number;
}

export interface CreateOrderRequest {
  customer: string;
  items: CreateOrderItemInput[];
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: string[];
  sku?: string;
  available?: number;
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}
