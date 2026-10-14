package fiscal

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
)

// Integração com Postgres (migrations aplicadas). Roda só com TEST_DATABASE_URL,
// ex.: TEST_DATABASE_URL=postgres://postgres@localhost:5432/nexus_test go test ./internal/fiscal/
func TestNFSeIBSCBSPostgres(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip()
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	orgID, compID, docID := uuid.New(), uuid.New(), uuid.New()
	mustExec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	mustExec(`insert into organizations (id, legal_name, slug, status) values ($1,'Org','org-'||$2,'active')`, orgID, orgID.String()[:8])
	mustExec(`insert into organization_companies (id, organization_id, legal_name, cnpj, environment, status) values ($1,$2,'Cia','12345678000195','homologation','active')`, compID, orgID)
	mustExec(`insert into organization_documents (id, organization_id, organization_company_id, document_type, direction, environment, source_system, idempotency_key, status, processing_status, correlation_id, trace_id, received_at)
	          values ($1,$2,$3,'nfse','outbound','homologation','sap',$4,'submitted','waiting_external',$5,$6,now())`, docID, orgID, compID, "k-"+docID.String(), uuid.New(), uuid.New())
	mustExec(`insert into organization_nfse (organization_document_id, organization_id, rps_series, rps_number, ibs_uf_amount, cbs_amount, ibs_uf_rate)
	          values ($1,$2,'1','10', 9.99, 99.99, 0.001)`, docID, orgID)

	// --- catalog defaults lookup ---
	svcID := uuid.New()
	mustExec(`insert into organization_company_nfse_services (id, organization_id, organization_company_id, cnae_code, service_list_item, nbs_code, status, ibs_cbs_cst, ibs_cbs_class_trib, ibs_cbs_operation_indicator)
	          values ($1,$2,$3,'6201501','17.09','1.1501.10.00','active','000','000001','100301')`, svcID, orgID, compID)
	orgs := organization.NewService(pool)
	for _, c := range []struct{ item, nbs string }{{"1709", ""}, {"17.09.01", ""}, {"", "115011000"}, {"17.09", "1.1501.10.00"}} {
		d, err := orgs.FindNFSeIBSCBSDefaults(ctx, orgID, compID, c.item, c.nbs)
		if err != nil || d == nil || d.CST != "000" || d.ClassTrib != "000001" || d.OperationIndicator != "100301" {
			t.Fatalf("defaults for %+v = %+v err=%v", c, d, err)
		}
	}
	if d, err := orgs.FindNFSeIBSCBSDefaults(ctx, orgID, compID, "01.06", "999"); err != nil || d != nil {
		t.Fatalf("expected no match, got %+v %v", d, err)
	}

	// --- Receive enrichment helper end to end (catalog → payload) ---
	svc := NewService(pool, nil, orgs, "")
	raw := []byte(`{"servico":{"item_lista_servico":"17.09","valor_servicos":100}}`)
	p, _ := ParseSAPNFSePayload(raw)
	out, filled, err := svc.applyNFSeIBSCBSDefaults(ctx, orgID, compID, p, raw)
	if err != nil || len(filled) != 3 {
		t.Fatalf("enrich: filled=%v err=%v out=%s", filled, err, out)
	}

	// --- SEFIN result persistence + webhook outbox ---
	doc, err := svc.GetDocument(ctx, orgID, docID)
	if err != nil {
		t.Fatal(err)
	}
	res := TransmissionResult{DocumentID: docID, Outcome: "authorized", AccessKey: "4106902", Number: "3",
		IBSCBS: &NFSeIBSCBSResult{CST: "000", ClassTrib: "000001", OperationIndicator: "030101",
			IncidenceMunicipality: "4106902", IncidenceMunicipalityName: "Curitiba", BaseCalculo: "500.00",
			IBSUFRate: "0.10", IBSUFEffectiveRate: "0.10", IBSMunRate: "0.00", CBSRate: "0.90", CBSEffectiveRate: "0.90",
			IBSUFAmount: "0.50", IBSMunAmount: "0.00", IBSAmount: "0.50", CBSAmount: "4.50", TotalWithIBSCBS: "500.00"}}
	if err := svc.ApplyTransmissionResult(ctx, *doc, StatusAuthorized, "completed", res); err != nil {
		t.Fatal(err)
	}
	var base, ufAmt, cbsAmt, ibsAmt, ufRate, ufRatePct float64
	var src, indOp, incid string
	var calc *time.Time
	var js []byte
	if err := pool.QueryRow(ctx, `select ibs_cbs_calculation_base, ibs_uf_amount, cbs_amount, ibs_amount, ibs_uf_rate, ibs_uf_rate_pct,
	        ibs_cbs_source, ibs_cbs_operation_indicator, ibs_cbs_incidence_municipality_code, ibs_cbs_calculated_at, ibs_cbs_sefin_json::text
	        from organization_nfse where organization_document_id=$1`, docID).
		Scan(&base, &ufAmt, &cbsAmt, &ibsAmt, &ufRate, &ufRatePct, &src, &indOp, &incid, &calc, &js); err != nil {
		t.Fatal(err)
	}
	if base != 500 || ufAmt != 0.5 || cbsAmt != 4.5 || ibsAmt != 0.5 || ufRatePct != 0.10 || ufRate != 0.001 || src != "sefin" || indOp != "030101" || incid != "4106902" || calc == nil {
		t.Fatalf("persisted: base=%v uf=%v cbs=%v ibs=%v ufRate=%v ufRatePct=%v src=%v indop=%v incid=%v calc=%v", base, ufAmt, cbsAmt, ibsAmt, ufRate, ufRatePct, src, indOp, incid, calc)
	}
	var payload []byte
	if err := pool.QueryRow(ctx, `select payload_json::text from outbox_events where aggregate_id=$1 order by created_at desc limit 1`, docID).Scan(&payload); err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	_ = json.Unmarshal(payload, &m)
	data, _ := m["data"].(map[string]any)
	if data == nil {
		data = m
	}
	ibs, _ := data["ibs_cbs"].(map[string]any)
	if ibs == nil || ibs["cbs_valor"] != "4.50" || ibs["fonte"] != "sefin" {
		t.Fatalf("outbox payload lacks ibs_cbs: %s", payload)
	}
	if data["numero"] != "3" || data["numero_rps"] != "10" || data["serie"] != "1" {
		t.Fatalf("outbox nfse identity = numero %v numero_rps %v serie %v", data["numero"], data["numero_rps"], data["serie"])
	}
	_ = payload
}
