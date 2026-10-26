from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import Integer, Numeric, String, create_engine, func, select, true
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.repositories import interactive_kpis as kpi


class Base(DeclarativeBase):
    pass


class Record(Base):
    __tablename__ = 'kpi_test_records'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))


@pytest.fixture
def dataset(monkeypatch):
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    def definitions(_module):
        return Record, [kpi.Indicator('total', 'Todos', true()),
            kpi.Indicator('open', 'Abertos', Record.status == 'open'),
            kpi.Indicator('amount', 'Valor informado', Record.amount.is_not(None), amount=Record.amount, unit='BRL')]
    monkeypatch.setattr(kpi, 'definitions', definitions)
    with engine.connect() as connection:
        connection.execute(Record.__table__.insert(), [
            *[dict(id=i, organization=1, status='closed', amount=None) for i in range(1, 11)],
            dict(id=11, organization=1, status='open', amount=Decimal('12.50')),
            dict(id=12, organization=1, status='open', amount=Decimal('7.25')),
            dict(id=13, organization=2, status='open', amount=Decimal('900.00')),
        ])
        calls=[]
        async def execute(statement):
            calls.append(statement)
            return connection.execute(statement)
        yield SimpleNamespace(info={}, execute=execute), connection, calls
    engine.dispose()


@pytest.mark.asyncio
async def test_aggregate_covers_other_pages_and_honors_scope_before_filter(dataset):
    db, connection, _ = dataset
    stmt = select(Record).where(Record.organization == 1)
    context = kpi.IndicatorRequest('test', 'open'); db.info[kpi.STATE_KEY] = context
    filtered = await kpi.populate_indicators(db, 'test', stmt)
    assert connection.execute(filtered.limit(1)).scalars().all() == [11]
    assert connection.execute(filtered.offset(1).limit(1)).scalars().all() == [12]
    assert context.result['population'] == 12
    assert [item['value'] for item in context.result['items']] == [12, 2, Decimal('19.75')]
    count = kpi.filter_indicator(db, 'test', select(func.count()).select_from(Record).where(Record.organization == 1))
    assert connection.execute(count).scalar_one() == 2


@pytest.mark.asyncio
async def test_selection_does_not_reduce_other_kpis_and_total_clears_only_indicator(dataset):
    db, connection, _ = dataset
    stmt = select(Record).where(Record.organization == 1)
    populations=[]
    for selected in ['open', 'amount', 'total']:
        context = kpi.IndicatorRequest('test', selected); db.info[kpi.STATE_KEY] = context
        result = await kpi.populate_indicators(db, 'test', stmt)
        populations.append(context.result['items'])
        ids = connection.execute(result).scalars().all()
        assert 13 not in ids
        assert len(ids) == (12 if selected == 'total' else 2)
    assert populations[0] == populations[1] == populations[2]


@pytest.mark.asyncio
async def test_empty_search_is_zero_and_preserves_numeric_units(dataset):
    db, _, _ = dataset
    context = kpi.IndicatorRequest('test', None); db.info[kpi.STATE_KEY] = context
    await kpi.populate_indicators(db, 'test', select(Record).where(Record.organization == 99))
    assert context.result['population'] == 0
    assert all(item['value'] == 0 for item in context.result['items'])
    assert context.result['items'][-1]['unit'] == 'BRL'


@pytest.mark.asyncio
async def test_context_is_opt_in_and_cannot_affect_another_repository(dataset):
    db, _, calls = dataset
    stmt = select(Record)
    assert await kpi.populate_indicators(db, 'test', stmt) is stmt
    db.info[kpi.STATE_KEY] = kpi.IndicatorRequest('test', 'open')
    assert await kpi.populate_indicators(db, 'another', stmt) is stmt
    assert kpi.filter_indicator(db, 'another', stmt) is stmt
    assert calls == []


def test_invalid_indicator_is_rejected_and_not_used_as_sql(dataset):
    with pytest.raises(HTTPException) as error:
        kpi.IndicatorRequest('test', 'open; DROP TABLE users')
    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_request_dependency_restores_previous_context_on_failure(dataset):
    db, _, _ = dataset
    previous=object(); db.info[kpi.STATE_KEY]=previous
    generator=kpi.indicator_context('test')(indicator='open', db=db)
    current=await anext(generator)
    assert db.info[kpi.STATE_KEY] is current
    with pytest.raises(RuntimeError): await generator.athrow(RuntimeError('controlled'))
    assert db.info[kpi.STATE_KEY] is previous


@pytest.mark.asyncio
async def test_empty_permission_scope_returns_zero_without_querying(dataset):
    from app.models.user import UserRole
    from app.services.fuel_supply_service import FuelSupplyService
    db, _, calls = dataset
    context=kpi.IndicatorRequest('test', None)
    user=SimpleNamespace(role=UserRole.PRODUCAO, organization_id=None)
    result=context.attach(await FuelSupplyService(db).list(page=1, limit=10, current_user=user))
    assert result.pagination.total == result.indicators['population'] == 0
    assert calls == []
