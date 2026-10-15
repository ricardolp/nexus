package organization

import (
	"bytes"
	"context"
	"image"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"math"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/danfe"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	xdraw "golang.org/x/image/draw"
)

const maxDanfseLogoBytes = 1 << 20

// The print copy is rasterized at 300 DPI so the PDF stays sharp without
// embedding the original file.
const logoPrintDPI = 300

// companyLogoSpec is one printable slot for the company logo. kind is the
// column prefix of its print copy (<kind>_logo_print).
type companyLogoSpec struct {
	kind        string
	maxWidthCm  float64
	maxHeightCm float64
}

var (
	// Header slot from platform/danfse drawHeaderLogo: 4.00 cm × 1.16 cm.
	danfseLogoSpec = companyLogoSpec{kind: "danfse", maxWidthCm: 4.00, maxHeightCm: 1.16}
	// Issuer box slot from platform/danfe.
	danfeLogoSpec = companyLogoSpec{kind: "danfe", maxWidthCm: danfe.LogoMaxWidthCm, maxHeightCm: danfe.LogoMaxHeightCm}
)

type danfseLogoPrint struct {
	Data        []byte
	ContentType string
	SrcW        int
	SrcH        int
	DstW        int
	DstH        int
}

func validateCompanyLogo(data []byte) (string, error) {
	if len(data) == 0 {
		return "", domainerr.Validation("empty_logo", "logo file is required")
	}
	if len(data) > maxDanfseLogoBytes {
		return "", domainerr.Validation("logo_too_large", "logo must be at most 1 MB")
	}
	ct := http.DetectContentType(data)
	if ct != "image/png" && ct != "image/jpeg" {
		return "", domainerr.Validation("invalid_logo_type", "logo must be PNG or JPEG")
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		return "", domainerr.Validation("invalid_logo", "logo image could not be read")
	}
	return ct, nil
}

func (spec companyLogoSpec) printMaxPixels() (int, int) {
	w := int(math.Round(spec.maxWidthCm / 2.54 * logoPrintDPI))
	h := int(math.Round(spec.maxHeightCm / 2.54 * logoPrintDPI))
	return w, h
}

func validateDanfseLogo(data []byte) (string, error) { return validateCompanyLogo(data) }

func danfseLogoPrintMaxPixels() (int, int) { return danfseLogoSpec.printMaxPixels() }

func resizeDanfseLogo(data []byte) (danfseLogoPrint, error) { return danfseLogoSpec.resize(data) }

// fitDanfseLogoSize scales src down so it fits inside the header box.
// Images already smaller than the box are not enlarged.
func fitDanfseLogoSize(srcW, srcH, maxW, maxH int) (int, int) {
	if srcW <= 0 || srcH <= 0 || maxW <= 0 || maxH <= 0 {
		return srcW, srcH
	}
	if srcW <= maxW && srcH <= maxH {
		return srcW, srcH
	}
	scale := math.Min(float64(maxW)/float64(srcW), float64(maxH)/float64(srcH))
	dstW := int(math.Round(float64(srcW) * scale))
	dstH := int(math.Round(float64(srcH) * scale))
	if dstW < 1 {
		dstW = 1
	}
	if dstH < 1 {
		dstH = 1
	}
	if dstW > maxW {
		dstW = maxW
	}
	if dstH > maxH {
		dstH = maxH
	}
	return dstW, dstH
}

func (spec companyLogoSpec) resize(data []byte) (danfseLogoPrint, error) {
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return danfseLogoPrint{}, domainerr.Validation("invalid_logo", "logo image could not be read")
	}
	bounds := src.Bounds()
	srcW, srcH := bounds.Dx(), bounds.Dy()
	maxW, maxH := spec.printMaxPixels()
	dstW, dstH := fitDanfseLogoSize(srcW, srcH, maxW, maxH)

	dst := image.NewNRGBA(image.Rect(0, 0, dstW, dstH))
	if dstW == srcW && dstH == srcH {
		draw.Draw(dst, dst.Bounds(), src, bounds.Min, draw.Src)
	} else {
		xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, bounds, xdraw.Over, nil)
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, dst); err != nil {
		return danfseLogoPrint{}, err
	}
	return danfseLogoPrint{
		Data:        buf.Bytes(),
		ContentType: "image/png",
		SrcW:        srcW,
		SrcH:        srcH,
		DstW:        dstW,
		DstH:        dstH,
	}, nil
}

