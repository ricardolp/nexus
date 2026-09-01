package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCookieSecureUsesFirstForwardedProto(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest(http.MethodPost, "http://api.example.test/v1/auth/login", nil)
	r.Header.Set("X-Forwarded-Proto", "https, http")
	if !cookieSecure(r) {
		t.Fatal("expected https from X-Forwarded-Proto")
	}
}

func TestCookieCrossSiteIgnoresPort(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest(http.MethodPost, "http://localhost:4000/v1/auth/login", nil)
	r.Header.Set("Origin", "http://localhost:5173")
	if cookieCrossSite(r) {
		t.Fatal("localhost Vite → API must be same-site")
	}
}

func TestCookieCrossSiteDifferentHosts(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest(http.MethodPost, "https://api.example.test/v1/auth/login", nil)
	r.Header.Set("Origin", "https://app.example.test")
	if !cookieCrossSite(r) {
		t.Fatal("different hosts must be cross-site")
	}
}

func TestClearSessionCookiesKeepsDeviceCookie(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest(http.MethodPost, "http://localhost:4000/v1/auth/logout", nil)
	r.Header.Set("Origin", "http://localhost:5173")
	w := httptest.NewRecorder()
	SetDeviceCookie(w, r, "device-token", 24*time.Hour)
	ClearSessionCookies(w, r)

	var names []string
	for _, c := range w.Result().Cookies() {
		names = append(names, c.Name)
		if c.Name == DeviceCookieName && c.MaxAge < 0 {
			t.Fatal("logout must not delete the trusted-device cookie")
		}
	}
	for _, want := range []string{AccessCookieName, RefreshCookieName, MFAChallengeCookieName} {
		found := false
		for _, name := range names {
			if name == want {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing cleared cookie %s", want)
		}
	}
}

func TestDeviceCookiePartitionedOnCrossSiteHTTPS(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest(http.MethodPost, "https://api.example.test/v1/auth/mfa/verify", nil)
	r.Header.Set("Origin", "https://app.example.test")
	r.Header.Set("X-Forwarded-Proto", "https")
	w := httptest.NewRecorder()
	SetDeviceCookie(w, r, "device-token", TrustedDeviceTTLForTest())
	c := w.Result().Cookies()[0]
	if c.SameSite != http.SameSiteNoneMode {
		t.Fatalf("SameSite=%v want None", c.SameSite)
	}
	if !c.Secure {
		t.Fatal("Secure required for cross-site cookie")
	}
	if !c.Partitioned {
		t.Fatal("Partitioned required so Chrome keeps the cookie on a cross-site SPA")
	}
}

func TestDeviceCookieSameSiteLaxOnLocalhost(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest(http.MethodPost, "http://localhost:4000/v1/auth/mfa/verify", nil)
	r.Header.Set("Origin", "http://localhost:5173")
	w := httptest.NewRecorder()
	SetDeviceCookie(w, r, "device-token", TrustedDeviceTTLForTest())
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("got %d cookies", len(cookies))
	}
	c := cookies[0]
	if c.SameSite != http.SameSiteLaxMode {
		t.Fatalf("SameSite=%v want Lax", c.SameSite)
	}
	if c.Partitioned {
		t.Fatal("Partitioned must stay off for same-site localhost")
	}
}

func TrustedDeviceTTLForTest() time.Duration {
	return 30 * 24 * time.Hour
}
