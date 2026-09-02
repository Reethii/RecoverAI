from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


# -----------------------------
# CUSTOMER
# -----------------------------

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True)
    phone = Column(String, nullable=True)

    payments = relationship(
        "Payment",
        back_populates="customer",
        cascade="all, delete-orphan"
    )

    recovery_logs = relationship(
        "RecoveryLog",
        back_populates="customer",
        cascade="all, delete-orphan"
    )


# -----------------------------
# PAYMENT
# -----------------------------

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)

    customer_id = Column(
        Integer,
        ForeignKey("customers.id"),
        nullable=False
    )

    amount = Column(Float, nullable=False)
    status = Column(String, nullable=False)
    failure_reason = Column(String, nullable=True)

    customer = relationship(
        "Customer",
        back_populates="payments"
    )

    recovery_logs = relationship(
        "RecoveryLog",
        back_populates="payment",
        cascade="all, delete-orphan"
    )


# -----------------------------
# RECOVERY LOG
# -----------------------------

class RecoveryLog(Base):
    __tablename__ = "recovery_logs"

    id = Column(Integer, primary_key=True, index=True)

    payment_id = Column(
        Integer,
        ForeignKey("payments.id"),
        nullable=False
    )

    customer_id = Column(
        Integer,
        ForeignKey("customers.id"),
        nullable=False
    )

    amount = Column(Float, nullable=False)

    risk = Column(String, nullable=False)
    action = Column(String, nullable=False)
    result = Column(String, nullable=False)
    reason = Column(String, nullable=True)

    payment = relationship(
        "Payment",
        back_populates="recovery_logs"
    )

    customer = relationship(
        "Customer",
        back_populates="recovery_logs"
    )