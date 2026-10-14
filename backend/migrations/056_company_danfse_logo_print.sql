-- Print-ready copy of the company DANFSe logo.
-- danfse_logo keeps the uploaded original. danfse_logo_print is fitted to the
-- header slot (4.00 cm x 1.16 cm at 300 DPI) and is the image drawn on the PDF.

alter table organization_companies
    add column if not exists danfse_logo_print bytea,
    add column if not exists danfse_logo_print_content_type text;

comment on column organization_companies.danfse_logo is
    'Original PNG or JPEG uploaded for the DANFSe. Not drawn on the PDF.';

comment on column organization_companies.danfse_logo_print is
    'PNG fitted inside the DANFSe header (4.00 cm x 1.16 cm at 300 DPI). Drawn on the PDF when the custom logo flag is on.';

comment on column organization_companies.danfse_custom_logo_enabled is
    'When true and danfse_logo_print (or danfse_logo) is set, the generated DANFSe uses the company mark in the header.';
