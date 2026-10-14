package organization

import "testing"

func strp(s string) *string { return &s }

func TestNormalizeNFSeIBSCBSDefaults(t *testing.T) {
	t.Parallel()
	got, err := normalizeNFSeIBSCBSDefaults(strp("000"), strp("000.001"), strp("10.03.01"))
	if err != nil {
		t.Fatal(err)
	}
	if got.CST != "000" || got.ClassTrib != "000001" || got.OperationIndicator != "100301" ||
		!got.SetClassification || !got.SetOperationIndicator {
		t.Fatalf("got %+v", got)
	}

	// Fields not sent are kept on update.
	got, err = normalizeNFSeIBSCBSDefaults(nil, nil, nil)
	if err != nil || got.SetClassification || got.SetOperationIndicator {
		t.Fatalf("nil inputs must not touch stored values: %+v %v", got, err)
	}

	// Empty strings clear.
	got, err = normalizeNFSeIBSCBSDefaults(strp(""), strp(""), strp(""))
	if err != nil || !got.SetClassification || got.CST != "" || !got.SetOperationIndicator {
		t.Fatalf("clear: %+v %v", got, err)
	}

	bad := []struct{ cst, class, indOp *string }{
		{strp("000"), nil, nil},            // pair incomplete
		{strp("00"), strp("000001"), nil},  // CST length
		{strp("000"), strp("00001"), nil},  // cClassTrib length
		{strp("200"), strp("000001"), nil}, // cClassTrib must start with CST
		{nil, nil, strp("1003")},           // cIndOp length
	}
	for i, b := range bad {
		if _, err := normalizeNFSeIBSCBSDefaults(b.cst, b.class, b.indOp); err == nil {
			t.Errorf("case %d: expected validation error", i)
		}
	}
}
