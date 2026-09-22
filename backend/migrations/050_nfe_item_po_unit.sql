alter table organization_nfe_items
    add column if not exists resolved_purchase_order_unit varchar(10);
