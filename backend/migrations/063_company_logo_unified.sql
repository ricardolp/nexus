-- One company logo for both PDFs. danfse_logo keeps the original file; each
-- PDF has its own print copy (danfse_logo_print, danfe_logo_print) and its own
-- flag (danfse_custom_logo_enabled, danfe_custom_logo_enabled).
-- A logo sent only through the short-lived DANFE upload becomes the company logo.

update organization_companies
set danfse_logo = danfe_logo,
    danfse_logo_content_type = danfe_logo_content_type,
    danfse_logo_print = null,
    danfse_logo_print_content_type = null
where danfse_logo is null and danfe_logo is not null;

alter table organization_companies
    drop column if exists danfe_logo,
    drop column if exists danfe_logo_content_type;

comment on column organization_companies.danfse_logo is
    'Original PNG or JPEG of the company logo, shared by DANFSe and DANFE. Not drawn on the PDFs.';

comment on column organization_companies.danfe_custom_logo_enabled is
    'When true and the company has a logo, the generated DANFE prints it in the issuer box.';

comment on column organization_companies.danfe_logo_print is
    'Company logo fitted inside the DANFE issuer box (3.20 cm x 2.20 cm at 300 DPI). Falls back to danfse_logo when null.';
