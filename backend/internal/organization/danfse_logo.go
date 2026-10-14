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
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	xdraw "golang.org/x/image/draw"
)

const maxDanfseLogoBytes = 1 << 20

// Header slot from platform/danfse drawHeaderLogo: 4.00 cm × 1.16 cm.
// The print copy is rasterized at 300 DPI so the PDF stays sharp without
// embedding the original file.
const (
	danfseLogoMaxWidthCm  = 4.00
	danfseLogoMaxHeightCm = 1.16
	danfseLogoPrintDPI    = 300
)

type danfseLogoPrint struct {
	Data        []byte
	ContentType string
	SrcW        int
	SrcH        int
	DstW        int
	DstH        int
}

func validateDanfseLogo(data []byte) (string, error) {
	if len(data) == 0 {
		return "", domainerr.Validation("empty_danfse_logo", "logo file is required")
	}
	if len(data) > maxDanfseLogoBytes {
		return "", domainerr.Validation("danfse_logo_too_large", "logo must be at most 1 MB")
	}
	ct := http.DetectContentType(data)
	if ct != "image/png" && ct != "image/jpeg" {
		return "", domainerr.Validation("invalid_danfse_logo_type", "logo must be PNG or JPEG")
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		return "", domainerr.Validation("invalid_danfse_logo", "logo image could not be read")
	}
	return ct, nil
}

func danfseLogoPrintMaxPixels() (int, int) {
	w := int(math.Round(danfseLogoMaxWidthCm / 2.54 * danfseLogoPrintDPI))
	h := int(math.Round(danfseLogoMaxHeightCm / 2.54 * danfseLogoPrintDPI))
	return w, h
}

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

func resizeDanfseLogo(data []byte) (danfseLogoPrint, error) {
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return danfseLogoPrint{}, domainerr.Validation("invalid_danfse_logo", "logo image could not be read")
	}
	bounds := src.Bounds()
	srcW, srcH := bounds.Dx(), bounds.Dy()
	maxW, maxH := danfseLogoPrintMaxPixels()
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
	ct, err := validateDanfseLogo(data)
	if err != nil {
		return nil, err
	}
	printLogo, err := resizeDanfseLogo(data)
	if err != nil {
		return nil, err
	}
	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_companies
			set danfse_logo = $3, danfse_logo_content_type = $4,
			    danfse_logo_print = $5, danfse_logo_print_content_type = $6,
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
			Action:         "company.danfse_logo.upload",
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

func (s *Service) DeleteCompanyDanfseLogo(ctx context.Context, organizationID, companyID, actorID uuid.UUID) (*Company, error) {
	err := s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_companies
			set danfse_logo = null, danfse_logo_content_type = null,
			    danfse_logo_print = null, danfse_logo_print_content_type = null,
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
			Action:         "company.danfse_logo.delete",
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

func (s *Service) GetCompanyDanfseLogo(ctx context.Context, organizationID, companyID uuid.UUID) ([]byte, string, error) {
	var data []byte
	var ct *string
	err := s.pool.QueryRow(ctx, `
		select danfse_logo, danfse_logo_content_type
		from organization_companies
		where id = $1 and organization_id = $2 and danfse_logo is not null
	`, companyID, organizationID).Scan(&data, &ct)
	if err != nil || len(data) == 0 {
		return nil, "", domainerr.NotFound("danfse_logo_not_found", "DANFSe logo not found")
	}
	contentType := "image/png"
	if ct != nil && strings.TrimSpace(*ct) != "" {
		contentType = *ct
	}
	return data, contentType, nil
}
