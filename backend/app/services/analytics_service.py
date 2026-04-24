from __future__ import annotations

import io
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from fastapi import HTTPException, status
from fastapi.responses import Response
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.claim import Claim
from app.models.driver import Driver
from app.models.fine import Fine
from app.models.fleet_analytics_snapshot import FleetAnalyticsSnapshot
from app.models.fuel_supply import FuelSupply
from app.models.maintenance import MaintenanceRecord
from app.models.vehicle import Vehicle, VehicleStatus
from app.repositories.analytics_repository import AnalyticsRepository


MARKET_TCO_BENCHMARK_BY_TYPE = {
    "SEDAN": 1.35,
    "HATCH": 1.20,
    "PICAPE": 1.75,
    "SUV": 1.90,
    "PERUA_SW": 1.55,
    "VAN": 2.30,
    "MICRO_ONIBUS": 2.80,
    "ONIBUS": 3.20,
    "CAMINHAO": 3.80,
    "MOTOCICLETA": 0.60,
    "MAQUINA": 5.50,
}


def calculate_consumption_l_100km(total_liters: float, total_km: float) -> float | None:
    if total_km <= 0:
        return None
    return (total_liters / total_km) * 100


def calculate_tco_per_km(fuel_cost: float, maintenance_cost: float, fines_cost: float, total_km: float) -> float | None:
    if total_km <= 0:
        return None
    return (fuel_cost + maintenance_cost + fines_cost) / total_km


def calculate_driver_risk_score(*, fines_count: int, claims_count: int, anomalies_count: int) -> float:
    return (fines_count * 0.3) + (claims_count * 0.5) + (anomalies_count * 0.2)


def calculate_variance_percentage(current_value: float | None, baseline: float | None) -> float | None:
    if current_value is None or baseline is None or baseline == 0:
        return None
    return ((current_value - baseline) / baseline) * 100


@dataclass
class _VehicleAggregate:
    vehicle_id: UUID
    vehicle_type: str
    total_km: float = 0.0
    total_liters: float = 0.0
    fuel_cost: float = 0.0
    maintenance_cost: float = 0.0
    fines_cost: float = 0.0
    anomalies_count: int = 0


