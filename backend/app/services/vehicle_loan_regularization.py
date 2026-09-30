"""Explicit administrator registration; never rewrites prior operational attribution."""
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import hmac
import json

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.models.claim import Claim
from app.models.fine import Fine
from app.models.fuel_supply import FuelSupply
from app.models.fuel_supply_order import FuelSupplyOrder
from app.models.location_history import LocationHistory
from app.models.maintenance import MaintenanceRecord
from app.models.possession import VehiclePossession
from app.models.possession_trip import VehiclePossessionTrip
from app.models.user import UserRole
from app.models.vehicle import Vehicle
from app.models.vehicle_loan import VehicleLoan, VehicleLoanEvent
from app.schemas.vehicle_loan import LoanOut
from app.services.audit_service import AuditService
from app.services.operational_scope import occurred_at
from app.services.vehicle_loan_service import VehicleLoanService, conflict


def require_regularization_admin(user):
    if user.role != UserRole.ADMIN:
        raise HTTPException(403, 'Regularização retroativa restrita a administradores')


async def regularization_catalog(db, user):
    require_regularization_admin(user)
    from app.services.vehicle_loan_presentation import loan_catalog
    catalog = await loan_catalog(db, user)
    vehicles = (await db.scalars(select(Vehicle).order_by(Vehicle.plate))).all()
    catalog['vehicles'] = [{'id': v.id, 'plate': v.plate, 'owner_organization_id': v.owner_organization_id} for v in vehicles]
    return catalog


