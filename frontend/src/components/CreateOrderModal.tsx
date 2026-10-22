import { useEffect, useState, type FormEvent } from 'react';
import { validateQty } from '../lib/validation';

export interface OrderItemRow {
  key: string;
  sku: string;
  qty: string;
}

interface CreateOrderModalProps {
  onClose: () => void;
  onSubmitSuccess?: () => void;
}

export function CreateOrderModal({ onClose }: CreateOrderModalProps) {
  const [customer, setCustomer] = useState('');
  const [items, setItems] = useState<OrderItemRow[]>([
    { key: crypto.randomUUID(), sku: '', qty: '1' },
  ]);

  const [customerError, setCustomerError] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, { sku?: string; qty?: string }>>({});

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { key: crypto.randomUUID(), sku: '', qty: '1' },
    ]);
  };

  const handleRemoveItem = (key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
    setRowErrors((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleItemChange = (
    key: string,
    field: 'sku' | 'qty',
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: value } : item)),
    );

    // Clear error on the edited row/field
    setRowErrors((prev) => {
      const row = prev[key];
      if (!row || !row[field]) return prev;
      return {
        ...prev,
        [key]: {
          ...row,
          [field]: undefined,
        },
      };
    });
  };

  const validateForm = (): boolean => {
    let isValid = true;

    // 1. Validasi Customer
    if (!customer.trim()) {
      setCustomerError('Nama pelanggan wajib diisi');
      isValid = false;
    } else {
      setCustomerError(null);
    }

    // 2. Validasi Minimal Satu Item
    if (items.length === 0) {
      setItemsError('Minimal harus ada 1 item pesanan');
      return false;
    }
    setItemsError(null);

    // 3. Validasi Setiap Baris Item
    const newRowErrors: Record<string, { sku?: string; qty?: string }> = {};
    const seenSKUs = new Set<string>();

    for (const item of items) {
      const normalizedSKU = item.sku.trim().toUpperCase();
      const skuErr = !normalizedSKU
        ? 'SKU wajib diisi'
        : seenSKUs.has(normalizedSKU)
        ? `SKU '${normalizedSKU}' duplikat`
        : undefined;

      if (normalizedSKU) {
        seenSKUs.add(normalizedSKU);
      }

      const qtyErr = validateQty(item.qty);

      if (skuErr || qtyErr) {
        newRowErrors[item.key] = {
          sku: skuErr,
          qty: qtyErr ?? undefined,
        };
        isValid = false;
      }
    }

    setRowErrors(newRowErrors);
    return isValid;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Kerangka kerja lokal berhasil divalidasi
    console.log('Valid Order Request:', {
      customer: customer.trim(),
      items: items.map((it) => ({
        sku: it.sku.trim().toUpperCase(),
        qty: parseInt(it.qty.trim(), 10),
      })),
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
      onClick={onClose}
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
              Kuantitas stok akan dikurangi secara otomatis dalam transaksi aman.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition-colors text-sm cursor-pointer"
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
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value);
                if (customerError) setCustomerError(null);
              }}
              placeholder="Contoh: PT Sumber Rejeki / Bpk. Budi"
              className={`w-full px-3.5 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
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
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer transition-colors"
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

                return (
                  <div
                    key={item.key}
                    className="p-3 bg-slate-50/70 rounded-lg border border-slate-200/80 space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-400 w-5">
                        #{index + 1}
                      </span>

                      {/* SKU Input */}
                      <div className="flex-1">
                        <input
                          type="text"
                          value={item.sku}
                          onChange={(e) =>
                            handleItemChange(
                              item.key,
                              'sku',
                              e.target.value.toUpperCase(),
                            )
                          }
                          placeholder="SKU (e.g. ATK-001)"
                          className={`w-full px-3 py-1.5 text-xs font-mono uppercase bg-white border rounded-md focus:outline-none focus:ring-2 transition-colors ${
                            err?.sku
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
                          value={item.qty}
                          onChange={(e) =>
                            handleItemChange(item.key, 'qty', e.target.value)
                          }
                          placeholder="Qty"
                          className={`w-full px-3 py-1.5 text-xs bg-white border rounded-md focus:outline-none focus:ring-2 transition-colors text-center ${
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
                        disabled={items.length <= 1}
                        className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed p-1.5 rounded transition-colors cursor-pointer"
                        title="Hapus baris"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Inline error feedback for row */}
                    {(err?.sku || err?.qty) && (
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

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              Buat Pesanan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
