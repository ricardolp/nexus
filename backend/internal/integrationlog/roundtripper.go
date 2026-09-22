package integrationlog

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// RoundTripper logs outbound HTTP via an optional Recorder.
type RoundTripper struct {
	Base        http.RoundTripper
	Recorder    *Recorder
	OrgID       uuid.UUID
	Origin      string
	Destination string
	SpanName    string
}

func (t *RoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	base := t.Base
	if base == nil {
		base = http.DefaultTransport
	}
	if t.Recorder == nil {
		return base.RoundTrip(req)
	}

	start := time.Now().UTC()
	var reqBody []byte
	if req.Body != nil {
		buf, err := io.ReadAll(io.LimitReader(req.Body, DefaultBodyPreviewLimit*4))
		_ = req.Body.Close()
		if err == nil {
			reqBody = buf
			req.Body = io.NopCloser(bytes.NewReader(buf))
			if req.GetBody == nil {
				bodyCopy := buf
				req.GetBody = func() (io.ReadCloser, error) {
					return io.NopCloser(bytes.NewReader(bodyCopy)), nil
				}
			}
		}
	}

	resp, err := base.RoundTrip(req)
	finished := time.Now().UTC()
	duration := int(finished.Sub(start).Milliseconds())

	origin := t.Origin
	if origin == "" {
		origin = "nexus"
	}
	dest := t.Destination
	if dest == "" {
		dest = "http"
	}
	span := t.SpanName
	if span == "" {
		span = "outbound.http"
	}

	status := 0
	var respBody []byte
	var respHeaders http.Header
	if resp != nil {
		status = resp.StatusCode
		respHeaders = resp.Header.Clone()
		if resp.Body != nil {
			buf, readErr := io.ReadAll(io.LimitReader(resp.Body, DefaultBodyPreviewLimit*4))
			_ = resp.Body.Close()
			if readErr == nil {
				respBody = buf
				resp.Body = io.NopCloser(bytes.NewReader(buf))
			} else {
				resp.Body = io.NopCloser(bytes.NewReader(nil))
			}
		}
	}

	path := req.URL.Path
	if req.URL != nil {
		path = SanitizeURL(req.URL.String())
	}
	summary := req.Method + " " + path
	if err != nil {
		summary = req.Method + " " + path + ": " + err.Error()
	}

	var org *uuid.UUID
	if t.OrgID != uuid.Nil {
		id := t.OrgID
		org = &id
	}
	var statusPtr *int
	if status > 0 || err == nil {
		s := status
		statusPtr = &s
	}
	level := LevelFromStatus(status)
	if err != nil {
		level = LevelError
	}

	entry := Entry{
		OrganizationID:      org,
		SpanName:            span,
		Direction:           DirectionOutbound,
		Origin:              origin,
		Destination:         dest,
		Level:               level,
		Summary:             TruncateBody([]byte(summary), 512),
		HTTPMethod:          req.Method,
		HTTPPath:            path,
		HTTPStatus:          statusPtr,
		DurationMs:          &duration,
		RequestHash:         HashBody(reqBody),
		RequestHeaders:      HeadersJSON(req.Header),
		ResponseHeaders:     HeadersJSON(respHeaders),
		RequestBodyPreview:  TruncateBody(reqBody, DefaultBodyPreviewLimit),
		ResponseBodyPreview: TruncateBody(respBody, DefaultBodyPreviewLimit),
		StartedAt:           start,
		FinishedAt:          &finished,
	}
	go t.Recorder.Record(context.Background(), entry)
	return resp, err
}
