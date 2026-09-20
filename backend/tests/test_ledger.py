import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.user import User, Wallet
from app.services import ledger


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    user = User(email="t@t.com", password_hash="x", referral_code="ABC123")
    session.add(user)
    session.flush()
    session.add(Wallet(user_id=user.id))
    session.commit()
    yield session, user
    session.close()


def test_credit_and_balance(db):
    session, user = db
    ledger.post(session, user_id=user.id, kind="deposit", direction="credit",
                bucket="available", amount=100)
    session.commit()
    assert float(user.wallet.available) == 100


def test_debit_insufficient(db):
    session, user = db
    with pytest.raises(ledger.LedgerError):
        ledger.post(session, user_id=user.id, kind="withdrawal", direction="debit",
                    bucket="available", amount=50)


def test_move_between_buckets(db):
    session, user = db
    ledger.post(session, user_id=user.id, kind="deposit", direction="credit",
                bucket="available", amount=200)
    ledger.move(session, user_id=user.id, kind="investment", amount=80,
                from_bucket="available", to_bucket="invested")
    session.commit()
    assert float(user.wallet.available) == 120
    assert float(user.wallet.invested) == 80


def test_idempotency(db):
    session, user = db
    e1 = ledger.post_idempotent(session, idempotency_key="dep:1", user_id=user.id,
                                kind="deposit", direction="credit",
                                bucket="available", amount=50)
    e2 = ledger.post_idempotent(session, idempotency_key="dep:1", user_id=user.id,
                                kind="deposit", direction="credit",
                                bucket="available", amount=50)
    session.commit()
    assert e1.id == e2.id
    assert float(user.wallet.available) == 50
