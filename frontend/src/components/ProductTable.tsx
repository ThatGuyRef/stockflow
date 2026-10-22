import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiError, listProducts } from '../api/client';
import type { Product, ProductStatusFilter } from '../api/types';
import { useDebounce } from '../hooks/useDebounce';
import { formatRupiah, timeAgo } from '../lib/format';

const LOW_STOCK_THRESHOLD = 10;

interface ProductTableProps {
  onAdjust?: (product: Product) => void;
}

export function ProductTable({ onAdjust }: ProductTableProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProductStatusFilter>('all');
  const [page, setPage] = useState(1);
  const limit = 10;

  const debouncedSearch = useDebounce(search, 300);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (newStatus: ProductStatusFilter) => {
    setStatus(newStatus);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatus('all');
    setPage(1);
  };

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['products', { search: debouncedSearch, status, page }],
    queryFn: () => listProducts({ search: debouncedSearch, status, page, limit }),
    placeholderData: keepPreviousData,
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header & Filter Controls */}
      <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Product List</h2>
            {isFetching && !isPending && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
                Updating...
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage inventory, unit prices, and monitor stock levels in real time.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search SKU or name..."
              className="w-full sm:w-64 pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {search && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as ProductStatusFilter)}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700 transition-colors"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="low_stock">Low Stock (≤ {LOW_STOCK_THRESHOLD})</option>
          </select>
        </div>
      </div>

      {/* STATE 1: Error State with Retry Button */}
      {isError && (
        <div className="p-8 text-center bg-rose-50/50">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-100 text-rose-600 mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-base font-medium text-slate-900">Failed to Load Products</h3>
          <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
            {error instanceof ApiError
              ? error.message
              : 'An error occurred while connecting to the backend server.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* STATE 2: Loading State (Skeleton) */}
      {isPending && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Product Name</th>
                <th className="px-5 py-3 text-right">Price</th>
                <th className="px-5 py-3 text-center">Stock</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3">Last Movement</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-20"></div></td>
                  <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-48"></div></td>
                  <td className="px-5 py-4 text-right"><div className="h-4 bg-slate-200 rounded w-24 ml-auto"></div></td>
                  <td className="px-5 py-4 text-center"><div className="h-4 bg-slate-200 rounded w-12 mx-auto"></div></td>
                  <td className="px-5 py-4 text-center"><div className="h-5 bg-slate-200 rounded-full w-16 mx-auto"></div></td>
                  <td className="px-5 py-4"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                  <td className="px-5 py-4 text-right"><div className="h-6 bg-slate-200 rounded w-16 ml-auto"></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* STATE 3: Empty State */}
      {!isPending && !isError && data?.data.length === 0 && (
        <div className="p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-400 mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <h3 className="text-base font-medium text-slate-900">No products found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {search || status !== 'all'
              ? 'Try adjusting your search terms or filter status.'
              : 'No products registered in the system yet.'}
          </p>
          {(search || status !== 'all') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* SUCCESS STATE: Product Table */}
      {!isPending && !isError && data && data.data.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-5 py-3">Product Name</th>
                  <th className="px-5 py-3 text-right">Price</th>
                  <th className="px-5 py-3 text-center">Stock</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3">Last Movement</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {data.data.map((product) => {
                  const isLow = product.is_active && product.stock <= LOW_STOCK_THRESHOLD;
                  const isOut = product.stock === 0;

                  return (
                    <tr
                      key={product.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {product.sku}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-900">
                        {product.name}
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-900 whitespace-nowrap">
                        {formatRupiah(product.price)}
                      </td>
                      <td className="px-5 py-3.5 text-center whitespace-nowrap">
                        {isOut ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Out of Stock (0)
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            {product.stock} (Low Stock)
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-900">
                            {product.stock}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center whitespace-nowrap">
                        {product.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap text-xs">
                        {timeAgo(product.last_movement_at)}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onAdjust?.(product)}
                          className="px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors cursor-pointer"
                        >
                          Adjust
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
            <div>
              Showing{' '}
              <span className="font-medium text-slate-900">
                {(page - 1) * limit + 1}
              </span>{' '}
              to{' '}
              <span className="font-medium text-slate-900">
                {Math.min(page * limit, data.total)}
              </span>{' '}
              of{' '}
              <span className="font-medium text-slate-900">{data.total}</span>{' '}
              products
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                className="px-3 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-slate-700 transition-colors cursor-pointer"
              >
                Previous
              </button>
              <span className="text-xs font-medium text-slate-700 px-2">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isFetching}
                className="px-3 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-slate-700 transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
