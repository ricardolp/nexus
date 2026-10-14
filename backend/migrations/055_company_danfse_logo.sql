-- Optional company mark printed on the DANFSe header instead of the national NFS-e logo.
-- The PDF uses the image only when the flag is on and danfse_logo is present.

alter table organization_companies
    add column if not exists danfse_custom_logo_enabled boolean not null default false,
    add column if not exists danfse_logo bytea,
    add column if not exists danfse_logo_content_type text;

comment on column organization_companies.danfse_custom_logo_enabled is
    'When true and danfse_logo is set, the generated DANFSe uses this image in the header.';

comment on column organization_companies.danfse_logo is
    'PNG or JPEG bytes of the company logo for the DANFSe header.';
