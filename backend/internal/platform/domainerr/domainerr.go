package domainerr

import "fmt"

type Error struct {
	Code      string
	Title     string
	Detail    string
	Status    int
	Retryable bool
}

func (e *Error) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Detail)
}

func New(status int, code, title, detail string) *Error {
	return &Error{Status: status, Code: code, Title: title, Detail: detail}
}

func Conflict(code, detail string) *Error {
	return New(409, code, "Conflict", detail)
}

func NotFound(code, detail string) *Error {
	return New(404, code, "Not Found", detail)
}

func Validation(code, detail string) *Error {
	return New(422, code, "Unprocessable Entity", detail)
}

func Unauthorized(detail string) *Error {
	return New(401, "unauthorized", "Unauthorized", detail)
}

func Forbidden(detail string) *Error {
	return New(403, "forbidden", "Forbidden", detail)
}

func TooManyRequests(detail string) *Error {
	return New(429, "too_many_requests", "Too Many Requests", detail)
}
