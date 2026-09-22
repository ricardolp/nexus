-- IBS/CBS CST in NT 2025.002 is 3 digits (e.g. 000, 200, 620).
-- Migration 034 used char(2) by mistake; widen before real SAP payloads land.

alter table organization_nfe_items
    alter column ibs_cst type char(3),
    alter column cbs_cst type char(3);
