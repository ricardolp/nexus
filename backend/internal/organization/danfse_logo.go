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

// companyLogoSpec describes one printable company mark. kind is also the
// column prefix in organization_companies (<kind>_logo, <kind>_logo_print, …)
// and the prefix of error codes and audit actions.
type companyLogoSpec struct {
	kind        string
	label       string
	maxWidthCm  float64
	maxHeightCm float64
}

var (
	// Header slot from platform/danfse drawHeaderLogo: 4.00 cm × 1.16 cm.
	danfseLogoSpec = companyLogoSpec{kind: "danfse", label: "DANFSe", maxWidthCm: 4.00, maxHeightCm: 1.16}
	// Issuer box slot from platform/danfe.
	danfeLogoSpec = companyLogoSpec{kind: "danfe", label: "DANFE", maxWidthCm: danfe.LogoMaxWidthCm, maxHeightCm: danfe.LogoMaxHeightCm}
)

type danfseLogoPrint struct {
	Data        []byte
	ContentType string
	SrcW        int
	SrcH        int
	DstW        int
	DstH        int
}

func (spec companyLogoSpec) validate(data []byte) (string, error) {
	if len(data) == 0 {
		return "", domainerr.Validation("empty_"+spec.kind+"_logo", "logo file is required")
	}
	if len(data) > maxDanfseLogoBytes {
		return "", domainerr.Validation(spec.kind+"_logo_too_large", "logo must be at most 1 MB")
	}
	ct := http.DetectContentType(data)
	if ct != "image/png" && ct != "image/jpeg" {
		return "", domainerr.Validation("invalid_"+spec.kind+"_logo_type", "logo must be PNG or JPEG")
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		return "", domainerr.Validation("invalid_"+spec.kind+"_logo", "logo image could not be read")
	}
	return ct, nil
}

func (spec companyLogoSpec) printMaxPixels() (int, int) {
	w := int(math.Round(spec.maxWidthCm / 2.54 * logoPrintDPI))
	h := int(math.Round(spec.maxHeightCm / 2.54 * logoPrintDPI))
	return w, h
}

func validateDanfseLogo(data []byte) (string, error) { return danfseLogoSpec.validate(data) }

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
		return danfseLogoPrint{}, domainerr.Validation("invalid_"+spec.kind+"_logo", "logo image could not be read")
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

func (s *Service) SetCompanyDanfseLogo(ctx context.Context, organizationID, companyID, actorID uuid.UUID, data []byte) (*Company, error) {
	return s.setCompanyLogo(ctx, danfseLogoSpec, organizationID, companyID, actorID, data)
}

func (s *Service) DeleteCompanyDanfseLogo(ctx context.Context, organizationID, companyID, actorID uuid.UUID) (*Company, error) {
	return s.deleteCompanyLogo(ctx, danfseLogoSpec, organizationID, companyID, actorID)
}

func (s *Service) GetCompanyDanfseLogo(ctx context.Context, organizationID, companyID uuid.UUID) ([]byte, string, error) {
	return s.getCompanyLogo(ctx, danfseLogoSpec, organizationID, companyID)
}

func (s *Service) SetCompanyDanfeLogo(ctx context.Context, organizationID, companyID, actorID uuid.UUID, data []byte) (*Company, error) {
	return s.setCompanyLogo(ctx, danfeLogoSpec, organizationID, companyID, actorID, data)
}

func (s *Service) DeleteCompanyDanfeLogo(ctx context.Context, organizationID, companyID, actorID uuid.UUID) (*Company, error) {
	return s.deleteCompanyLogo(ctx, danfeLogoSpec, organizationID, companyID, actorID)
}

func (s *Service) GetCompanyDanfeLogo(ctx context.Context, organizationID, companyID uuid.UUID) ([]byte, string, error) {
	return s.getCompanyLogo(ctx, danfeLogoSpec, organizationID, companyID)
}

func (s *Service) setCompanyLogo(ctx context.Context, spec companyLogoSpec, organizationID, companyID, actorID uuid.UUID, data []byte) (*Company, error) {
	ct, err := spec.validate(data)
	if err != nil {
		return nil, err
	}
	printLogo, err := spec.resize(data)
	if err != nil {
		return nil, err
	}
	k := spec.kind
	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_companies
			set `+k+`_logo = $3, `+k+`_logo_content_type = $4,
			    `+k+`_logo_print = $5, `+k+`_logo_print_content_type = $6,
			    updated_at = now()
			where id = $1 and organization_id = $2
		`, companyID, organizationID, data, ct, printLogo.Data, printLogo.ContentType)
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
			Action:         "company." + k + "_logo.upload",
			ResourceType:   "organization_companies",
			ResourceID:     companyID.String(),
			After: map[string]any{
				"content_type": ct,
				"bytes":        len(data),
				"src_width":    printLogo.SrcW,
				"src_height":   printLogo.SrcH,
				"print_bytes":  len(printLogo.Data),
				"print_width":  printLogo.DstW,
				"print_height": printLogo.DstH,
			},
		})
	})
	if err != nil {
		return nil, err
	}
	return s.GetCompany(ctx, organizationID, companyID)
}

func (s *Service) deleteCompanyLogo(ctx context.Context, spec companyLogoSpec, organizationID, companyID, actorID uuid.UUID) (*Company, error) {
	k := spec.kind
	err := s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_companies
			set `+k+`_logo = null, `+k+`_logo_content_type = null,
			    `+k+`_logo_print = null, `+k+`_logo_print_content_type = null,
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
			Action:         "company." + k + "_logo.delete",
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

func (s *Service) getCompanyLogo(ctx context.Context, spec companyLogoSpec, organizationID, companyID uuid.UUID) ([]byte, string, error) {
	k := spec.kind
	var data []byte
	var ct *string
	err := s.pool.QueryRow(ctx, `
		select `+k+`_logo, `+k+`_logo_content_type
		from organization_companies
		where id = $1 and organization_id = $2 and `+k+`_logo is not null
	`, companyID, organizationID).Scan(&data, &ct)
	if err != nil || len(data) == 0 {
		return nil, "", domainerr.NotFound(k+"_logo_not_found", spec.label+" logo not found")
	}
	contentType := "image/png"
	if ct != nil && strings.TrimSpace(*ct) != "" {
		contentType = *ct
	}
	return data, contentType, nil
}
