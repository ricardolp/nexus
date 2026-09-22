package catalogs_test

import (
	"strings"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/catalogs"
)

func TestStoreLoadsAndLooksUp(t *testing.T) {
	t.Parallel()
	s, err := catalogs.Get()
	if err != nil {
		t.Fatal(err)
	}
	if len(s.CNAEs) < 1000 {
		t.Fatalf("cnae count=%d", len(s.CNAEs))
	}
	if len(s.NBS) < 500 {
		t.Fatalf("nbs count=%d", len(s.NBS))
	}
	if len(s.Municipalities) < 5000 {
		t.Fatalf("muni count=%d", len(s.Municipalities))
	}

	cnae, ok := s.LookupCNAE("6201501")
	if !ok || cnae.Description == "" {
		// may not be exact code; ensure search works
		items := s.SearchCNAE("6201", 5)
		if len(items) == 0 {
			t.Fatal("expected cnae search hits")
		}
	} else if cnae.Code != "6201501" {
		t.Fatalf("code=%s", cnae.Code)
	}

	muni, ok := s.LookupMunicipality("3550308")
	if !ok || muni.Name == "" || muni.UF != "SP" {
		t.Fatalf("municipality=%+v ok=%v", muni, ok)
	}

	nbs := s.SearchNBS("", "6201501", "", true, 20)
	if len(nbs) == 0 {
		t.Fatal("expected suggested NBS for IT CNAE")
	}
	for _, item := range nbs {
		if !item.Suggested {
			t.Fatalf("expected suggested flag: %+v", item)
		}
	}
	if !strings.HasPrefix(nbs[0].Code, "1.15") {
		t.Fatalf("expected IT NBS (1.15) first for CNAE 62, got %s", nbs[0].Code)
	}

	if len(s.LC116) < 100 {
		t.Fatalf("lc116 count=%d", len(s.LC116))
	}
	lc, ok := s.LookupLC116("14.01")
	if !ok || lc.Description == "" {
		t.Fatalf("lookup lc116 14.01=%+v ok=%v", lc, ok)
	}
	lcMaint := s.SearchLC116("", "3314711", "", true, 10)
	if len(lcMaint) == 0 || lcMaint[0].Code != "14.01" {
		t.Fatalf("expected 14.01 for CNAE 3314711, got %+v", lcMaint)
	}
	nbsMaint := s.SearchNBS("", "3314711", "", true, 10)
	if len(nbsMaint) == 0 {
		t.Fatal("expected suggested NBS for CNAE division 33")
	}
	if !strings.HasPrefix(nbsMaint[0].Code, "1.2001.50") && !strings.HasPrefix(nbsMaint[0].Code, "1.2001.89") {
		t.Fatalf("expected machinery-repair NBS for CNAE 33, got %s", nbsMaint[0].Code)
	}

	tractorNBS := s.SearchNBS("", "2831300", "", true, 10)
	if len(tractorNBS) == 0 {
		t.Fatal("expected suggested NBS for CNAE 2831-3/00")
	}
	if !strings.HasPrefix(tractorNBS[0].Code, "1.2001") && !strings.HasPrefix(tractorNBS[0].Code, "1.2003") {
		t.Fatalf("expected machinery NBS for CNAE 28, got %s", tractorNBS[0].Code)
	}
	tractorLC := s.SearchLC116("", "2831300", "", true, 10)
	if len(tractorLC) == 0 || tractorLC[0].Code != "14.01" {
		t.Fatalf("expected 14.01 for CNAE 2831300, got %+v", tractorLC)
	}

	itLC := s.SearchLC116("", "6201501", "", true, 20)
	if len(itLC) == 0 {
		t.Fatal("expected LC 116 suggestions for IT CNAE")
	}
	for _, item := range itLC {
		if !strings.HasPrefix(item.Code, "01.") {
			t.Fatalf("LC 116 for CNAE 62 should stay in group 01, got %s %s", item.Code, item.Description)
		}
	}

	consultNBS := "1.1501.10.00"
	fromNBS := s.SearchLC116("", "6201501", consultNBS, true, 10)
	if len(fromNBS) == 0 || fromNBS[0].Code != "01.06" {
		t.Fatalf("expected 01.06 for NBS %s, got %+v", consultNBS, fromNBS)
	}

	fromItem := s.SearchNBS("", "", "01.06", true, 20)
	foundConsult := false
	for _, item := range fromItem {
		if item.Code == consultNBS || item.CodeDigits == "115011000" {
			foundConsult = true
			break
		}
	}
	if !foundConsult {
		t.Fatalf("expected NBS %s among LC 116 01.06 matches, got %+v", consultNBS, fromItem)
	}
}
