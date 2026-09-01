package billing

import "strings"

// ClassifyDocument maps an organization_documents row to a billable metric.
// Inbound NF-e from the gateway distribution client is SEFAZ; manual XML
// upload is a distinct product because it is a different ingestion channel.
func ClassifyDocument(documentType, direction, sourceSystem string) string {
	docType := strings.ToLower(strings.TrimSpace(documentType))
	dir := strings.ToLower(strings.TrimSpace(direction))
	src := strings.ToLower(strings.TrimSpace(sourceSystem))

	switch docType {
	case "nfe":
		if dir == "outbound" {
			return MetricNFeOutbound
		}
		if dir == "inbound" {
			if src == SourceManualUpload {
				return MetricNFeInboundXML
			}
			if src == SourceNFeGatewayDist || src == "" || strings.HasPrefix(src, "nfe_gateway") {
				return MetricNFeInboundSEFAZ
			}
			return MetricNFeInboundOther
		}
	case "nfse":
		if dir == "outbound" {
			return MetricNFSeOutbound
		}
		if dir == "inbound" {
			return MetricNFSeInbound
		}
	}
	return MetricOther
}

// ClassifyDocumentEvent maps a timeline event to a billable metric when the
// event itself is a charged SEFAZ/message action (cancel, CC-e, manifestation).
// Returns "" when the event is operational noise (received, authorized, …)
// and must not increment the extract.
func ClassifyDocumentEvent(eventType, manifestationType string) string {
	et := strings.ToLower(strings.TrimSpace(eventType))
	mt := strings.ToLower(strings.TrimSpace(manifestationType))

	switch {
	case strings.Contains(et, "cancel"):
		return MetricNFeCancel
	case strings.Contains(et, "correction") || strings.Contains(et, "carta") ||
		et == "cce" || strings.Contains(et, "cce"):
		return MetricNFeCorrection
	}

	if et == "manifestacao" || strings.Contains(et, "manifest") {
		switch mt {
		case "confirmacao_da_operacao":
			return MetricNFeAccept
		case "operacao_nao_realizada":
			return MetricNFeReject
		case "ciencia_da_operacao":
			return MetricNFeScience
		case "desconhecimento_da_operacao":
			return MetricNFeUnknown
		}
	}
	return ""
}
