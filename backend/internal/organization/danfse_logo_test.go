package organization

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/png"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

func TestValidateDanfseLogo(t *testing.T) {
	t.Parallel()

	pngBytes := tinyPNG(t, 80, 24)

	ct, err := validateDanfseLogo(pngBytes)
	if err != nil {
		t.Fatal(err)
	}
	if ct != "image/png" {
		t.Fatalf("content type %q", ct)
	}

	if _, err := validateDanfseLogo(nil); err == nil {
		t.Fatal("expected empty logo to fail")
	}
	if _, err := validateDanfseLogo([]byte("not-an-image")); err == nil {
		t.Fatal("expected non-image to fail")
	}
	huge := append([]byte{}, pngBytes...)
	huge = append(huge, bytes.Repeat([]byte{0}, maxDanfseLogoBytes)...)
	if _, err := validateDanfseLogo(huge); err == nil {
		t.Fatal("expected oversized logo to fail")
	}
}

func TestResizeDanfseLogoFitsHeaderSlot(t *testing.T) {
	t.Parallel()

	maxW, maxH := danfseLogoPrintMaxPixels()
	if maxW != 472 || maxH != 137 {
		t.Fatalf("header slot at 300 DPI = %dx%d, want 472x137", maxW, maxH)
	}

	wide := tinyPNG(t, 1600, 400)
	fitted, err := resizeDanfseLogo(wide)
	if err != nil {
		t.Fatal(err)
	}
	if fitted.ContentType != "image/png" {
		t.Fatalf("print content type %q", fitted.ContentType)
	}
	if fitted.SrcW != 1600 || fitted.SrcH != 400 {
		t.Fatalf("source size %dx%d", fitted.SrcW, fitted.SrcH)
	}
	if fitted.DstW > maxW || fitted.DstH > maxH {
		t.Fatalf("print size %dx%d exceeds %dx%d", fitted.DstW, fitted.DstH, maxW, maxH)
	}
	if fitted.DstW != maxW {
		t.Fatalf("wide logo should use the full header width, got %d", fitted.DstW)
	}
	cfg, err := png.DecodeConfig(bytes.NewReader(fitted.Data))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Width != fitted.DstW || cfg.Height != fitted.DstH {
		t.Fatalf("encoded %dx%d, meta %dx%d", cfg.Width, cfg.Height, fitted.DstW, fitted.DstH)
	}

	small := tinyPNG(t, 80, 24)
	kept, err := resizeDanfseLogo(small)
	if err != nil {
		t.Fatal(err)
	}
	if kept.DstW != 80 || kept.DstH != 24 {
		t.Fatalf("small logo was resized to %dx%d", kept.DstW, kept.DstH)
	}
}

func TestResizeDanfeLogoFitsIssuerSlot(t *testing.T) {
	t.Parallel()

	maxW, maxH := danfeLogoSpec.printMaxPixels()
	if maxW != 378 || maxH != 260 {
		t.Fatalf("issuer slot at 300 DPI = %dx%d, want 378x260", maxW, maxH)
	}
	fitted, err := danfeLogoSpec.resize(tinyPNG(t, 1200, 1200))
	if err != nil {
		t.Fatal(err)
	}
	if fitted.DstW != maxH || fitted.DstH != maxH {
		t.Fatalf("square logo fitted to %dx%d, want %dx%d", fitted.DstW, fitted.DstH, maxH, maxH)
	}
	if _, err := danfeLogoSpec.validate([]byte("not-an-image")); domainCode(err) != "invalid_danfe_logo_type" {
		t.Fatalf("err = %v, want invalid_danfe_logo_type", err)
	}
}

func domainCode(err error) string {
	var de *domainerr.Error
	if errors.As(err, &de) {
		return de.Code
	}
	return ""
}

func tinyPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: 20, G: 80, B: 160, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}
