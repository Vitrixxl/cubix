package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
)

type ApiError struct {
	Status  int
	Message string
}

func (e *ApiError) Error() string { return e.Message }

func apiErr(status int, message string) *ApiError {
	return &ApiError{Status: status, Message: message}
}

func internal(err any) *ApiError {
	fmt.Fprintf(os.Stderr, "API error: %v\n", err)
	return apiErr(500, "Internal server error")
}

func validation() *ApiError {
	return apiErr(422, "Invalid request")
}

// toApiError is Rust's `From<rusqlite::Error>`: any other error is an internal one.
func toApiError(err error) *ApiError {
	var e *ApiError
	if errors.As(err, &e) {
		return e
	}
	return internal(err)
}

// writeJSON answers `Json(value)` with a status.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(encodeJSON(v)))
}

// writeError is ApiError::into_response.
func writeError(w http.ResponseWriter, err error) {
	e := toApiError(err)
	status := e.Status
	if status < 100 || status > 999 {
		status = 500
	}
	writeJSON(w, status, M{"error": e.Message})
}

// writeResult writes a handler's `Result<Value>`.
func writeResult(w http.ResponseWriter, v any, err error) {
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, 200, v)
}
