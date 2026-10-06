from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from app.models.fuel_supply import FuelSupply
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.location_history import LocationHistory
from app.models.master_data import Allocation, Department
from app.models.possession import VehiclePossession
from app.models.possession_trip import VehiclePossessionTrip, VehiclePossessionTripStatus
from app.models.user import UserRole
from app.models.vehicle import Vehicle
from app.models.vehicle_loan import VehicleLoan, VehicleLoanEvent
from app.schemas.common import build_pagination
from app.schemas.vehicle_loan import LoanOut
from app.services.audit_service import AuditService


def conflict(code, message, **context):
    raise HTTPException(409, detail={'code': code, 'message': message, **context})


LOAN_SUGGESTION_CONTEXTS = {
    'CREATED': 'loan_create',
    'RECTIFIED': 'loan_proposal',
    'SUBMITTED': 'loan_submit',
    'RECEIPT_ACCEPTED': 'loan_accept',
    'REJECTED': 'loan_reject',
    'CANCELLED': 'loan_cancel',
    'RETURN_SUBMITTED': 'loan_request-return',
    'RETURN_ACCEPTED': 'loan_accept-return',
    'RETURN_REJECTED': 'loan_reject-return',
    'RETURN_CANCELLED': 'loan_cancel-return',
}


class VehicleLoanService:
    def __init__(self, db):
        self.db = db

    @asynccontextmanager
    async def mutation(self):
        try:
            yield
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            conflict('LOAN_CONFLICT', 'O registro mudou ou conflita com outro empréstimo. Atualize a consulta.')
        except Exception:
            await self.db.rollback()
            raise

    def is_admin(self, user):
        return user.role == UserRole.ADMIN

    def visible(self, loan, user):
        if not self.is_admin(user) and (user.role != UserRole.PRODUCAO or not user.organization_id
                or user.organization_id not in (loan.origin_organization_id, loan.recipient_organization_id)):
            raise HTTPException(404, 'Empréstimo não encontrado')

    def actor(self, user, data, organization_id):
        if data.acting_organization_id != organization_id:
            raise HTTPException(403, 'Esta ação pertence à outra secretaria')
        if self.is_admin(user):
            if not data.justification:
                raise HTTPException(422, 'Administrador deve justificar a representação da secretaria')
        elif user.role != UserRole.PRODUCAO or user.organization_id != organization_id:
            raise HTTPException(403, 'Você não representa a secretaria responsável por esta ação')

    async def locked_vehicle(self, vehicle_id):
        vehicle = await self.db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id)
            .with_for_update().execution_options(populate_existing=True))
        if vehicle is None:
            raise HTTPException(404, 'Veículo não encontrado')
        return vehicle

    async def get(self, loan_id, user, *, lock=False):
        # All writers lock vehicle -> loan -> location, in that order.
        loan = await self.db.get(VehicleLoan, loan_id)
        if loan is None:
            raise HTTPException(404, 'Empréstimo não encontrado')
        self.visible(loan, user)
        if lock:
            await self.locked_vehicle(loan.vehicle_id)
            loan = await self.db.scalar(select(VehicleLoan).where(VehicleLoan.id == loan_id)
                .with_for_update().execution_options(populate_existing=True))
            self.visible(loan, user)
        return loan

    async def list(self, user, *, page=1, limit=20, vehicle_id=None, status=None, search=None, direction=None):
        filters = []
        if not self.is_admin(user):
            if user.role != UserRole.PRODUCAO or not user.organization_id:
                return {'data': [], 'pagination': build_pagination(page, limit, 0)}
            filters.append(or_(VehicleLoan.origin_organization_id == user.organization_id,
                               VehicleLoan.recipient_organization_id == user.organization_id))
        if direction and user.organization_id:
            field = VehicleLoan.origin_organization_id if direction == 'sent' else VehicleLoan.recipient_organization_id
            filters.append(field == user.organization_id)
        if search and search.strip():
            term = search.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
            filters.append(VehicleLoan.vehicle_id.in_(select(Vehicle.id).where(Vehicle.plate.ilike('%' + term + '%', escape='\\'))))
        if vehicle_id:
            filters.append(VehicleLoan.vehicle_id == vehicle_id)
        if status:
            filters.append(VehicleLoan.status == status)
        total = await self.db.scalar(select(func.count()).select_from(VehicleLoan).where(*filters))
        rows = (await self.db.scalars(select(VehicleLoan).where(*filters)
            .order_by(VehicleLoan.created_at.desc(), VehicleLoan.id.desc()).offset((page - 1) * limit).limit(limit))).all()
        return {'data': [LoanOut.model_validate(row) for row in rows], 'pagination': build_pagination(page, limit, total)}

    async def events(self, loan_id, user):
        await self.get(loan_id, user)
        return (await self.db.scalars(select(VehicleLoanEvent).where(VehicleLoanEvent.loan_id == loan_id)
            .order_by(VehicleLoanEvent.created_at, VehicleLoanEvent.id))).all()

    async def pending_summary(self, user):
        """Unresolved incoming handoffs; viewing them never acknowledges them."""
        receipts = VehicleLoan.status == 'AWAITING_RECEIPT'
        returns = VehicleLoan.status == 'AWAITING_RETURN_RECEIPT'
        if not self.is_admin(user):
            if user.role != UserRole.PRODUCAO or not user.organization_id:
                return {'total': 0, 'receipts': 0, 'returns': 0}
            receipts = and_(receipts, VehicleLoan.recipient_organization_id == user.organization_id)
            returns = and_(returns, VehicleLoan.origin_organization_id == user.organization_id)
        row = (await self.db.execute(select(func.count().filter(receipts), func.count().filter(returns))
            .select_from(VehicleLoan))).one()
        return {'total': row[0] + row[1], 'receipts': row[0], 'returns': row[1]}

    async def allocation(self, allocation_id, organization_id=None):
        allocation = await self.db.scalar(select(Allocation).where(Allocation.id == allocation_id)
            .options(joinedload(Allocation.department).joinedload(Department.organization)))
        if allocation is None:
            raise HTTPException(422, 'Lotação não encontrada')
        if organization_id and allocation.organization_id != organization_id:
            raise HTTPException(422, 'A lotação não pertence à secretaria indicada')
        return allocation

    async def current_location(self, vehicle_id):
        rows = (await self.db.scalars(select(LocationHistory).where(LocationHistory.vehicle_id == vehicle_id,
            LocationHistory.end_date.is_(None)).with_for_update())).all()
        if len(rows) != 1 or not rows[0].allocation_id:
            conflict('LOCATION_REVIEW_REQUIRED', 'Revise a lotação atual do veículo antes de continuar.')
        return rows[0], await self.allocation(rows[0].allocation_id)

    def version(self, loan, data, allowed):
        if loan.version != data.expected_version:
            conflict('LOAN_VERSION_CONFLICT', 'A proposta foi alterada. Consulte a versão atual antes de confirmar.', current_version=loan.version)
        if loan.status not in allowed:
            conflict('LOAN_INVALID_STATE', 'A ação não está disponível na situação atual.', current_status=loan.status)

    async def blockers(self, vehicle_id):
        possessions = await self.db.scalar(select(func.count()).select_from(VehiclePossession).where(
            VehiclePossession.vehicle_id == vehicle_id, VehiclePossession.end_date.is_(None)))
        trips = await self.db.scalar(select(func.count()).select_from(VehiclePossessionTrip)
            .join(VehiclePossession, VehiclePossession.id == VehiclePossessionTrip.possession_id).where(
                VehiclePossession.vehicle_id == vehicle_id, VehiclePossessionTrip.status == VehiclePossessionTripStatus.EM_ANDAMENTO))
        orders = await self.db.scalar(select(func.count()).select_from(FuelSupplyOrder).where(
            FuelSupplyOrder.vehicle_id == vehicle_id, FuelSupplyOrder.status == FuelSupplyOrderStatus.OPEN))
        return {'open_possessions': possessions, 'open_trips': trips, 'open_fuel_orders': orders}

    async def require_clear(self, vehicle_id):
        blockers = await self.blockers(vehicle_id)
        if any(blockers.values()):
            conflict('LOAN_PENDING_OPERATIONS', 'Encerre as posses e rotas e resolva as ordens de abastecimento abertas.', blockers=blockers)

    async def minimum_odometer(self, loan, returning=False):
        if not returning:
            value = await self.db.scalar(select(VehiclePossession.end_odometer_km).where(
                VehiclePossession.vehicle_id == loan.vehicle_id, VehiclePossession.end_date <= datetime.now(timezone.utc),
                VehiclePossession.end_odometer_km.is_not(None)).order_by(VehiclePossession.end_date.desc(),
                VehiclePossession.created_at.desc(), VehiclePossession.id.desc()).limit(1))
            return Decimal(str(value)) if value is not None else Decimal('0')
        values = [loan.delivery_odometer_km or 0]
        values.append(await self.db.scalar(select(func.max(VehiclePossession.end_odometer_km)).where(
            VehiclePossession.vehicle_id == loan.vehicle_id, VehiclePossession.end_date >= loan.started_at)))
        values.append(await self.db.scalar(select(func.max(VehiclePossessionTrip.end_odometer_km))
            .join(VehiclePossession, VehiclePossession.id == VehiclePossessionTrip.possession_id).where(
                VehiclePossession.vehicle_id == loan.vehicle_id, VehiclePossessionTrip.return_at >= loan.started_at,
                VehiclePossessionTrip.status == VehiclePossessionTripStatus.ENCERRADA)))
        values.append(await self.db.scalar(select(func.max(FuelSupply.odometer_km)).where(
            FuelSupply.vehicle_id == loan.vehicle_id, FuelSupply.supplied_at >= loan.started_at)))
        return max(Decimal(str(value)) for value in values if value is not None)

    async def check_delivery(self, loan):
        if loan.delivery_odometer_km is None or not loan.delivery_condition:
            raise HTTPException(422, 'Informe o odômetro e as condições de entrega')
        if loan.expected_return_at and loan.expected_return_at <= datetime.now(timezone.utc):
            raise HTTPException(422, 'A previsão de devolução deve estar no futuro ou ficar vazia')
        minimum = await self.minimum_odometer(loan)
        if loan.delivery_odometer_km < minimum:
            conflict('LOAN_ODOMETER_REVIEW', 'O odômetro de entrega está abaixo do último encerramento.', minimum_odometer_km=str(minimum))

    async def check_return(self, loan):
        with self.db.no_autoflush:
            minimum = await self.minimum_odometer(loan, returning=True)
        if loan.return_odometer_km is None or loan.return_odometer_km < minimum:
            conflict('LOAN_ODOMETER_REVIEW', 'Revise o odômetro de devolução de acordo com os registros do período.', minimum_odometer_km=str(minimum))

    async def no_other_loan(self, vehicle_id, exclude_id=None):
        conditions = [VehicleLoan.vehicle_id == vehicle_id,
                      VehicleLoan.status.in_(('AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT'))]
        if exclude_id:
            conditions.append(VehicleLoan.id != exclude_id)
        if await self.db.scalar(select(VehicleLoan.id).where(*conditions).limit(1)):
            conflict('LOAN_ALREADY_IN_PROGRESS', 'O veículo já possui empréstimo em andamento.')

    async def event(self, loan, kind, user, data, before=None, effective_at=None):
        details = {'version': loan.version, 'before': before, 'after': LoanOut.model_validate(loan).model_dump(mode='json')}
        self.db.add(VehicleLoanEvent(loan_id=loan.id, event_type=kind, actor_user_id=user.id,
            represented_organization_id=data.acting_organization_id, justification=data.justification,
            effective_at=effective_at, details=details))
        await AuditService(self.db).record(actor=user, action=f'LOAN_{kind}', entity_type='VEHICLE_LOAN',
            entity_id=loan.id, entity_label=str(loan.id), details=details, suggestion_context=LOAN_SUGGESTION_CONTEXTS[kind], suggestion_text=data.justification)

    async def create(self, data, user):
        async with self.mutation():
            vehicle = await self.locked_vehicle(data.vehicle_id)
            if vehicle.owner_organization_id is None:
                conflict('LOAN_OWNER_REQUIRED', 'Defina a secretaria de origem do veículo antes do empréstimo.')
            self.actor(user, data, vehicle.owner_organization_id)
            await self.no_other_loan(vehicle.id)
            location, origin = await self.current_location(vehicle.id)
            if origin.organization_id != vehicle.owner_organization_id:
                conflict('LOAN_LOCATION_MISMATCH', 'Regularize a lotação: o veículo não está na secretaria de origem.')
            destination = await self.allocation(data.destination_allocation_id)
            if destination.organization_id == vehicle.owner_organization_id:
                raise HTTPException(422, 'O empréstimo deve ser entre secretarias diferentes')
            loan = VehicleLoan(vehicle_id=vehicle.id, origin_organization_id=vehicle.owner_organization_id,
                recipient_organization_id=destination.organization_id, origin_allocation_id=location.allocation_id,
                destination_allocation_id=destination.id, reason=data.reason, expected_return_at=data.expected_return_at,
                delivery_odometer_km=data.delivery_odometer_km, delivery_condition=data.delivery_condition,
                created_by_user_id=user.id, status='DRAFT', version=1)
            self.db.add(loan)
            await self.db.flush()
            await self.event(loan, 'CREATED', user, data)
            return LoanOut.model_validate(loan)

    async def update(self, loan_id, data, user):
        async with self.mutation():
            loan = await self.get(loan_id, user, lock=True)
            self.actor(user, data, loan.origin_organization_id)
            self.version(loan, data, ('DRAFT', 'AWAITING_RECEIPT'))
            destination = await self.allocation(data.destination_allocation_id)
            if destination.organization_id == loan.origin_organization_id:
                raise HTTPException(422, 'O empréstimo deve ser entre secretarias diferentes')
            before = LoanOut.model_validate(loan).model_dump(mode='json')
            for field in ('destination_allocation_id', 'reason', 'expected_return_at', 'delivery_odometer_km', 'delivery_condition'):
                setattr(loan, field, getattr(data, field))
            loan.recipient_organization_id = destination.organization_id
            loan.status = 'DRAFT'
            loan.submitted_by_user_id = None
            loan.origin_representative_id = None
            loan.recipient_representative_id = None
            loan.version += 1
            loan.updated_at = datetime.now(timezone.utc)
            await self.event(loan, 'RECTIFIED', user, data, before)
            return LoanOut.model_validate(loan)

    async def move_location(self, loan, allocation_id, at):
        location, _ = await self.current_location(loan.vehicle_id)
        if location.start_date > at:
            conflict('LOAN_LOCATION_MISMATCH', 'A lotação atual tem data futura. Corrija-a antes do aceite.')
        allocation = await self.allocation(allocation_id)
        location.end_date = at
        self.db.add(LocationHistory(vehicle_id=loan.vehicle_id, allocation_id=allocation.id,
            department=allocation.display_name, justification=f'Empréstimo entre secretarias {loan.id}', start_date=at))

    async def transition(self, loan_id, operation, data, user):
        async with self.mutation():
            loan = await self.get(loan_id, user, lock=True)
            rules = {
                'submit': (('DRAFT',), loan.origin_organization_id, 'AWAITING_RECEIPT', 'SUBMITTED'),
                'accept': (('AWAITING_RECEIPT',), loan.recipient_organization_id, 'ACTIVE', 'RECEIPT_ACCEPTED'),
                'reject': (('AWAITING_RECEIPT',), loan.recipient_organization_id, 'REJECTED', 'REJECTED'),
                'cancel': (('DRAFT', 'AWAITING_RECEIPT'), loan.origin_organization_id, 'CANCELLED', 'CANCELLED'),
                'request-return': (('ACTIVE',), loan.recipient_organization_id, 'AWAITING_RETURN_RECEIPT', 'RETURN_SUBMITTED'),
                'accept-return': (('AWAITING_RETURN_RECEIPT',), loan.origin_organization_id, 'RETURNED', 'RETURN_ACCEPTED'),
                'reject-return': (('AWAITING_RETURN_RECEIPT',), loan.origin_organization_id, 'ACTIVE', 'RETURN_REJECTED'),
                'cancel-return': (('AWAITING_RETURN_RECEIPT',), loan.recipient_organization_id, 'ACTIVE', 'RETURN_CANCELLED'),
            }
            allowed, organization, next_status, event_type = rules[operation]
            self.actor(user, data, organization)
            self.version(loan, data, allowed)
            if operation in ('reject', 'cancel', 'reject-return', 'cancel-return') and not data.justification:
                raise HTTPException(422, 'Informe a justificativa da ação')
            before = LoanOut.model_validate(loan).model_dump(mode='json')
            now = datetime.now(timezone.utc)
            if operation in ('submit', 'accept'):
                await self.no_other_loan(loan.vehicle_id, loan.id)
                vehicle = await self.db.get(Vehicle, loan.vehicle_id)
                location, current = await self.current_location(loan.vehicle_id)
                if vehicle.owner_organization_id != loan.origin_organization_id or current.organization_id != loan.origin_organization_id:
                    conflict('LOAN_LOCATION_MISMATCH', 'A origem ou a lotação mudou. Revise a proposta.')
                await self.allocation(loan.destination_allocation_id, loan.recipient_organization_id)
                if location.allocation_id != loan.origin_allocation_id:
                    conflict('LOAN_LOCATION_MISMATCH', 'A lotação mudou desde a criação da proposta. Cancele e refaça o registro.')
                await self.check_delivery(loan)
                await self.require_clear(loan.vehicle_id)
                if operation == 'submit':
                    loan.submitted_by_user_id = user.id
                    loan.origin_representative_id = user.id
                else:
                    if user.id == loan.submitted_by_user_id:
                        conflict('LOAN_DISTINCT_ACCEPTOR_REQUIRED', 'O recebimento deve ser confirmado por outro usuário.')
                    loan.started_at = now
                    loan.recipient_representative_id = user.id
                    await self.move_location(loan, loan.destination_allocation_id, now)
            if operation in ('request-return', 'accept-return'):
                _, current = await self.current_location(loan.vehicle_id)
                if current.organization_id != loan.recipient_organization_id:
                    conflict('LOAN_LOCATION_MISMATCH', 'A lotação atual não corresponde à secretaria recebedora.')
                if operation == 'request-return':
                    await self.allocation(data.return_allocation_id, loan.origin_organization_id)
                    loan.return_allocation_id = data.return_allocation_id
                    loan.return_odometer_km = data.return_odometer_km
                    loan.return_condition = data.return_condition
                    loan.return_submitted_by_user_id = user.id
                else:
                    if user.id == loan.return_submitted_by_user_id:
                        conflict('LOAN_DISTINCT_ACCEPTOR_REQUIRED', 'A devolução deve ser recebida por outro usuário.')
                    await self.allocation(loan.return_allocation_id, loan.origin_organization_id)
                await self.check_return(loan)
                await self.require_clear(loan.vehicle_id)
                if operation == 'accept-return':
                    loan.returned_at = now
                    loan.status = next_status
                    await self.move_location(loan, loan.return_allocation_id, now)
            loan.status = next_status
            loan.version += 1
            loan.updated_at = now
            await self.event(loan, event_type, user, data, before,
                             now if operation in ('accept', 'accept-return') else None)
            if operation in ('accept', 'accept-return'):
                from app.services.vehicle_loan_document_service import create_handoff_document
                await create_handoff_document(self.db, loan, user, returning=operation == 'accept-return')
            return LoanOut.model_validate(loan)

    async def context(self, loan_id, user):
        loan = await self.get(loan_id, user)
        returning = loan.status in ('ACTIVE', 'AWAITING_RETURN_RECEIPT', 'RETURNED')
        return {'version': loan.version, 'blockers': await self.blockers(loan.vehicle_id),
                'minimum_odometer_km': str(await self.minimum_odometer(loan, returning=returning))}
