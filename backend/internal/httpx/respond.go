package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
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
// extra is copied first, then code and message are set to ensure they cannot be overwritten.
func WriteError(w http.ResponseWriter, status int, code, message string, extra map[string]any) error {
	errObj := make(map[string]any, len(extra)+2)
	for k, v := range extra {
		errObj[k] = v
	}
	errObj["code"] = code
	errObj["message"] = message
	return WriteJSON(w, status, map[string]any{"error": errObj})
}

// DecodeJSON decodes the request body into dst, rejecting unknown fields.
// It maps EOF to "request body is required" and JSON parsing/type errors to friendly messages
// without leaking internal Go struct names.
func DecodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		if errors.Is(err, io.EOF) {
			return errors.New("request body is required")
		}
		if strings.HasPrefix(err.Error(), "json: unknown field") {
			return err
		}
		log.Printf("json decode error: %v", err)
		return errors.New("invalid JSON body or field types")
	}
	return nil
}
