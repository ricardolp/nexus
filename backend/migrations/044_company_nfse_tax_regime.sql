-- NFS-e Nacional prest/regTrib fields on the company cadastre.
-- tax_regime already existed (unused); reuse it for opSimpNac (1/2/3).
-- special_tax_regime stores regEspTrib (0=Nenhum … 7=Específicos municipais).

alter table organization_companies
    add column if not exists special_tax_regime text;

comment on column organization_companies.tax_regime is
    'NFS-e opSimpNac: 1=Nao Optante, 2=MEI, 3=ME/EPP';

comment on column organization_companies.special_tax_regime is
    'NFS-e regEspTrib: 0=Nenhum, 1=Cooperativa, 2=Estimativa, 3=ME Municipal, 4=Notario, 5=Autonomo, 6=Sociedade de Profissionais, 7=Especificos municipais';
