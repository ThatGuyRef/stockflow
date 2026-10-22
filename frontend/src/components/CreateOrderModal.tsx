import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createOrder } from '../api/client';
import type { Order } from '../api/types';
import {
  mapOrderError,
  validateOrderForm,
  type OrderItemRow,
  type RowError,
} from '../lib/validation';
import { OrderDetail } from './OrderDetail';

interface CreateOrderModalProps {
  onClose: () => void;
}

export function CreateOrderModal({ onClose }: CreateOrderModalProps) {
  const queryClient = useQueryClient();

  const [customer, setCustomer] = useState('');
  const [items, setItems] = useState<OrderItemRow[]>([
    { key: crypto.randomUUID(), sku: '', qty: '1' },
  ]);

  const [customerError, setCustomerError] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, RowError>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      return createOrder({
        customer: customer.trim(),
        items: items.map((it) => ({
          sku: it.sku.trim().toUpperCase(),
          qty: parseInt(it.qty.trim(), 10),
        })),
      });
    },
    onSuccess: (data) => {
      setCreatedOrder(data);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (err) => {
      const mapped = mapOrderError(err, items);
      setRowErrors((prev) => ({
        ...prev,
        ...mapped.rowErrors,
      }));
      setGeneralError(mapped.generalError);
    },
  });

  // Escape key handler (diabaikan selama mutation.isPending)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mutation.isPending) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, mutation.isPending]);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { key: crypto.randomUUID(), sku: '', qty: '1' },
    ]);
    if (mutation.isError) mutation.reset();
    if (generalError) setGeneralError(null);
  };

  const handleRemoveItem = (key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
    setRowErrors((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    if (mutation.isError) mutation.reset();
    if (generalError) setGeneralError(null);
  };

  const handleCustomerChange = (val: string) => {
    setCustomer(val);
    if (customerError) setCustomerError(null);
    if (mutation.isError) mutation.reset();
    if (generalError) setGeneralError(null);
  };

  const handleItemChange = (
    key: string,
    field: 'sku' | 'qty',
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: value } : item)),
    );

    // Hapus error lokal maupun server pada baris yang sedang diedit
    setRowErrors((prev) => {
      const row = prev[key];
      if (!row) return prev;
      return {
        ...prev,
        [key]: {
          ...row,
          [field]: undefined,
          server: undefined, // Bersihkan highlight server error begitu user mulai memperbaiki
        },
      };
    });

    if (mutation.isError) mutation.reset();
    if (generalError) setGeneralError(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const validation = validateOrderForm(customer, items);
    setCustomerError(validation.customerError);
    setItemsError(validation.itemsError);
    setRowErrors(validation.rowErrors);

    if (!validation.isValid) {
      return;
    }

    setGeneralError(null);
    mutation.mutate();
  };

  if (createdOrder) {
    return <OrderDetail orderId={createdOrder.id} onClose={onClose} />;
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
      onClick={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Buat Pesanan Baru
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Kuantitas stok akan dikurangi secara atomik dalam transaksi aman.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition-colors text-sm cursor-pointer disabled:opacity-50"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Input Customer */}
            <div>
              <label
                htmlFor="order-customer"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Nama Pelanggan <span className="text-rose-500">*</span>
              </label>
              <input
                id="order-customer"
                type="text"
                disabled={mutation.isPending}
                value={customer}
                onChange={(e) => handleCustomerChange(e.target.value)}
                placeholder="Contoh: PT Sumber Rejeki / Bpk. Budi"
                className={`w-full px-3.5 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 transition-colors disabled:bg-slate-100 ${
                  customerError
                    ? 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500'
                    : 'border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500'
                }`}
                autoFocus
              />
              {customerError && (
                <p className="text-xs text-rose-600 mt-1 font-medium">
                  {customerError}
                </p>
              )}
            </div>

            {/* Section Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Daftar Barang (Item) <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={mutation.isPending}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>+</span> Tambah Baris
                </button>
              </div>

              {itemsError && (
                <p className="text-xs text-rose-600 mb-2 font-medium">
                  {itemsError}
                </p>
              )}

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {items.map((item, index) => {
                  const err = rowErrors[item.key];
                  const hasServerError = Boolean(err?.server);

                  return (
                    <div
                      key={item.key}
                      className={`p-3 rounded-lg border space-y-1.5 transition-colors ${
                        hasServerError
                          ? 'bg-rose-50/70 border-rose-300 ring-1 ring-rose-300'
                          : 'bg-slate-50/70 border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-400 w-5">
                          #{index + 1}
                        </span>

                        {/* SKU Input */}
                        <div className="flex-1">
                          <input
                            type="text"
                            disabled={mutation.isPending}
                            value={item.sku}
                            onChange={(e) =>
                              handleItemChange(
                                item.key,
                                'sku',
                                e.target.value.toUpperCase(),
                              )
                            }
                            placeholder="SKU (e.g. ATK-001)"
                            className={`w-full px-3 py-1.5 text-xs font-mono uppercase bg-white border rounded-md focus:outline-none focus:ring-2 transition-colors disabled:bg-slate-100 ${
                              err?.sku || hasServerError
                                ? 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500'
                                : 'border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500'
                            }`}
                          />
                        </div>

                        {/* Qty Input */}
                        <div className="w-24">
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={mutation.isPending}
                            value={item.qty}
                            onChange={(e) =>
                              handleItemChange(item.key, 'qty', e.target.value)
                            }
                            placeholder="Qty"
                            className={`w-full px-3 py-1.5 text-xs bg-white border rounded-md focus:outline-none focus:ring-2 transition-colors text-center disabled:bg-slate-100 ${
                              err?.qty
                                ? 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500'
                                : 'border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500'
                            }`}
                          />
                        </div>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.key)}
                          disabled={items.length <= 1 || mutation.isPending}
                          className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed p-1.5 rounded transition-colors cursor-pointer"
                          title="Hapus baris"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Error Pesan Server (409 Insufficient Stock / 400 Validation) */}
                      {hasServerError && (
                        <div className="pl-7 text-xs text-rose-700 font-semibold flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>{err?.server}</span>
                        </div>
                      )}

                      {/* Error Validasi Lokal Form */}
                      {(err?.sku || err?.qty) && !hasServerError && (
                        <div className="pl-7 text-xs text-rose-600 font-medium space-x-2">
                          {err.sku && <span>{err.sku}</span>}
                          {err.sku && err.qty && <span>•</span>}
                          {err.qty && <span>{err.qty}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* General Banner Error Message */}
            {generalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
                <span className="font-bold text-sm leading-none mt-0.5">⚠️</span>
                <div className="flex-1 font-medium">{generalError}</div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={mutation.isPending}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
              >
                {mutation.isPending ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-1 h-4 w-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                      />
                    </svg>
                    Memproses Order...
                  </>
                ) : (
                  'Buat Pesanan'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
}
