import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adjustStock, ApiError } from '../api/client';
import type { MovementType, Product } from '../api/types';
import { validateQty } from '../lib/validation';

interface AdjustStockModalProps {
  product: Product;
  onClose: () => void;
}

export function AdjustStockModal({ product, onClose }: AdjustStockModalProps) {
  const queryClient = useQueryClient();

  const [type, setType] = useState<MovementType>('in');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      return adjustStock(product.id, {
        type,
        qty: parseInt(qty.trim(), 10),
        note: note.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'INSUFFICIENT_STOCK') {
        queryClient.invalidateQueries({ queryKey: ['products'] });
      }
    },
  });

  // Menutup modal dengan tombol Esc hanya jika request tidak sedang berjalan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mutation.isPending) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, mutation.isPending]);

  const handleTypeChange = (newType: MovementType) => {
    setType(newType);
    if (mutation.isError) {
      mutation.reset();
    }
  };

  const handleQtyChange = (val: string) => {
    setQty(val);
    if (validationError) {
      setValidationError(null);
    }
    if (mutation.isError) {
      mutation.reset();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const err = validateQty(qty);
    if (err) {
      setValidationError(err);
      return;
    }

    setValidationError(null);
    mutation.mutate();
  };

  // API error message formatting
  let apiErrorMessage: string | null = null;
  if (mutation.error) {
    if (mutation.error instanceof ApiError) {
      if (mutation.error.code === 'INSUFFICIENT_STOCK') {
        const available = mutation.error.available ?? 0;
        apiErrorMessage = `Insufficient stock for this deduction (available: ${available}).`;
      } else {
        const details = mutation.error.details?.length
          ? `: ${mutation.error.details.join(', ')}`
          : '';
        apiErrorMessage = `${mutation.error.message}${details}`;
      }
    } else if (mutation.error instanceof Error) {
      apiErrorMessage = mutation.error.message;
    } else {
      apiErrorMessage = 'An unexpected error occurred while adjusting stock.';
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
      onClick={() => {
        if (!mutation.isPending) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Adjust Product Stock
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {product.sku} — {product.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition-colors text-sm cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Current Stock Info */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 flex items-center justify-between text-sm">
            <span className="text-slate-600">Current Stock:</span>
            <span className="font-bold text-slate-900">
              {product.stock} units
            </span>
          </div>

          {/* Adjustment Type: In / Out */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Adjustment Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleTypeChange('in')}
                className={`py-2 px-3 text-sm font-medium rounded-lg border flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  type === 'in'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                Stock In (Add)
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('out')}
                className={`py-2 px-3 text-sm font-medium rounded-lg border flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  type === 'out'
                    ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                Stock Out (Deduct)
              </button>
            </div>
          </div>

          {/* Qty Input */}
          <div>
            <label
              htmlFor="adjust-qty"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Quantity (Qty) <span className="text-rose-500">*</span>
            </label>
            <input
              id="adjust-qty"
              type="text"
              inputMode="numeric"
              value={qty}
              onChange={(e) => handleQtyChange(e.target.value)}
              placeholder="e.g. 5"
              className={`w-full px-3.5 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                validationError
                  ? 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500'
                  : 'border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500'
              }`}
              autoFocus
            />
            {validationError && (
              <p className="text-xs text-rose-600 mt-1.5 font-medium">
                {validationError}
              </p>
            )}
          </div>

          {/* Notes Input (Optional) */}
          <div>
            <label
              htmlFor="adjust-note"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Notes <span className="text-slate-400 text-xs font-normal">(optional)</span>
            </label>
            <textarea
              id="adjust-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Supplier restock / internal usage"
              rows={2}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors resize-none"
            />
          </div>

          {/* Backend Error Message Box */}
          {apiErrorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1 font-medium">{apiErrorMessage}</div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
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
                  Saving...
                </>
              ) : (
                'Save Adjustment'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
