package mailer

import (
	"bytes"
	"fmt"
	"html/template"
	"strings"
)

// Brand colors from frontend/src/index.css
const (
	BrandBlue    = "#5c71ff"
	BrandMagenta = "#f062c8"
	BrandViolet  = "#ae6adf"
	BrandInk     = "#05030a"
	BrandCanvas  = "#f4f2f8"
	BrandText    = "#18181b"
	BrandMuted   = "#71717a"
)

type LayoutInput struct {
	Preheader  string
	Title      string
	Greeting   string
	Paragraphs []string
	CTALabel   string
	CTAURL     string
	HelperText string
	Footer     string
	LogoURL    string
	AppURL     string
}

func LogoURL(publicAppURL string) string {
	base := strings.TrimRight(strings.TrimSpace(publicAppURL), "/")
	if base == "" {
		return ""
	}
	return base + "/brand/nexus-mark.png"
}

func RenderLayout(in LayoutInput) (string, error) {
	var buf bytes.Buffer
	if err := brandedLayout.Execute(&buf, struct {
		LayoutInput
		BrandBlue    string
		BrandMagenta string
		BrandViolet  string
		BrandInk     string
		BrandCanvas  string
		BrandText    string
		BrandMuted   string
		CTAURL       template.URL
		LogoURL      template.URL
		AppURL       template.URL
	}{
		LayoutInput:  in,
		BrandBlue:    BrandBlue,
		BrandMagenta: BrandMagenta,
		BrandViolet:  BrandViolet,
		BrandInk:     BrandInk,
		BrandCanvas:  BrandCanvas,
		BrandText:    BrandText,
		BrandMuted:   BrandMuted,
		CTAURL:       template.URL(in.CTAURL),
		LogoURL:      template.URL(in.LogoURL),
		AppURL:       template.URL(in.AppURL),
	}); err != nil {
		return "", fmt.Errorf("email layout: %w", err)
	}
	return buf.String(), nil
}

var brandedLayout = template.Must(template.New("branded").Parse(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>{{.Title}}</title>
</head>
<body style="margin:0;padding:0;background-color:{{.BrandCanvas}};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{{.Preheader}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{{.BrandCanvas}};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td style="height:6px;line-height:6px;font-size:0;background-color:{{.BrandViolet}};background-image:linear-gradient(90deg, {{.BrandBlue}}, {{.BrandMagenta}});">&nbsp;</td>
        </tr>
        <tr>
          <td style="background-color:{{.BrandInk}};padding:28px 40px 24px 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                {{if .LogoURL}}
                <td style="vertical-align:middle;padding-right:12px;">
                  <img src="{{.LogoURL}}" width="40" height="40" alt="Nexus" style="display:block;border:0;width:40px;height:40px;">
                </td>
                {{end}}
                <td style="vertical-align:middle;">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.03em;color:#ffffff;line-height:1;">Nexus</div>
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:{{.BrandMagenta}};padding-top:4px;">Mensageria fiscal</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;padding:36px 40px 32px 40px;">
            {{if .Greeting}}
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:{{.BrandText}};">{{.Greeting}}</p>
            {{end}}
            <h1 style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;font-weight:700;color:{{.BrandInk}};">{{.Title}}</h1>
            {{range .Paragraphs}}
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:{{$.BrandText}};">{{.}}</p>
            {{end}}
            {{if .CTAURL}}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px 0;">
              <tr>
                <td align="center" style="border-radius:10px;background-color:{{.BrandViolet}};background-image:linear-gradient(135deg, {{.BrandBlue}}, {{.BrandMagenta}});">
                  <a href="{{.CTAURL}}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">{{.CTALabel}}</a>
                </td>
              </tr>
            </table>
            {{end}}
            {{if .HelperText}}
            <p style="margin:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:{{.BrandMuted}};">{{.HelperText}}</p>
            {{if .CTAURL}}
            <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:{{.BrandMuted}};word-break:break-all;">
              <a href="{{.CTAURL}}" style="color:{{.BrandBlue}};">{{.CTAURL}}</a>
            </p>
            {{end}}
            {{end}}
          </td>
        </tr>
        <tr>
          <td style="background-color:{{.BrandInk}};padding:20px 40px;border-top:1px solid rgba(240,98,200,0.25);">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#a1a1aa;">{{.Footer}}</p>
            {{if .AppURL}}
            <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;">
              <a href="{{.AppURL}}" style="color:{{.BrandBlue}};text-decoration:none;">Acessar o Nexus</a>
            </p>
            {{end}}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`))
