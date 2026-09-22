package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Config for an OpenAI-compatible chat completions API.
type Config struct {
	APIKey  string
	BaseURL string // e.g. https://api.openai.com — /v1/chat/completions is appended
	Model   string
	Timeout time.Duration
}

// Client talks to OpenAI-compatible chat completions endpoints.
type Client struct {
	apiKey     string
	baseURL    string
	model      string
	httpClient *http.Client
}

// New returns a client, or nil when APIKey is empty (feature disabled).
func New(cfg Config) *Client {
	key := strings.TrimSpace(cfg.APIKey)
	if key == "" {
		return nil
	}
	base := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if base == "" {
		base = "https://api.openai.com"
	}
	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = "gpt-4.1-mini"
	}
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 12 * time.Second
	}
	return &Client{
		apiKey:  key,
		baseURL: base,
		model:   model,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) Enabled() bool {
	return c != nil && c.apiKey != ""
}

func (c *Client) Model() string {
	if c == nil {
		return ""
	}
	return c.model
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Messages    []Message
	Temperature float64
	JSONMode    bool
}

type chatAPIRequest struct {
	Model          string              `json:"model"`
	Messages       []Message           `json:"messages"`
	Temperature    float64             `json:"temperature"`
	ResponseFormat *chatResponseFormat `json:"response_format,omitempty"`
}

type chatResponseFormat struct {
	Type string `json:"type"`
}

type chatAPIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// ChatJSON sends a chat completion request and returns the assistant content.
func (c *Client) ChatJSON(ctx context.Context, req ChatRequest) (string, error) {
	if !c.Enabled() {
		return "", fmt.Errorf("llm: client not configured")
	}
	temp := req.Temperature
	if temp == 0 {
		temp = 0.2
	}
	body := chatAPIRequest{
		Model:       c.model,
		Messages:    req.Messages,
		Temperature: temp,
	}
	if req.JSONMode {
		body.ResponseFormat = &chatResponseFormat{Type: "json_object"}
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	endpoint := c.baseURL + "/v1/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("User-Agent", "nexus-control-plane/1.0")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("llm chat: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("llm chat: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	var parsed chatAPIResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", fmt.Errorf("llm chat: decode: %w", err)
	}
	if parsed.Error != nil && parsed.Error.Message != "" {
		return "", fmt.Errorf("llm chat: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("llm chat: empty response")
	}
	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
}
