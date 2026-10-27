from decimal import Decimal
from uuid import uuid4
import pytest
from fastapi import HTTPException
from app.schemas.contract_item import ItemAmendmentCreate, OriginalItemComplement
from app.services.contract_amendment_service import limits_for


def base_item(code, q, price, accumulated=0, group='A'):
    return dict(id=code, description=code, group_key=group, original_quantity=Decimal(str(q)),
        reference_unit_price=Decimal(str(price)), accumulated_added_quantity=Decimal(str(accumulated)))


def test_fourth_term_uses_updated_original_base_and_each_item_not_document_number():
    items = [base_item('gas',130000,'6.54'), base_item('s500',82500,'6.32'), base_item('s10',87500,'6.53')]
    quantities = {'gas':Decimal(32500), 's500':Decimal(20625), 's10':Decimal(21875)}
    limits = limits_for(items, 'ITEM', quantities, {})
    assert sum(row['after'] for row in limits) == Decimal('485743.75')
    assert all(row['percent_after'] == 25 and not row['exceeded'] for row in limits)
    quantities['s10'] += Decimal('.001')
    assert limits_for(items, 'ITEM', quantities, {})[-1]['exceeded']


@pytest.mark.parametrize('mode,expected', [('ITEM',True),('GROUP',True),('GLOBAL',False)])
def test_adjudication_changes_base_without_netting_or_compounding(mode, expected):
    items = [base_item('a',100,10,20,'A'), base_item('b',100,10,0,'B')]
    rows = limits_for(items, mode, {'a':Decimal(10)}, {})
    assert any(r['exceeded'] for r in rows) == expected


def test_price_revision_revalues_existing_additions_but_does_not_add_quantities():
    row = limits_for([base_item('a',100,10,25)], 'ITEM', {}, {'a':Decimal(20)})[0]
    assert row['base'] == 2000 and row['after'] == 500 and row['percent_after'] == 25


def test_repricing_requires_explicit_financial_decision():
    with pytest.raises(ValueError, match='efeito financeiro'):
        ItemAmendmentCreate(number='1', change_types=['PRICE'], signed_at='2026-01-01', effective_date='2026-01-01',
            document_reference='Documento teste', notes='Justificativa conferida', request_key=uuid4())


def test_negative_accumulated_additions_are_rejected():
    with pytest.raises(HTTPException):
        limits_for([base_item('a',100,10,2)], 'ITEM', {'a':Decimal(-3)}, {})


def test_declared_financial_effect_cannot_default_to_zero():
    with pytest.raises(ValueError, match='explicitamente'):
        ItemAmendmentCreate(number='1', change_types=['PRICE'], price_reason='INDEX', price_financial_effect='DECLARED',
            signed_at='2026-01-01', effective_date='2026-01-01',document_reference='Documento teste',
            notes='Justificativa conferida',request_key=uuid4())


def original_complement_data(**patch):
    return dict(code='PECA-2', original_number='02', description='Peça original fictícia', category='PART', unit='UN',
        original_quantity='100', original_unit_price='12.345678', remaining_quantity='50', historical_added_quantity='0',
        document_reference='Contrato original, item 02', justification='Item original omitido do cadastro inicial',
        original_contract_confirmed=True, request_key=uuid4(), prices=[], **patch)


def test_original_complement_preserves_precision_and_requires_explicit_confirmation():
    data = OriginalItemComplement(**original_complement_data())
    assert data.original_unit_price == Decimal('12.345678')
    assert data.reference_unit_price is None
    assert data.remaining_quantity == 50
    with pytest.raises(ValueError, match='Confirme'):
        OriginalItemComplement(**{**original_complement_data(), 'original_contract_confirmed': False})


@pytest.mark.parametrize('patch', [
    {'remaining_quantity': '101'}, {'remaining_quantity': '-1'}, {'original_quantity': '0'},
    {'historical_added_quantity': '-1'}, {'original_unit_price': '1.1234567'},
    {'reference_unit_price': '20'}, {'value_delta': '1000'}, {'document_reference': ' '}, {'justification': 'curta'},
])
def test_original_complement_rejects_ambiguous_or_invalid_data(patch):
    with pytest.raises(ValueError):
        OriginalItemComplement(**{**original_complement_data(), **patch})


def test_original_complement_accepts_exhausted_quantity_and_refuses_duplicate_providers():
    data = OriginalItemComplement(**{**original_complement_data(), 'remaining_quantity': '0'})
    assert data.remaining_quantity == 0
    provider = uuid4()
    with pytest.raises(ValueError, match='cada executante'):
        OriginalItemComplement(**{**original_complement_data(), 'prices': [
            {'provider_id': provider, 'unit_price': '12.345678'}, {'provider_id': provider, 'unit_price': '12.345678'}]})