// SetCompanyLogo stores the single company logo (danfse_logo keeps the
// original) and one print copy per slot: DANFSe header and DANFE issuer box.
// Each PDF draws it only when its own flag is on.
func (s *Service) SetCompanyLogo(ctx context.Context, organizationID, companyID, actorID uuid.UUID, data []byte) (*Company, error) {
	ct, err := validateCompanyLogo(data)
	if err != nil {
		return nil, err
	}
	danfsePrint, err := danfseLogoSpec.resize(data)
	if err != nil {
		return nil, err
	}
	danfePrint, err := danfeLogoSpec.resize(data)
	if err != nil {
		return nil, err
	}
	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_companies
			set danfse_logo = $3, danfse_logo_content_type = $4,
			    danfse_logo_print = $5, danfse_logo_print_content_type = $6,
			    danfe_logo_print = $7, danfe_logo_print_content_type = $8,
			    updated_at = now()
			where id = $1 and organization_id = $2
		`, companyID, organizationID, data, ct,
			danfsePrint.Data, danfsePrint.ContentType, danfePrint.Data, danfePrint.ContentType)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("company_not_found", "Company not found")
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &organizationID,
			ActorType:      "user",
			ActorID:        actorID.String(),
			Action:         "company.logo.upload",
			ResourceType:   "organization_companies",
			ResourceID:     companyID.String(),
			After: map[string]any{
				"content_type":        ct,
				"bytes":               len(data),
				"src_width":           danfsePrint.SrcW,
				"src_height":          danfsePrint.SrcH,
				"danfse_print_width":  danfsePrint.DstW,
				"danfse_print_height": danfsePrint.DstH,
				"danfe_print_width":   danfePrint.DstW,
				"danfe_print_height":  danfePrint.DstH,
			},
		})
	})
	if err != nil {
		return nil, err
	}
	return s.GetCompany(ctx, organizationID, companyID)
}

func (s *Service) DeleteCompanyLogo(ctx context.Context, organizationID, companyID, actorID uuid.UUID) (*Company, error) {
	err := s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_companies
			set danfse_logo = null, danfse_logo_content_type = null,
			    danfse_logo_print = null, danfse_logo_print_content_type = null,
			    danfe_logo_print = null, danfe_logo_print_content_type = null,
			    updated_at = now()
			where id = $1 and organization_id = $2
		`, companyID, organizationID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("company_not_found", "Company not found")
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &organizationID,
			ActorType:      "user",
			ActorID:        actorID.String(),
			Action:         "company.logo.delete",
			ResourceType:   "organization_companies",
			ResourceID:     companyID.String(),
			After:          map[string]any{"removed": true},
		})
	})
	if err != nil {
		return nil, err
	}
	return s.GetCompany(ctx, organizationID, companyID)
}

// GetCompanyLogo returns the original file as uploaded.
func (s *Service) GetCompanyLogo(ctx context.Context, organizationID, companyID uuid.UUID) ([]byte, string, error) {
	var data []byte
	var ct *string
	err := s.pool.QueryRow(ctx, `
		select danfse_logo, danfse_logo_content_type
		from organization_companies
		where id = $1 and organization_id = $2 and danfse_logo is not null
	`, companyID, organizationID).Scan(&data, &ct)
	if err != nil || len(data) == 0 {
		return nil, "", domainerr.NotFound("logo_not_found", "Company logo not found")
	}
	contentType := "image/png"
	if ct != nil && strings.TrimSpace(*ct) != "" {
		contentType = *ct
	}
	return data, contentType, nil
}
