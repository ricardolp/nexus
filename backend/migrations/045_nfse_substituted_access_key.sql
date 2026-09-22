-- NFS-e substitution: persist access key of the replaced note so authorization
-- of the substitute can mark the original as cancelled (SEFIN 105102).
alter table organization_nfse
    add column if not exists substituted_access_key text;
