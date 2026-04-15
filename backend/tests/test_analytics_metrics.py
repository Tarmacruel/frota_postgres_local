import pytest

from app.services.analytics_service import (
    calculate_consumption_l_100km,
    calculate_driver_risk_score,
    calculate_tco_per_km,
    calculate_variance_percentage,
)


def test_calculate_consumption_l_100km():
    assert calculate_consumption_l_100km(50, 500) == 10
    assert calculate_consumption_l_100km(20, 0) is None


def test_calculate_tco_per_km():
    assert calculate_tco_per_km(300, 200, 100, 500) == 1.2
    assert calculate_tco_per_km(100, 0, 0, 0) is None


def test_calculate_driver_risk_score():
    score = calculate_driver_risk_score(fines_count=4, claims_count=2, anomalies_count=3)
    assert score == pytest.approx(2.8)


def test_calculate_variance_percentage():
    assert calculate_variance_percentage(12, 10) == 20
    assert calculate_variance_percentage(8, 10) == -20
    assert calculate_variance_percentage(10, 0) is None
