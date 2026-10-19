package main

import (
	"compress/gzip"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"sync"
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

// toApiError: an *ApiError stays itself; any other error is an internal one.
func toApiError(err error) *ApiError {
	var e *ApiError
	if errors.As(err, &e) {
		return e
	}
	return internal(err)
}

// writeJSON answers `Json(value)` with a status.
func writeJSON(w http.ResponseWriter, status int, v any) {
	writeJSONBytes(w, status, jsonBytes(v))
}

func writeJSONBytes(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// gzipWriters: a gzip writer holds a few hundred kilobytes of state; the answers share them.
var gzipWriters = sync.Pool{New: func() any {
	w, _ := gzip.NewWriterLevel(nil, gzip.BestSpeed)
	return w
}}

// writeError is ApiError::into_response.
func writeError(w http.ResponseWriter, err error) {
	e := toApiError(err)
	status := e.Status
	if status < 100 || status > 999 {
		status = 500
	}
	writeJSON(w, status, M{"error": e.Message})
}

// writeResult writes a handler's `Result<Value>`: gzipped, past a kilobyte, for a client that takes gzip.
func writeResult(w http.ResponseWriter, r *http.Request, v any, err error) {
	if err != nil {
		writeError(w, err)
		return
	}
	body := jsonBytes(v)
	h := w.Header()
	h.Add("Vary", "accept-encoding")
	if len(body) <= 1024 || !webAccepts(r, "gzip") {
		writeJSONBytes(w, 200, body)
		return
	}
	h.Set("Content-Type", "application/json")
	h.Set("Content-Encoding", "gzip")
	w.WriteHeader(200)
	zw := gzipWriters.Get().(*gzip.Writer)
	zw.Reset(w)
	_, _ = zw.Write(body)
	_ = zw.Close()
	gzipWriters.Put(zw)
}
