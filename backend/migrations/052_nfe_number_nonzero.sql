-- Reject NF-e numbers that are empty or all zeros (e.g. SAP "000000000").
-- XSD TNF requires [1-9][0-9]{0,8}; SEFAZ cStat 215 rejects nNF=0.
alter table organization_nfe
    drop constraint if exists organization_nfe_number_nonzero;

alter table organization_nfe
    add constraint organization_nfe_number_nonzero
    check (
        number is null
        or nullif(regexp_replace(trim(number), '^0+', ''), '') is not null
    );

-- down
-- alter table organization_nfe drop constraint if exists organization_nfe_number_nonzero;
