package httpx

import (
	"encoding/json"
	"net/http"
)

const (
	CodeValidation        = "VALIDATION_ERROR"
	CodeNotFound          = "NOT_FOUND"
	CodeInsufficientStock = "INSUFFICIENT_STOCK"
	CodeProductHasHistory = "PRODUCT_HAS_HISTORY"
	CodeAlreadyCancelled  = "ALREADY_CANCELLED"
	CodeSKUTaken          = "SKU_TAKEN"
	CodeInternal          = "INTERNAL"
)

// WriteJSON writes data as a JSON response.
// The Content-Type header must be set before WriteHeader, otherwise it is ignored.
func WriteJSON(w http.ResponseWriter, status int, data any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(data)
}

// WriteError writes an error envelope: {"error": {"code": ..., "message": ..., ...extra}}
// Extra fields (e.g. sku, available, details) sit alongside code and message.
func WriteError(w http.ResponseWriter, status int, code, message string, extra map[string]any) error {
	errObj := map[string]any{
		"code":    code,
		"message": message,
	}
	for k, v := range extra {
		errObj[k] = v
	}
	return WriteJSON(w, status, map[string]any{"error": errObj})
}

// DecodeJSON decodes the request body into dst and rejects unknown fields.
func DecodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}
