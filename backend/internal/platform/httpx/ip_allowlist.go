package httpx

import (
	"net"
	"net/http"
	"strings"
)

// DefaultInternalCIDRs covers loopback, RFC 1918 private IPv4, and RFC 4193
// unique-local IPv6 (fc00::/7). Railway private networking is IPv6-only
// (fd12:… addresses), so omitting unique-local would 403 every worker
// calling internal_api over *.railway.internal.
var DefaultInternalCIDRs = []string{
	"127.0.0.0/8",
	"::1/128",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"fc00::/7",
}

// IPAllowlist rejects any request whose remote address doesn't fall inside
// one of cidrs — a code-level backstop for internal-only services (see
// InternalAPI's doc comment) so a missing or misconfigured firewall rule
// doesn't silently expose them. Not a substitute for real network
// isolation: a client that shares the same private network as an attacker
// still passes this check, and TLS/mTLS is a separate concern entirely
// (see InternalAPI's doc comment) — this only narrows *where* a request
// can come from, not who it's from or whether it's encrypted in transit.
func IPAllowlist(cidrs []string) func(http.Handler) http.Handler {
	nets := parseCIDRs(cidrs)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			if ip == nil || !ipAllowed(ip, nets) {
				WriteProblem(w, http.StatusForbidden, "forbidden_source", "Forbidden", "Source address not allowed", TraceIDFrom(r.Context()))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func parseCIDRs(cidrs []string) []*net.IPNet {
	nets := make([]*net.IPNet, 0, len(cidrs))
	for _, c := range cidrs {
		_, n, err := net.ParseCIDR(strings.TrimSpace(c))
		if err != nil {
			// An invalid entry must not crash the process — better to log
			// and skip it than take the whole service down over a typo in
			// an env var, especially for a security control whose failure
			// mode should be "still protected by the defaults", not "won't
			// start at all".
			continue
		}
		nets = append(nets, n)
	}
	return nets
}

func clientIP(r *http.Request) net.IP {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return net.ParseIP(host)
}

func ipAllowed(ip net.IP, nets []*net.IPNet) bool {
	for _, n := range nets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}
