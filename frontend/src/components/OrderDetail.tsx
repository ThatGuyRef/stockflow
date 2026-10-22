import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelOrder, getOrder, ApiError } from '../api/client';
import { formatDateTime, formatRupiah, timeAgo } from '../lib/format';

export interface OrderDetailProps {
  orderId: number;
  onClose?: () => void;
}

export function OrderDetail({ orderId, onClose }: OrderDetailProps) {
  const queryClient = useQueryClient();

  const [confirming, setConfirming] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const {
    data: order,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => getOrder(orderId),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(orderId),
    onSuccess: (updatedOrder) => {
      queryClient.setQueryData(['order', orderId], updatedOrder);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      setConfirming(false);
      setCancelError(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'ALREADY_CANCELLED') {
        setCancelError('This order has already been cancelled.');
        setConfirming(false);
        queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      } else if (err instanceof Error) {
        setCancelError(err.message);
      } else {
        setCancelError('Failed to cancel order.');
      }
    },
  });

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !cancelMutation.isPending) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, cancelMutation.isPending]);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
      onClick={() => {
        if (!cancelMutation.isPending) onClose?.();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loading State */}
        {isLoading && (
          <div className="p-8 text-center space-y-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-3 border-indigo-600 border-t-transparent" />
            <p className="text-sm text-slate-500">Loading Order #{orderId}...</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && isError && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">
                Order #{orderId} Details
              </h3>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm cursor-pointer"
                  aria-label="Close"
                >
                  ✕
                </button>
              )}
            </div>

            {error instanceof ApiError &&
            (error.status === 404 || error.code === 'NOT_FOUND') ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-center space-y-2">
                <div className="text-2xl">🔍</div>
                <h4 className="text-sm font-bold text-amber-900">
                  Order #{orderId} Not Found
                </h4>
                <p className="text-xs text-amber-700">
                  No order record exists with this ID. Please verify the order number.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-center space-y-2">
                <div className="text-2xl">⚠️</div>
                <h4 className="text-sm font-bold text-rose-900">
                  Failed to Load Order
                </h4>
                <p className="text-xs text-rose-700">
                  {error instanceof Error ? error.message : 'An unexpected error occurred.'}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-2 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {onClose && (
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}

        {/* Success Data State */}
        {!isLoading && !isError && order && (
          <div>
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-slate-900">
                  Order #{order.id}
                </h3>
                {order.status === 'CREATED' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    CREATED
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    CANCELLED
                  </span>
                )}
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={cancelMutation.isPending}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm cursor-pointer disabled:opacity-50"
                  aria-label="Close"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Meta Information */}
            <div className="px-6 py-3.5 bg-slate-50/30 border-b border-slate-100 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">Customer</span>
                <span className="font-semibold text-slate-800">{order.customer}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Created At</span>
                <span className="text-slate-700">
                  {formatDateTime(order.created_at)} ({timeAgo(order.created_at)})
                </span>
              </div>
              {order.cancelled_at && (
                <div className="col-span-2 pt-1 text-rose-700 flex items-center gap-1.5 font-medium">
                  <span>Cancelled At:</span>
                  <span>
                    {formatDateTime(order.cancelled_at)} ({timeAgo(order.cancelled_at)})
                  </span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="p-6 space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Order Items ({order.items.length})
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 text-slate-600">
                        <tr>
                          <th className="py-2 px-3 font-semibold">SKU</th>
                          <th className="py-2 px-3 font-semibold">Item Name</th>
                          <th className="py-2 px-3 font-semibold text-right">Qty</th>
                          <th className="py-2 px-3 font-semibold text-right">Unit Price</th>
                          <th className="py-2 px-3 font-semibold text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {order.items.map((item) => (
                          <tr key={item.sku} className="hover:bg-slate-50/60">
                            <td className="py-2 px-3 font-mono font-semibold text-slate-800">
                              {item.sku}
                            </td>
                            <td className="py-2 px-3 text-slate-700">
                              {item.name}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900 text-right">
                              {item.qty}
                            </td>
                            <td className="py-2 px-3 text-slate-600 text-right">
                              {formatRupiah(item.unit_price)}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900 text-right">
                              {formatRupiah(item.subtotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Total Bar */}
                  <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase">
                      Total Order
                    </span>
                    <span className="text-base font-bold text-indigo-700">
                      {formatRupiah(order.total)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cancel Error Banner */}
              {cancelError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{cancelError}</span>
                </div>
              )}

              {/* Actions Footer */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  {order.status !== 'CANCELLED' && (
                    <>
                      {!confirming ? (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirming(true);
                            setCancelError(null);
                          }}
                          disabled={cancelMutation.isPending}
                          className="px-3 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Cancel Order
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 bg-rose-50/80 border border-rose-200 rounded-lg px-3 py-1.5">
                          <span className="text-xs text-rose-800 font-medium">
                            Cancel this order? Stock will be restored.
                          </span>
                          <button
                            type="button"
                            onClick={() => cancelMutation.mutate()}
                            disabled={cancelMutation.isPending}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {cancelMutation.isPending ? 'Cancelling...' : 'Yes, Cancel'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            disabled={cancelMutation.isPending}
                            className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                          >
                            No
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={cancelMutation.isPending}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
