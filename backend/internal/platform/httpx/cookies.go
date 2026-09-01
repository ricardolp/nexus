package httpx

import (
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	AccessCookieName       = "nexus_at"
	RefreshCookieName      = "nexus_rt"
	MFAChallengeCookieName = "nexus_mfa"
	DeviceCookieName       = "nexus_did"
)

func cookieSecure(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(forwardedProto(r), "https")
}

func forwardedProto(r *http.Request) string {
	if v := r.Header.Get("X-Forwarded-Proto"); v != "" {
		return strings.TrimSpace(strings.Split(v, ",")[0])
	}
	if v := r.Header.Get("Forwarded"); v != "" {
		for _, part := range strings.Split(v, ";") {
			part = strings.TrimSpace(part)
			if strings.HasPrefix(strings.ToLower(part), "proto=") {
				return strings.Trim(strings.TrimSpace(part[6:]), `"`)
			}
		}
	}
	return ""
}

func requestHostname(r *http.Request) string {
	host := r.Host
	if host == "" && r.URL != nil {
		host = r.URL.Host
	}
	if h, _, err := net.SplitHostPort(host); err == nil {
		return h
	}
	return host
}

// cookieCrossSite is true when the SPA origin host differs from the API host.
// Different ports on the same host (Vite :5173 → API :4000) are same-site.
func cookieCrossSite(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil || u.Hostname() == "" {
		return false
	}
	return !strings.EqualFold(u.Hostname(), requestHostname(r))
}

func cookieAttrs(r *http.Request) (secure bool, sameSite http.SameSite, partitioned bool) {
	secure = cookieSecure(r)
	sameSite = http.SameSiteLaxMode
	if secure && cookieCrossSite(r) {
		sameSite = http.SameSiteNoneMode
		partitioned = true
	}
	return secure, sameSite, partitioned
}

func setCookie(w http.ResponseWriter, r *http.Request, name, value string, ttl time.Duration) {
	maxAge := 0
	expires := time.Time{}
	if ttl < 0 {
		maxAge = -1
		expires = time.Unix(0, 0)
		value = ""
	} else if ttl > 0 {
		maxAge = int(ttl.Seconds())
		if maxAge < 1 {
			maxAge = 1
		}
		expires = time.Now().UTC().Add(ttl)
	}
	secure, sameSite, partitioned := cookieAttrs(r)
	http.SetCookie(w, &http.Cookie{
		Name:        name,
		Value:       value,
		Path:        "/",
		MaxAge:      maxAge,
		Expires:     expires,
		HttpOnly:    true,
		Secure:      secure,
		SameSite:    sameSite,
		Partitioned: partitioned,
	})
}

func clearCookie(w http.ResponseWriter, r *http.Request, name string) {
	secure, sameSite, partitioned := cookieAttrs(r)
	http.SetCookie(w, &http.Cookie{
		Name:        name,
		Value:       "",
		Path:        "/",
		MaxAge:      -1,
		Expires:     time.Unix(0, 0),
		HttpOnly:    true,
		Secure:      secure,
		SameSite:    sameSite,
		Partitioned: partitioned,
	})
}

func SetAccessCookie(w http.ResponseWriter, r *http.Request, token string, ttl time.Duration) {
	setCookie(w, r, AccessCookieName, token, ttl)
}

func SetRefreshCookie(w http.ResponseWriter, r *http.Request, token string, ttl time.Duration) {
	setCookie(w, r, RefreshCookieName, token, ttl)
}

func SetMFAChallengeCookie(w http.ResponseWriter, r *http.Request, token string, ttl time.Duration) {
	setCookie(w, r, MFAChallengeCookieName, token, ttl)
}

func SetDeviceCookie(w http.ResponseWriter, r *http.Request, token string, ttl time.Duration) {
	setCookie(w, r, DeviceCookieName, token, ttl)
}

func ClearSessionCookies(w http.ResponseWriter, r *http.Request) {
	clearCookie(w, r, AccessCookieName)
	clearCookie(w, r, RefreshCookieName)
	clearCookie(w, r, MFAChallengeCookieName)
}

func CookieValue(r *http.Request, name string) string {
	c, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(c.Value)
}
