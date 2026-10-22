import type {
  AdjustStockRequest,
  AdjustStockResponse,
  ApiErrorBody,
  ApiErrorEnvelope,
  CreateOrderRequest,
  CreateProductRequest,
  ListProductsParams,
  Order,
  Product,
  ProductListResponse,
  ProductSummary,
  StockMovementsResponse,
  UpdateProductRequest,
} from './types';

export class ApiError extends Error implements ApiErrorBody {
  readonly status: number;
  readonly code: string;
  readonly details?: string[];
  readonly sku?: string;
  readonly available?: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.sku = body.sku;
    this.available = body.available;
  }
}

export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (value === null || typeof value !== 'object' || !('error' in value)) {
    return false;
  }
  const err = (value as Record<string, unknown>).error;
  if (err === null || typeof err !== 'object') {
    return false;
  }
  const record = err as Record<string, unknown>;
  return typeof record.code === 'string' && typeof record.message === 'string';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const endpoint = path.startsWith('/') ? `/api${path}` : `/api/${path}`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      ...init,
      headers,
    });
  } catch (err) {
    throw new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: err instanceof Error ? err.message : 'Network request failed',
    });
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    let errorBody: ApiErrorBody;
    try {
      const json: unknown = await res.json();
      if (isApiErrorEnvelope(json)) {
        errorBody = json.error;
      } else {
        errorBody = {
          code: 'UNKNOWN',
          message: `HTTP ${res.status}: ${res.statusText || 'Unknown error'}`,
        };
      }
    } catch {
      errorBody = {
        code: 'UNKNOWN',
        message: `HTTP ${res.status}: ${res.statusText || 'Unknown error'}`,
      };
    }
    throw new ApiError(res.status, errorBody);
  }

  return (await res.json()) as T;
}

export function listProducts(params?: ListProductsParams): Promise<ProductListResponse> {
  const searchParams = new URLSearchParams();
  if (params) {
    if (params.search && params.search.trim() !== '') {
      searchParams.set('search', params.search.trim());
    }
    if (params.status && params.status !== 'all') {
      searchParams.set('status', params.status);
    }
    if (params.page !== undefined && params.page !== null && params.page > 0) {
      searchParams.set('page', String(params.page));
    }
    if (params.limit !== undefined && params.limit !== null && params.limit > 0) {
      searchParams.set('limit', String(params.limit));
    }
  }
  const qs = searchParams.toString();
  return request<ProductListResponse>(`/products${qs ? `?${qs}` : ''}`);
}

export function getProductSummary(): Promise<ProductSummary> {
  return request<ProductSummary>('/products/summary');
}

export function createProduct(body: CreateProductRequest): Promise<Product> {
  return request<Product>('/products', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateProduct(id: number, body: UpdateProductRequest): Promise<Product> {
  return request<Product>(`/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteProduct(id: number): Promise<void> {
  return request<void>(`/products/${id}`, {
    method: 'DELETE',
  });
}

export function adjustStock(id: number, body: AdjustStockRequest): Promise<AdjustStockResponse> {
  return request<AdjustStockResponse>(`/products/${id}/stock`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listMovements(id: number): Promise<StockMovementsResponse> {
  return request<StockMovementsResponse>(`/products/${id}/movements`);
}

export function createOrder(body: CreateOrderRequest): Promise<Order> {
  return request<Order>('/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getOrder(id: number): Promise<Order> {
  return request<Order>(`/orders/${id}`);
}

export function cancelOrder(id: number): Promise<Order> {
  return request<Order>(`/orders/${id}/cancel`, {
    method: 'POST',
  });
}
