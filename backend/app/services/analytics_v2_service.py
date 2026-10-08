from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal

from app.models.fine import FineStatus
from app.repositories.analytics_v2_repository import AnalyticsV2Repository
from app.schemas.analytics_v2 import (
    AnalyticsV2Amount, AnalyticsV2Calculation, AnalyticsV2DriverRisk, AnalyticsV2Kpi,
    AnalyticsV2Month, AnalyticsV2Summary, AnalyticsV2Totals,
    AnalyticsV2Mileage,
)
from app.services.analytics_v2_periods import calendar_months, compare, equivalent_periods

ZERO = Decimal("0")


def aggregate_amount(rows, *, value_key="amount", count_key="known_amounts"):
    count = sum(row["records"] for row in rows)
    known_count = sum(row[count_key] for row in rows)
    known = sum((Decimal(str(row[value_key])) for row in rows if row[value_key] is not None), ZERO)
    return AnalyticsV2Amount(value=known if count == known_count else None, known_value=known,
        records=count, missing_or_invalid=count - known_count)


def totals(rows):
    by_source = {source: [row for row in rows if row["source"] == source]
        for source in ("fuel", "maintenance", "fines", "claim_estimate")}
    return AnalyticsV2Totals(
        **{source: aggregate_amount(items) for source, items in by_source.items()},
        fines_by_status={status.value: aggregate_amount([row for row in by_source["fines"] if row["status"] == status.value]) for status in FineStatus},
        operational_cost=aggregate_amount([row for row in rows if row["source"] != "claim_estimate"]),
        liters=aggregate_amount(by_source["fuel"], value_key="liters", count_key="known_liters"),
    )


def driver_risk(rows):
    """Same V1 weights, on scoped events; no per-driver database request."""
    counts = defaultdict(lambda: {"fines_count": 0, "claims_count": 0, "anomalies_count": 0})
    for row in rows:
        if row["driver_id"] is None:
            continue
        item = counts[row["driver_id"]]
        if row["source"] == "fines":
            item["fines_count"] += row["records"]
        elif row["source"] == "claim_estimate":
            item["claims_count"] += row["records"]
        elif row["source"] == "fuel":
            item["anomalies_count"] += row["anomalies"]
    results = [AnalyticsV2DriverRisk(driver_id=driver, **count,
        score=min(Decimal(100), Decimal(count["fines_count"] * 3 + count["claims_count"] * 5 + count["anomalies_count"] * 2)))
        for driver, count in counts.items()]
    return sorted(results, key=lambda item: (-item.score, str(item.driver_id)))


def mileage(rows):
    valid = sum(row["valid_records"] for row in rows)
    return AnalyticsV2Mileage(distance_km=sum((Decimal(str(row["distance_km"])) for row in rows), ZERO) if valid else None,
        valid_records=valid, excluded_records=sum(row["records"] - row["valid_records"] for row in rows),
        crossing_records=sum(row["crossing_records"] for row in rows),
        overlapping_records=sum(row["overlapping_records"] for row in rows),
        vehicles_with_valid_distance=sum(row["valid_records"] > 0 for row in rows))


def mileage_metrics(event_rows, distance_rows):
    measured = mileage(distance_rows)
    # Numerator and denominator always refer to the same set of vehicles.
    vehicle_ids = {row["vehicle_id"] for row in distance_rows if row["valid_records"] > 0}
    subset = totals([row for row in event_rows if row["vehicle_id"] in vehicle_ids])
    km = measured.distance_km
    cost = subset.operational_cost.value
    liters = subset.liters.value
    return measured, {
        "distance_km": (km, km, None),
        "operational_cost_per_km": (cost / km if cost is not None and km is not None and km > 0 else None, cost, km),
        "consumption_l_100km": (liters / km * 100 if liters is not None and km is not None and km > 0 else None, liters, km),
    }