class AnalyticsService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.analytics_repo = AnalyticsRepository(db)

    def _period_bounds(self, period_days: int) -> tuple[datetime, datetime]:
        reference = datetime.now(timezone.utc)
        end = reference.replace(hour=0, minute=0, second=0, microsecond=0)
        start = end - timedelta(days=period_days)
        return start, end

    @staticmethod
    def _unique_vehicle_snapshots(rows: list[FleetAnalyticsSnapshot]) -> list[FleetAnalyticsSnapshot]:
        unique: dict[UUID, FleetAnalyticsSnapshot] = {}
        for row in rows:
            if row.scope != "VEHICLE" or row.vehicle_id is None:
                continue
            unique.setdefault(row.vehicle_id, row)
        return list(unique.values())

    @staticmethod
    def _unique_driver_snapshots(rows: list[FleetAnalyticsSnapshot]) -> list[FleetAnalyticsSnapshot]:
        unique: dict[UUID, FleetAnalyticsSnapshot] = {}
        for row in rows:
            if row.scope != "DRIVER" or row.driver_id is None:
                continue
            unique.setdefault(row.driver_id, row)
        return list(unique.values())

    async def _ensure_snapshots(self, period_days: int) -> list[FleetAnalyticsSnapshot]:
        period_start, period_end = self._period_bounds(period_days)

        vehicle_rows = (
            await self.db.execute(
                select(Vehicle.id, Vehicle.vehicle_type).where(Vehicle.status != VehicleStatus.INATIVO)
            )
        ).all()
        vehicle_map = {row.id: str(row.vehicle_type.value if hasattr(row.vehicle_type, "value") else row.vehicle_type) for row in vehicle_rows}
        aggregates = {vehicle_id: _VehicleAggregate(vehicle_id=vehicle_id, vehicle_type=vehicle_type) for vehicle_id, vehicle_type in vehicle_map.items()}

        fuel_rows = (
            await self.db.execute(
                select(
                    FuelSupply.vehicle_id,
                    func.max(FuelSupply.odometer_km).label("max_odometer"),
                    func.min(FuelSupply.odometer_km).label("min_odometer"),
                    func.sum(FuelSupply.liters).label("sum_liters"),
                    func.sum(func.coalesce(FuelSupply.total_amount, 0)).label("sum_fuel_cost"),
                    func.sum(case((FuelSupply.is_consumption_anomaly.is_(True), 1), else_=0)).label("anomalies_count"),
                )
                .where(FuelSupply.supplied_at >= period_start, FuelSupply.supplied_at <= period_end)
                .group_by(FuelSupply.vehicle_id)
            )
        ).all()
        for row in fuel_rows:
            item = aggregates.get(row.vehicle_id)
            if not item:
                continue
            km = float((row.max_odometer or 0) - (row.min_odometer or 0))
            item.total_km = max(km, 0.0)
            item.total_liters = float(row.sum_liters or 0)
            item.fuel_cost = float(row.sum_fuel_cost or 0)
            item.anomalies_count = int(row.anomalies_count or 0)

        maint_rows = (
            await self.db.execute(
                select(MaintenanceRecord.vehicle_id, func.sum(MaintenanceRecord.total_cost).label("sum_cost"))
                .where(MaintenanceRecord.start_date >= period_start, MaintenanceRecord.start_date <= period_end)
                .group_by(MaintenanceRecord.vehicle_id)
            )
        ).all()
        for row in maint_rows:
            item = aggregates.get(row.vehicle_id)
            if item:
                item.maintenance_cost = float(row.sum_cost or 0)

        fine_rows = (
            await self.db.execute(
                select(Fine.vehicle_id, func.sum(Fine.amount).label("sum_cost"))
                .where(Fine.infraction_date >= period_start.date(), Fine.infraction_date <= period_end.date())
                .group_by(Fine.vehicle_id)
            )
        ).all()
        for row in fine_rows:
            item = aggregates.get(row.vehicle_id)
            if item:
                item.fines_cost = float(row.sum_cost or 0)

        type_consumptions: dict[str, list[float]] = defaultdict(list)
        type_tco: dict[str, list[float]] = defaultdict(list)

        per_vehicle_metrics: dict[UUID, tuple[float | None, float | None]] = {}
        for vehicle_id, agg in aggregates.items():
            consumption = calculate_consumption_l_100km(agg.total_liters, agg.total_km)
            tco = calculate_tco_per_km(agg.fuel_cost, agg.maintenance_cost, agg.fines_cost, agg.total_km)
            per_vehicle_metrics[vehicle_id] = (consumption, tco)
            if consumption is not None:
                type_consumptions[agg.vehicle_type].append(consumption)
            if tco is not None:
                type_tco[agg.vehicle_type].append(tco)

        snapshots: list[FleetAnalyticsSnapshot] = []
        for vehicle_id, agg in aggregates.items():
            consumption, tco = per_vehicle_metrics[vehicle_id]
            avg_consumption = (
                sum(type_consumptions[agg.vehicle_type]) / len(type_consumptions[agg.vehicle_type]) if type_consumptions[agg.vehicle_type] else None
            )
            avg_tco = sum(type_tco[agg.vehicle_type]) / len(type_tco[agg.vehicle_type]) if type_tco[agg.vehicle_type] else None
            snapshots.append(
                FleetAnalyticsSnapshot(
                    period_start=period_start,
                    period_end=period_end,
                    scope="VEHICLE",
                    vehicle_id=vehicle_id,
                    vehicle_type=agg.vehicle_type,
                    total_km=agg.total_km,
                    total_liters=agg.total_liters,
                    fuel_cost=Decimal(str(round(agg.fuel_cost, 2))),
                    maintenance_cost=Decimal(str(round(agg.maintenance_cost, 2))),
                    fines_cost=Decimal(str(round(agg.fines_cost, 2))),
                    consumption_l_100km=consumption,
                    tco_cost_per_km=tco,
                    anomalies_count=agg.anomalies_count,
                    category_average_consumption=avg_consumption,
                    category_average_tco=avg_tco,
                    market_benchmark_tco=MARKET_TCO_BENCHMARK_BY_TYPE.get(agg.vehicle_type, avg_tco),
                )
            )

        driver_rows = (
            await self.db.execute(select(Driver.id, Driver.nome_completo).where(Driver.ativo.is_(True)))
        ).all()
        for driver in driver_rows:
            fines_count = int(
                (
                    await self.db.execute(
                        select(func.count(Fine.id)).where(
                            Fine.driver_id == driver.id,
                            Fine.infraction_date >= period_start.date(),
                            Fine.infraction_date <= period_end.date(),
                        )
                    )
                ).scalar_one()
                or 0
            )
            claims_count = int(
                (
                    await self.db.execute(
                        select(func.count(Claim.id)).where(
                            Claim.driver_id == driver.id,
                            Claim.data_ocorrencia >= period_start,
                            Claim.data_ocorrencia <= period_end,
                        )
                    )
                ).scalar_one()
                or 0
            )
            anomalies_count = int(
                (
                    await self.db.execute(
                        select(func.count(FuelSupply.id)).where(
                            FuelSupply.driver_id == driver.id,
                            FuelSupply.supplied_at >= period_start,
                            FuelSupply.supplied_at <= period_end,
                            FuelSupply.is_consumption_anomaly.is_(True),
                        )
                    )
                ).scalar_one()
                or 0
            )

            raw_score = calculate_driver_risk_score(
                fines_count=fines_count,
                claims_count=claims_count,
                anomalies_count=anomalies_count,
            )
            normalized = min(round(raw_score * 10, 2), 100)
            snapshots.append(
                FleetAnalyticsSnapshot(
                    period_start=period_start,
                    period_end=period_end,
                    scope="DRIVER",
                    driver_id=driver.id,
                    vehicle_type="N/A",
                    total_km=0,
                    total_liters=0,
                    fuel_cost=Decimal("0"),
                    maintenance_cost=Decimal("0"),
                    fines_cost=Decimal("0"),
                    driver_risk_score=normalized,
                    anomalies_count=anomalies_count,
                    notes=driver.nome_completo,
                    extra_payload={
                        "fines_count": fines_count,
                        "claims_count": claims_count,
                        "anomalies_count": anomalies_count,
                        "raw_score": raw_score,
                    },
                )
            )

        if not snapshots:
            return []

        await self.analytics_repo.replace_period_snapshots(period_start=period_start, period_end=period_end, items=snapshots)
        await self.db.commit()
        return snapshots

    async def overview(self, period_days: int) -> dict:
        snapshots = await self._ensure_snapshots(period_days)
        vehicle_rows = self._unique_vehicle_snapshots(snapshots)
        insights = self._build_insights(vehicle_rows, self._unique_driver_snapshots(snapshots))
        consumptions = [item.consumption_l_100km for item in vehicle_rows if item.consumption_l_100km is not None]
        tcos = [item.tco_cost_per_km for item in vehicle_rows if item.tco_cost_per_km is not None]

        return {
            "period_days": period_days,
            "fleet_active": len(vehicle_rows),
            "average_consumption_l_100km": round(sum(consumptions) / len(consumptions), 2) if consumptions else 0,
            "average_tco_per_km": round(sum(tcos) / len(tcos), 2) if tcos else 0,
            "active_alerts": len(insights),
            "generated_at": datetime.now(timezone.utc),
        }

    async def efficiency(self, period_days: int, vehicle_type: str | None = None) -> list[dict]:
        rows = self._unique_vehicle_snapshots(await self._ensure_snapshots(period_days))
        if vehicle_type:
            rows = [row for row in rows if row.vehicle_type == vehicle_type]
        payload = []
        for row in rows:
            variance = calculate_variance_percentage(row.consumption_l_100km, row.category_average_consumption)
            payload.append(
                {
                    "vehicle_type": row.vehicle_type,
                    "vehicle_id": row.vehicle_id,
                    "total_km": row.total_km,
                    "total_liters": row.total_liters,
                    "consumption_l_100km": row.consumption_l_100km,
                    "category_average": row.category_average_consumption,
                    "variance_percentage": round(variance, 2) if variance is not None else None,
                }
            )
        return sorted(payload, key=lambda item: (item["variance_percentage"] or 0), reverse=True)

    async def tco(self, period_days: int, vehicle_type: str | None = None) -> list[dict]:
        rows = self._unique_vehicle_snapshots(await self._ensure_snapshots(period_days))
        if vehicle_type:
            rows = [row for row in rows if row.vehicle_type == vehicle_type]

        payload = []
        for row in rows:
            variance = calculate_variance_percentage(row.tco_cost_per_km, row.market_benchmark_tco)
            payload.append(
                {
                    "vehicle_type": row.vehicle_type,
                    "vehicle_id": row.vehicle_id,
                    "total_km": row.total_km,
                    "tco_cost_per_km": row.tco_cost_per_km,
                    "category_average": row.category_average_tco,
                    "market_benchmark": row.market_benchmark_tco,
                    "variance_percentage": round(variance, 2) if variance is not None else None,
                }
            )
        return sorted(payload, key=lambda item: (item["tco_cost_per_km"] or 0), reverse=True)

    async def driver_risk(self, period_days: int) -> list[dict]:
        rows = self._unique_driver_snapshots(await self._ensure_snapshots(period_days))
        payload = []
        for row in rows:
            extra = row.extra_payload or {}
            payload.append(
                {
                    "driver_id": row.driver_id,
                    "driver_name": row.notes or "Condutor",
                    "fines_count": int(extra.get("fines_count", 0)),
                    "claims_count": int(extra.get("claims_count", 0)),
                    "anomalies_count": int(extra.get("anomalies_count", 0)),
                    "risk_score": float(extra.get("raw_score", 0)),
                    "normalized_risk_score": row.driver_risk_score or 0,
                }
            )
        return sorted(payload, key=lambda item: item["normalized_risk_score"], reverse=True)

    def _build_insights(self, vehicle_rows: list[FleetAnalyticsSnapshot], driver_rows: list[FleetAnalyticsSnapshot]) -> list[dict]:
        insights: list[dict] = []
        now = datetime.now(timezone.utc)

        for row in vehicle_rows:
            variance = calculate_variance_percentage(row.consumption_l_100km, row.category_average_consumption)
            if variance is not None and abs(variance) > 20:
                severity = "HIGH" if abs(variance) >= 40 else "MEDIUM"
                insights.append(
                    {
                        "vehicle_id": row.vehicle_id,
                        "vehicle_type": row.vehicle_type,
                        "metric": "consumption_l_100km",
                        "current_value": round(row.consumption_l_100km or 0, 2),
                        "category_average": round(row.category_average_consumption or 0, 2),
                        "variance_percentage": round(variance, 2),
                        "severity": severity,
                        "message": (
                            f"Veículo tipo {row.vehicle_type} apresenta consumo {abs(variance):.1f}% "
                            f"{'superior' if variance > 0 else 'inferior'} a media da categoria "
                            f"({(row.category_average_consumption or 0):.1f} L/100km)."
                        ),
                        "recommended_action": "Agendar inspecao mecanica preventiva",
                        "generated_at": now,
                    }
                )

            tco_var = calculate_variance_percentage(row.tco_cost_per_km, row.market_benchmark_tco)
            if tco_var is not None and abs(tco_var) > 30:
                insights.append(
                    {
                        "vehicle_id": row.vehicle_id,
                        "vehicle_type": row.vehicle_type,
                        "metric": "tco_cost_per_km",
                        "current_value": round(row.tco_cost_per_km or 0, 2),
                        "category_average": round(row.market_benchmark_tco or 0, 2),
                        "variance_percentage": round(tco_var, 2),
                        "severity": "HIGH" if abs(tco_var) >= 50 else "MEDIUM",
                        "message": (
                            f"TCO por km de {row.vehicle_type} esta {abs(tco_var):.1f}% fora do benchmark "
                            f"de mercado ({(row.market_benchmark_tco or 0):.2f}/km)."
                        ),
                        "recommended_action": "Revisar plano de custos e manutencao",
                        "generated_at": now,
                    }
                )

        for row in driver_rows:
            if (row.driver_risk_score or 0) >= 70:
                extra = row.extra_payload or {}
                insights.append(
                    {
                        "driver_id": row.driver_id,
                        "vehicle_id": None,
                        "vehicle_type": "N/A",
                        "metric": "driver_risk_score",
                        "current_value": round(row.driver_risk_score or 0, 2),
                        "category_average": 70,
                        "variance_percentage": round((row.driver_risk_score or 0) - 70, 2),
                        "severity": "CRITICAL" if (row.driver_risk_score or 0) >= 85 else "HIGH",
                        "message": (
                            f"Condutor {row.notes or ''} com score de risco {row.driver_risk_score:.1f}/100 "
                            f"(multas={extra.get('fines_count', 0)}, sinistros={extra.get('claims_count', 0)}, anomalias={extra.get('anomalies_count', 0)})."
                        ),
                        "recommended_action": "Aplicar treinamento de direcao defensiva e monitoramento semanal",
                        "generated_at": now,
                    }
                )

        severity_rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}
        return sorted(insights, key=lambda item: severity_rank.get(item["severity"], 99))

    async def insights(self, period_days: int) -> list[dict]:
        rows = await self._ensure_snapshots(period_days)
        return self._build_insights(
            self._unique_vehicle_snapshots(rows),
            self._unique_driver_snapshots(rows),
        )


    async def costs_trend(self, months: int = 12, vehicle_type: str | None = None) -> list[dict]:
        now = datetime.now(timezone.utc)
        month_end = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        timeline: list[dict] = []

        for offset in range(months - 1, -1, -1):
            month_start = (month_end - timedelta(days=offset * 31)).replace(day=1)
            next_month = (month_start + timedelta(days=32)).replace(day=1)

            vehicle_filter = []
            if vehicle_type:
                vehicle_filter = [Vehicle.vehicle_type == vehicle_type]

            fuel_stmt = select(func.sum(func.coalesce(FuelSupply.total_amount, 0))).where(
                FuelSupply.supplied_at >= month_start,
                FuelSupply.supplied_at < next_month,
            )
            maint_stmt = select(func.sum(func.coalesce(MaintenanceRecord.total_cost, 0))).where(
                MaintenanceRecord.start_date >= month_start,
                MaintenanceRecord.start_date < next_month,
            )
            fine_stmt = select(func.sum(func.coalesce(Fine.amount, 0))).where(
                Fine.infraction_date >= month_start.date(),
                Fine.infraction_date < next_month.date(),
            )

            if vehicle_filter:
                fuel_stmt = fuel_stmt.join(Vehicle, Vehicle.id == FuelSupply.vehicle_id).where(*vehicle_filter)
                maint_stmt = maint_stmt.join(Vehicle, Vehicle.id == MaintenanceRecord.vehicle_id).where(*vehicle_filter)
                fine_stmt = fine_stmt.join(Vehicle, Vehicle.id == Fine.vehicle_id).where(*vehicle_filter)

            fuel_cost = float((await self.db.execute(fuel_stmt)).scalar_one() or 0)
            maintenance_cost = float((await self.db.execute(maint_stmt)).scalar_one() or 0)
            fines_cost = float((await self.db.execute(fine_stmt)).scalar_one() or 0)
            total_cost = fuel_cost + maintenance_cost + fines_cost

            timeline.append(
                {
                    "month": month_start.strftime("%m/%Y"),
                    "fuel_cost": round(fuel_cost, 2),
                    "maintenance_cost": round(maintenance_cost, 2),
                    "fines_cost": round(fines_cost, 2),
                    "total_cost": round(total_cost, 2),
                }
            )

        return timeline

    async def export(self, period_days: int, export_format: str) -> Response:
        if export_format not in {"pdf", "xlsx"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de exportacao suportado: pdf ou xlsx")

        insights = await self.insights(period_days)
        timestamp = datetime.now(timezone.utc)
        if export_format == "xlsx":
            headers = "metric,severity,current_value,category_average,variance_percentage,recommended_action\n"
            lines = [
                f"{item['metric']},{item['severity']},{item['current_value']},{item.get('category_average','')},{item.get('variance_percentage','')},{item['recommended_action']}"
                for item in insights
            ]
            content = (headers + "\n".join(lines)).encode("utf-8")
            return Response(
                content=content,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename=analytics-{period_days}d.xlsx"},
            )

        pdf_text = io.StringIO()
        pdf_text.write("Relatorio de Analytics da Frota\n")
        pdf_text.write(f"Periodo: ultimos {period_days} dias\n")
        pdf_text.write(f"Gerado em: {timestamp.isoformat()}\n\n")
        for item in insights:
            pdf_text.write(f"[{item['severity']}] {item['metric']} - {item['message']}\n")

        body = pdf_text.getvalue().encode("utf-8")
        return Response(
            content=body,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=analytics-{period_days}d.pdf"},
        )
