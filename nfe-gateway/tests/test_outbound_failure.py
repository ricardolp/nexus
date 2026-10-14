from nfe_gateway.backend_client import BackendError
from nfe_gateway.workers.outbound_consumer import (
    CERTIFICATE_MISSING_MESSAGE,
    classify_transmission_error,
)


def test_missing_certificate_is_a_screen_error() -> None:
    body = (
        '{"type":"https://errors.fiscal-messaging.local/certificate_not_found",'
        '"title":"Not Found","status":404,"code":"certificate_not_found",'
        '"detail":"Company has no active certificate"}'
    )
    code, message = classify_transmission_error(BackendError(404, body))
    assert code == "certificate_not_found"
    assert message == CERTIFICATE_MISSING_MESSAGE
    assert "Company has no active certificate" not in message


def test_other_backend_error_keeps_the_detail() -> None:
    body = '{"code":"company_not_found","detail":"Empresa não encontrada"}'
    code, message = classify_transmission_error(BackendError(404, body))
    assert code == "company_not_found"
    assert message == "Empresa não encontrada"


def test_generic_failure_stays_a_transmission_error() -> None:
    code, message = classify_transmission_error(ValueError("uf is required for NF-e transmission"))
    assert code == "transmission_error"
    assert "uf is required" in message