class AnalyticsV2Service:
    def __init__(self, db):
        self.repository = AnalyticsV2Repository(db)

    async def summary(self, filters, *, now=None):
        now = now or datetime.now(timezone.utc)
        current_period, previous_period = equivalent_periods(filters.date_from, filters.date_to, now=now)
        rows = await self.repository.summary_rows(filters, current_period, previous_period)
        distance_rows = await self.repository.mileage_rows(filters, current_period, previous_period)
        current_rows = [row for row in rows if row["period"] == "current"]
        previous_rows = [row for row in rows if row["period"] == "previous"]
        current, previous = totals(current_rows), totals(previous_rows)
        current_mileage, current_metrics = mileage_metrics(current_rows, [row for row in distance_rows if row["period"] == "current"])
        previous_mileage, previous_metrics = mileage_metrics(previous_rows, [row for row in distance_rows if row["period"] == "previous"])
        kpis = []
        definitions = [
            ("operational_cost", "Custo operacional registrado", "BRL", "SUM(combustível + manutenção + multas)",
             ["fuel_supplies.total_amount@supplied_at", "maintenance_records.total_cost@start_date", "fines.amount@infraction_date"]),
            ("liters", "Litros abastecidos registrados", "L", "SUM(liters)", ["fuel_supplies.liters@supplied_at"]),
            ("claim_estimate", "Custo estimado de sinistros", "BRL", "SUM(valor_estimado)", ["claims.valor_estimado@data_ocorrencia"]),
        ]
        for key, label, unit, formula, sources in definitions:
            value, prior = getattr(current, key), getattr(previous, key)
            kpis.append(AnalyticsV2Kpi(key=key, label=label, unit=unit, value=value.value,
                quality="partial" if value.missing_or_invalid else "recorded", comparison=compare(value.value, prior.value),
                calculation=AnalyticsV2Calculation(formula=formula, sources=sources,
                    reference_type="previous_period", reference_source="Mesmas fontes, filtros e duração em dias civis no período imediatamente anterior.",
                    limitations=["Valores registrados não comprovam pagamento ou liquidação. Ausências não são imputadas."])))
        for key, label, unit, formula, sources in [
            ("distance_km", "Quilometragem de posses válidas", "km", "SUM(end_odometer_km - start_odometer_km)", []),
            ("operational_cost_per_km", "Custo operacional registrado por km", "BRL/km", "custo registrado dos veículos medidos / km válido", ["fuel_supplies.total_amount", "maintenance_records.total_cost", "fines.amount"]),
            ("consumption_l_100km", "Litros abastecidos por 100 km registrados", "L/100km", "litros registrados dos veículos medidos / km válido * 100", ["fuel_supplies.liters"]),
        ]:
            value, numerator, denominator = current_metrics[key]
            kpis.append(AnalyticsV2Kpi(key=key, label=label, unit=unit, value=value,
                quality="unavailable" if value is None else "partial",
                comparison=compare(value, previous_metrics[key][0]),
                calculation=AnalyticsV2Calculation(formula=formula, numerator=numerator, denominator=denominator,
                    sample_size=current_mileage.vehicles_with_valid_distance,
                    sources=["vehicle_possession.start_odometer_km", "vehicle_possession.end_odometer_km", *sources],
                    reference_type="previous_period", reference_source="Mesma regra em posses válidas do período anterior.",
                    limitations=["Somente posses encerradas inteiramente no período, com leituras finitas não negativas e não regressivas, duração positiva e sem sobreposição com outra posse encerrada. Sem rateio ou soma adicional de viagens.",
                        "Cobertura parcial: não representa toda a distância da frota. Razões usam totais dos mesmos veículos, não média de razões individuais.",
                        "Litros abastecidos não comprovam consumo efetivo sem medição de tanque; custo registrado não comprova despesa paga."])))
        return AnalyticsV2Summary(generated_at=now, filters=filters, period=current_period,
            previous_period=previous_period, kpis=kpis, current=current, previous=previous,
            monthly=[AnalyticsV2Month(month=month, date_from=start, date_to=end,
                totals=totals([row for row in current_rows if row["month"] == month]))
                for month, start, end in calendar_months(filters.date_from, filters.date_to)],
            driver_risk=driver_risk(current_rows),
            mileage=current_mileage, previous_mileage=previous_mileage,
            quality={"records": sum(row["records"] for row in current_rows),
                "operational_cost_missing_or_invalid": current.operational_cost.missing_or_invalid,
                "events_without_driver": sum(row["records"] for row in current_rows if row["driver_id"] is None and row["source"] in ("fuel", "fines", "claim_estimate")),
                "distance_status": "closed_possessions_partial_coverage"},
            methodology={
                "cost_basis": "Valores registrados: combustível + manutenção por início + multas de todos os status, discriminadas por status atual. Não representa caixa, liquidação ou TCO.",
                "claim_estimate": "Estimativas separadas, nunca incluídas no custo operacional.",
                "organization": "Responsabilidade explícita no evento; quando nula, lotação histórica não ambígua conforme responsible_to. Sem fallback para proprietário ou lotação atual. Global pode conter eventos sem atribuição resolvida.",
                "vehicle_universe": "Eventos no período, incluindo veículos atualmente inativos. Tipo refere-se ao cadastro atual; não existe histórico de tipo.",
                "driver_risk": "min(3*multas + 5*sinistros + 2*anomalias, 100), pesos V1. Somente condutores com eventos atribuídos no recorte, inclusive atualmente inativos/transferidos; não é probabilidade de acidente.",
                "period": "Dias civis encerrados em America/Bahia; início inclusivo/fim exclusivo. Datas de multas sem hora pertencem ao dia civil informado.",
                "reference": "Período anterior equivalente. Nenhum benchmark de mercado ou constante sem proveniência aplicado.",
                "mileage": "Fonte aprovada: somente posses encerradas e válidas. Responsabilidade explícita da posse ou histórica no início, conforme regra existente. Nunca somar viagens ou amplitude de abastecimentos.",
                "persistence": "Duas consultas agregadas somente leitura; sem criação ou substituição de snapshots.",
                "serialization": "Valores decimais são strings JSON para preservar precisão; ausência é null, nunca zero imputado.",
            })
