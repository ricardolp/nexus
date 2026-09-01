from nfe_gateway.metrics import start_if_configured


def test_start_if_configured_noop_when_disabled() -> None:
    start_if_configured(0)
    start_if_configured(-1)
