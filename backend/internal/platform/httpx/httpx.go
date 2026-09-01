package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/google/uuid"
)

type Problem struct {
	Type     string    `json:"type"`
	Title    string    `json:"title"`
	Status   int       `json:"status"`
	Code     string    `json:"code"`
	Detail   string    `json:"detail"`
	TraceID  uuid.UUID `json:"trace_id"`
	Instance string    `json:"instance,omitempty"`
}

func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func WriteProblem(w http.ResponseWriter, status int, code, title, detail string, traceID uuid.UUID) {
	WriteJSON(w, status, Problem{
		Type:    "https://errors.fiscal-messaging.local/" + code,
		Title:   title,
		Status:  status,
		Code:    code,
		Detail:  detail,
		TraceID: traceID,
	})
}

func DecodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, DefaultMaxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("request body must contain a single JSON value")
		}
		return err
	}
	return nil
}