class VehicleLoanRegularizationService:
    def __init__(self, db):
        self.db = db
        self.loans = VehicleLoanService(db)

    async def inspect(self, data, user):
        require_regularization_admin(user)
        now = datetime.now(timezone.utc)
        vehicle = await self.loans.locked_vehicle(data.vehicle_id)
        origin = await self.loans.allocation(data.origin_allocation_id)
        destination = await self.loans.allocation(data.destination_allocation_id)
        if origin.organization_id == destination.organization_id:
            raise HTTPException(422, 'Origem e destino devem pertencer a secretarias diferentes')
        if data.return_allocation_id:
            await self.loans.allocation(data.return_allocation_id, origin.organization_id)
        blockers, warnings = [], []
        if data.started_at >= now or (data.returned_at and data.returned_at > now):
            blockers.append('As datas efetivas devem estar no passado.')
        if not data.returned_at and data.expected_return_at and data.expected_return_at <= now:
            warnings.append('O prazo previsto já passou; o empréstimo permanecerá em andamento até a devolução.')
        rows = (await self.db.scalars(select(VehicleLoan).where(VehicleLoan.vehicle_id == vehicle.id).order_by(VehicleLoan.id))).all()
        effective = [row for row in rows if row.started_at and row.status in ('ACTIVE', 'AWAITING_RETURN_RECEIPT', 'RETURNED')]
        if any((data.returned_at is None or row.started_at < data.returned_at)
               and (row.returned_at is None or row.returned_at > data.started_at) for row in effective):
            blockers.append('O período se sobrepõe a outro empréstimo efetivo do veículo.')
        if not data.returned_at and any(row.status in ('AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT') for row in rows):
            blockers.append('Já existe proposta enviada ou empréstimo em andamento; resolva o fluxo existente.')
        owner_change = vehicle.owner_organization_id != origin.organization_id
        if owner_change and not data.correct_owner:
            blockers.append('A origem informada difere do cadastro. Confirme explicitamente a correção da secretaria proprietária.')
        if owner_change and rows:
            blockers.append('A origem não pode ser corrigida por regularização quando já existem empréstimos ou propostas. Revise esses registros primeiro.')
        locations = (await self.db.scalars(select(LocationHistory).where(LocationHistory.vehicle_id == vehicle.id).order_by(LocationHistory.id))).all()
        current = [row for row in locations if row.end_date is None]
        target_location = None
        if not data.returned_at:
            if len(current) != 1 or not current[0].allocation_id:
                blockers.append('A lotação atual precisa ser única e identificada.')
            else:
                current_allocation = await self.loans.allocation(current[0].allocation_id)
                if current_allocation.organization_id not in (origin.organization_id, destination.organization_id):
                    blockers.append('O veículo está lotado em uma terceira secretaria; revise a situação atual.')
                if current[0].start_date > now:
                    blockers.append('A lotação atual tem início futuro; revise o histórico.')
                if current[0].allocation_id != destination.id:
                    target_location = str(destination.id)
            open_operations = await self.loans.blockers(vehicle.id)
            if any(open_operations.values()):
                blockers.append('Para regularizar um empréstimo em andamento, encerre posses e rotas e resolva ordens abertas.')
        else:
            open_operations = None
        boundaries = [data.started_at] + ([data.returned_at] if data.returned_at else [])
        impacts, evidence, readings = [], [], []
        for label, model in [('Posses', VehiclePossession), ('Abastecimentos', FuelSupply),
                             ('Ordens', FuelSupplyOrder), ('Manutenções', MaintenanceRecord), ('Sinistros', Claim), ('Multas', Fine)]:
            records = (await self.db.scalars(select(model).where(model.vehicle_id == vehicle.id).order_by(model.id))).all()
            selected = []
            for record in records:
                at = occurred_at(record)
                responsible = getattr(record, 'responsible_organization_id', None) or getattr(record, 'organization_id', None)
                evidence.append((label, str(record.id), str(getattr(record, 'updated_at', '')), str(at),
                                 str(responsible), str(getattr(record, 'vehicle_loan_id', None)),
                                 str(getattr(record, 'end_date', None)), str(getattr(record, 'status', None))))
                if data.started_at <= at and (data.returned_at is None or at < data.returned_at):
                    selected.append(responsible)
                if model == VehiclePossession:
                    if any(record.start_date < boundary and (record.end_date is None or record.end_date > boundary) for boundary in boundaries):
                        blockers.append('Há posse que atravessa a entrega ou devolução informada. Revise as datas e o histórico da posse.')
                    for date, km in ((record.start_date, record.start_odometer_km), (record.end_date, record.end_odometer_km)):
                        if date and km is not None:
                            readings.append((date, Decimal(str(km))))
                if model == FuelSupply and record.odometer_km is not None:
                    readings.append((record.supplied_at, Decimal(str(record.odometer_km))))
            impacts.append({'module': label, 'records': len(selected), 'without_responsibility': selected.count(None),
                            'other_responsibility': sum(value is not None and value != destination.organization_id for value in selected)})
        trips = (await self.db.scalars(select(VehiclePossessionTrip).join(VehiclePossession,
            VehiclePossession.id == VehiclePossessionTrip.possession_id).where(VehiclePossession.vehicle_id == vehicle.id)
            .order_by(VehiclePossessionTrip.id))).all()
        for trip in trips:
            evidence.append(('trip', str(trip.id), str(trip.updated_at), str(trip.return_at), str(trip.end_odometer_km)))
            if trip.status != 'CANCELADA' and any(trip.departure_at < boundary and (trip.return_at is None or trip.return_at > boundary) for boundary in boundaries):
                blockers.append('Há rota que atravessa a entrega ou devolução informada.')
            if trip.return_at and trip.end_odometer_km is not None and trip.status == 'ENCERRADA':
                readings.append((trip.return_at, Decimal(str(trip.end_odometer_km))))
        earlier = [entry for entry in readings if entry[0] <= data.started_at]
        if earlier and max(earlier, key=lambda entry: (entry[0], entry[1]))[1] > data.delivery_odometer_km:
            blockers.append('Odômetro de entrega inferior ao último registro anterior ao início informado.')
        inside = [km for at, km in readings if at >= data.started_at and (data.returned_at is None or at <= data.returned_at)]
        if inside and min(inside) < data.delivery_odometer_km:
            blockers.append('Há odômetro no período inferior à entrega informada; revise os registros.')
        if data.returned_at:
            if inside and max(inside) > data.return_odometer_km:
                blockers.append('Odômetro de devolução inferior a registro existente no período.')
            after = [entry for entry in readings if entry[0] >= data.returned_at]
            if after and min(after, key=lambda entry: (entry[0], entry[1]))[1] < data.return_odometer_km:
                blockers.append('Odômetro de devolução superior ao primeiro registro posterior ao período.')
        warnings.append('Registros antigos, custos, vínculos de secretaria e de empréstimo permanecerão como estão; nenhum será reatribuído automaticamente.')
        warnings.append('A recebedora terá acesso ao histórico compartilhado conforme as regras de empréstimos, até a devolução quando encerrado.')
        warnings.append('Não serão criados aceites, assinaturas ou termos com data retroativa. A inclusão administrativa será registrada agora.')
        if target_location:
            warnings.append('A lotação atual será alterada para o destino a partir do registro de hoje; o histórico anterior de lotação será preservado.')
        payload = data.model_dump(mode='json', exclude={'preview_token'})
        state = {'input': payload, 'actor': str(user.id), 'owner': str(vehicle.owner_organization_id),
                 'vehicle_updated': str(vehicle.updated_at), 'plate': vehicle.plate,
                 'allocations': [(str(a.id), str(a.organization_id), a.display_name) for a in (origin, destination)],
                 'loans': [LoanOut.model_validate(row).model_dump(mode='json') for row in rows],
                 'locations': [(str(row.id), str(row.allocation_id), str(row.start_date), str(row.end_date)) for row in locations],
                 'records': evidence, 'readings': sorted((str(at), str(km)) for at, km in readings),
                 'blockers': sorted(set(blockers))}
        token = hmac.new(settings.SECRET_KEY.encode(), json.dumps(state, sort_keys=True).encode(), hashlib.sha256).hexdigest()
        preview = {'can_confirm': not blockers, 'blockers': list(dict.fromkeys(blockers)), 'warnings': warnings,
                   'preview_token': token, 'vehicle_plate': vehicle.plate, 'status': 'RETURNED' if data.returned_at else 'ACTIVE',
                   'origin_name': origin.department.organization.name, 'recipient_name': destination.department.organization.name,
                   'owner_change': owner_change, 'current_owner_id': vehicle.owner_organization_id,
                   'location_change': bool(target_location), 'impact': impacts, 'open_operations': open_operations}
        return preview, vehicle, origin, destination

    async def preview(self, data, user):
        return (await self.inspect(data, user))[0]

    async def create(self, data, user):
        async with self.loans.mutation():
            preview, vehicle, origin, destination = await self.inspect(data, user)
            if not hmac.compare_digest(data.preview_token, preview['preview_token']):
                conflict('REGULARIZATION_REVIEW_CHANGED', 'Os dados ou registros envolvidos mudaram. Gere uma nova prévia antes de confirmar.')
            if not preview['can_confirm']:
                conflict('REGULARIZATION_BLOCKED', 'Resolva os impedimentos da prévia.', blockers=preview['blockers'])
            now = datetime.now(timezone.utc)
            before = {'owner_organization_id': str(vehicle.owner_organization_id) if vehicle.owner_organization_id else None}
            if preview['owner_change']:
                vehicle.owner_organization_id = origin.organization_id
                vehicle.updated_at = now
            loan = VehicleLoan(vehicle_id=vehicle.id, origin_organization_id=origin.organization_id,
                recipient_organization_id=destination.organization_id, origin_allocation_id=origin.id,
                destination_allocation_id=destination.id, return_allocation_id=data.return_allocation_id,
                status=preview['status'], version=1, reason=data.reason, started_at=data.started_at,
                returned_at=data.returned_at, expected_return_at=data.expected_return_at,
                delivery_odometer_km=data.delivery_odometer_km, return_odometer_km=data.return_odometer_km,
                delivery_condition=data.delivery_condition, return_condition=data.return_condition,
                created_by_user_id=user.id, created_at=now, updated_at=now, regularized_at=now,
                regularization_reference=data.document_reference)
            self.db.add(loan)
            await self.db.flush()
            if preview['location_change']:
                await self.loans.move_location(loan, destination.id, now)
            details = {'before': before, 'after': LoanOut.model_validate(loan).model_dump(mode='json'),
                       'preview': {key: value for key, value in preview.items() if key != 'preview_token'},
                       'operational_records_reassigned': False, 'historical_acceptance_created': False}
            from fastapi.encoders import jsonable_encoder
            details = jsonable_encoder(details)
            self.db.add(VehicleLoanEvent(loan_id=loan.id, event_type='REGULARIZED', actor_user_id=user.id,
                represented_organization_id=origin.organization_id, effective_at=data.started_at,
                created_at=now, justification=data.justification, details=details))
            await AuditService(self.db).record(actor=user, action='LOAN_REGULARIZED', entity_type='VEHICLE_LOAN',
                entity_id=loan.id, entity_label=str(loan.id), details=details)
            return LoanOut.model_validate(loan)
