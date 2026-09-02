from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Literal
import os

from dotenv import load_dotenv
from google import genai
from google.genai import types

import models
from database import engine, SessionLocal

# ============================================================
# GEMINI AI CONFIGURATION
# ============================================================

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

gemini_client = None

if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

GEMINI_MODEL = "gemini-3.6-flash"


# ============================================================
# GEMINI RESPONSE SCHEMA
# ============================================================

class GeminiPaymentAnalysis(BaseModel):
    risk: Literal["HIGH", "MEDIUM", "LOW"]
    recommendation: Literal[
        "RETRY PAYMENT",
        "SEND PAYMENT LINK",
        "REQUEST NEW PAYMENT METHOD",
        "NO ACTION"
    ]
    reason: str
    confidence: float
# ============================================================
# CREATE DATABASE TABLES
# ============================================================

models.Base.metadata.create_all(bind=engine)

# ============================================================
# GEMINI PAYMENT ANALYSIS
# ============================================================

def analyze_payment_with_gemini(payment, customer, payment_history):

    if not gemini_client:
        return None

    customer_name = customer.name if customer else "Unknown"
    customer_email = customer.email if customer else "Unknown"

    history_text = "\n".join(
        [
            f"Payment ID: {p.id}, "
            f"Amount: {p.amount}, "
            f"Status: {p.status}, "
            f"Failure: {p.failure_reason or 'None'}"
            for p in payment_history
        ]
    )

    prompt = f"""
You are RecoverAI, an AI revenue recovery analyst.

Analyze ONE failed payment and determine the safest recovery recommendation.

IMPORTANT RULES:
- Use only the information provided below.
- Do not invent customer information.
- Do not authorize refunds.
- Do not capture or move money.
- Do not recommend unlimited retries.
- Only choose one of the allowed recommendations.
- Consider the customer's previous payment history.
- Consider whether the failure appears temporary or requires customer action.
- Give a concise explanation.

Allowed recommendations:
1. RETRY PAYMENT
2. SEND PAYMENT LINK
3. REQUEST NEW PAYMENT METHOD
4. NO ACTION

CURRENT PAYMENT:
Payment ID: {payment.id}
Customer ID: {payment.customer_id}
Customer Name: {customer_name}
Customer Email: {customer_email}
Amount: {payment.amount}
Status: {payment.status}
Failure Reason: {payment.failure_reason or "Unknown"}

CUSTOMER PAYMENT HISTORY:
{history_text}

Return your analysis using the required JSON structure.
"""

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeminiPaymentAnalysis,
            ),
        )

        result = response.parsed

        if result:
            return result.model_dump()

        return None

    except Exception as e:
        print("Gemini analysis failed:", e)
        return None
# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="RecoverAI API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATABASE CONNECTION
# ============================================================

def get_db():
    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()


# ============================================================
# DATA SCHEMAS
# ============================================================

class CustomerCreate(BaseModel):
    name: str
    email: str
    phone: str | None = None


class PaymentCreate(BaseModel):
    customer_id: int
    amount: float
    status: str
    failure_reason: str | None = None


# ============================================================
# HOME
# ============================================================

@app.get("/")
def home():

    return {
        "message": "RecoverAI API is running!",
        "status": "success"
    }


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health():

    return {
        "status": "healthy"
    }


# ============================================================
# DATABASE STATUS
# ============================================================

@app.get("/database-status")
def database_status(
    db: Session = Depends(get_db)
):

    return {
        "database": "connected",
        "status": "success"
    }


# ============================================================
# CREATE CUSTOMER
# ============================================================

@app.post("/customers")
def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db)
):

    new_customer = models.Customer(
        name=customer.name,
        email=customer.email,
        phone=customer.phone
    )

    db.add(new_customer)
    db.commit()
    db.refresh(new_customer)

    return {

        "message": "Customer created successfully",

        "customer": {

            "id": new_customer.id,
            "name": new_customer.name,
            "email": new_customer.email,
            "phone": new_customer.phone
        }
    }


# ============================================================
# GET ALL CUSTOMERS
# ============================================================

@app.get("/customers")
def get_customers(
    db: Session = Depends(get_db)
):

    customers = db.query(
        models.Customer
    ).all()

    return {

        "count": len(customers),

        "customers": [

            {
                "id": customer.id,
                "name": customer.name,
                "email": customer.email,
                "phone": customer.phone
            }

            for customer in customers
        ]
    }


# ============================================================
# CREATE PAYMENT
# ============================================================

@app.post("/payments")
def create_payment(
    payment: PaymentCreate,
    db: Session = Depends(get_db)
):

    # Check whether customer exists

    customer = db.query(
        models.Customer
    ).filter(
        models.Customer.id == payment.customer_id
    ).first()


    if not customer:

        return {

            "status": "error",
            "message": "Customer not found"
        }


    # Create payment

    new_payment = models.Payment(

        customer_id=payment.customer_id,

        amount=payment.amount,

        status=payment.status.upper(),

        failure_reason=payment.failure_reason
    )


    db.add(new_payment)

    db.commit()

    db.refresh(new_payment)


    return {

        "message": "Payment created successfully",

        "payment": {

            "id": new_payment.id,

            "customer_id": new_payment.customer_id,

            "amount": new_payment.amount,

            "status": new_payment.status,

            "failure_reason": new_payment.failure_reason
        }
    }


# ============================================================
# GET ALL PAYMENTS
# ============================================================

@app.get("/payments")
def get_payments(
    db: Session = Depends(get_db)
):

    payments = db.query(
        models.Payment
    ).all()


    return {

        "count": len(payments),

        "payments": [

            {

                "id": payment.id,

                "customer_id": payment.customer_id,

                "amount": payment.amount,

                "status": payment.status,

                "failure_reason": payment.failure_reason
            }

            for payment in payments
        ]
    }


# ============================================================
# RECOVERY ANALYSIS
# ============================================================

@app.get("/payments/{payment_id}/analyze")
def analyze_payment(

    payment_id: int,

    db: Session = Depends(get_db)
):

    # Find payment

    payment = db.query(
        models.Payment
    ).filter(
        models.Payment.id == payment_id
    ).first()


    if not payment:

        return {

            "status": "error",

            "message": "Payment not found"
        }


    # --------------------------------------------------------
    # SUCCESSFUL PAYMENT
    # --------------------------------------------------------

    if payment.status.upper() == "SUCCESS":

        return {

            "status": "success",

            "payment_id": payment.id,

            "customer_id": payment.customer_id,

            "amount": payment.amount,

            "risk": "LOW",

            "recommendation": "NO ACTION",

            "reason": "Payment was successful"
        }


    # --------------------------------------------------------
    # FAILURE ANALYSIS
    # --------------------------------------------------------

    failure_reason = (
        payment.failure_reason or ""
    ).lower()


    # --------------------------------------------------------
    # GET CUSTOMER
    # --------------------------------------------------------

    customer = db.query(
        models.Customer
    ).filter(
        models.Customer.id == payment.customer_id
    ).first()


    # --------------------------------------------------------
    # GET CUSTOMER PAYMENT HISTORY
    # --------------------------------------------------------

    payment_history = db.query(
        models.Payment
    ).filter(
        models.Payment.customer_id == payment.customer_id
    ).all()


    # --------------------------------------------------------
    # GEMINI AI ANALYSIS
    # --------------------------------------------------------

    ai_result = analyze_payment_with_gemini(
        payment,
        customer,
        payment_history
    )

    if ai_result:
        return {
            "status": "success",
            "payment_id": payment.id,
            "customer_id": payment.customer_id,
            "amount": payment.amount,
            "failure_reason": payment.failure_reason,
            "risk": ai_result["risk"],
            "recommendation": ai_result["recommendation"],
            "reason": ai_result["reason"],
            "confidence": ai_result["confidence"],
            "ai_provider": "Gemini"
        }

    # --------------------------------------------------------
    # AI-STYLE DECISION ENGINE
    # --------------------------------------------------------

    if "insufficient" in failure_reason:

        risk = "HIGH"

        recommendation = "RETRY PAYMENT"

        reason = (
            "Customer may have insufficient "
            "balance temporarily."
        )


    elif "declined" in failure_reason:

        risk = "HIGH"

        recommendation = "SEND PAYMENT LINK"

        reason = (
            "The payment method was declined."
        )


    elif "expired" in failure_reason:

        risk = "MEDIUM"

        recommendation = (
            "REQUEST NEW PAYMENT METHOD"
        )

        reason = (
            "The customer's payment method "
            "may have expired."
        )


    elif "timeout" in failure_reason:

        risk = "MEDIUM"

        recommendation = "RETRY PAYMENT"

        reason = (
            "The payment may have failed "
            "because of a temporary connection issue."
        )


    else:

        risk = "MEDIUM"

        recommendation = "SEND PAYMENT LINK"

        reason = (
            "Failure reason requires "
            "customer intervention."
        )


    return {

        "status": "success",

        "payment_id": payment.id,

        "customer_id": payment.customer_id,

        "amount": payment.amount,

        "failure_reason": payment.failure_reason,

        "risk": risk,

        "recommendation": recommendation,

        "reason": reason
    }


# ============================================================
# EXECUTE RECOVERY ACTION
# ============================================================

@app.post("/payments/{payment_id}/recover")
def recover_payment(

    payment_id: int,

    db: Session = Depends(get_db)
):

    # --------------------------------------------------------
    # FIND PAYMENT
    # --------------------------------------------------------

    payment = db.query(
        models.Payment
    ).filter(
        models.Payment.id == payment_id
    ).first()


    if not payment:

        return {

            "status": "error",

            "message": "Payment not found"
        }


    # --------------------------------------------------------
    # ALREADY SUCCESSFUL
    # --------------------------------------------------------

    if payment.status.upper() == "SUCCESS":

        return {

            "status": "success",

            "payment_id": payment.id,

            "customer_id": payment.customer_id,

            "amount": payment.amount,

            "action": "NO ACTION",

            "recovery_status": "NOT_REQUIRED",

            "message": "Payment is already successful"
        }


    # --------------------------------------------------------
    # GET FAILURE REASON
    # --------------------------------------------------------

    failure_reason = (
        payment.failure_reason or ""
    ).lower()


    # --------------------------------------------------------
    # RECOVERY DECISION
    # --------------------------------------------------------

    if "insufficient" in failure_reason:

        action = "RETRY_PAYMENT"

        risk = "HIGH"

        reason = (
            "Temporary insufficient balance. "
            "Retrying payment."
        )


    elif "timeout" in failure_reason:

        action = "RETRY_PAYMENT"

        risk = "MEDIUM"

        reason = (
            "Temporary timeout detected. "
            "Retrying payment."
        )


    elif "declined" in failure_reason:

        action = "SEND_PAYMENT_LINK"

        risk = "HIGH"

        reason = (
            "Payment method declined. "
            "Customer needs another payment option."
        )


    elif "expired" in failure_reason:

        action = "REQUEST_NEW_PAYMENT_METHOD"

        risk = "MEDIUM"

        reason = (
            "Payment method expired. "
            "Customer needs to update it."
        )


    else:

        action = "SEND_PAYMENT_LINK"

        risk = "MEDIUM"

        reason = (
            "Unknown failure reason. "
            "Customer intervention required."
        )


    # ========================================================
    # DEMO RECOVERY EXECUTION
    # ========================================================

    # --------------------------------------------------------
    # CASE 1: RETRY PAYMENT
    # --------------------------------------------------------

    if action == "RETRY_PAYMENT":

        # Demo simulation:
        # Assume retry succeeds

        payment.status = "SUCCESS"

        payment.failure_reason = None


        # Create audit log

        recovery_log = models.RecoveryLog(

            payment_id=payment.id,

            customer_id=payment.customer_id,

            amount=payment.amount,

            risk=risk,

            action=action,

            result="RECOVERED",

            reason=(
                "Payment successfully recovered "
                "after retry."
            )
        )


        db.add(recovery_log)

        db.commit()

        db.refresh(payment)

        db.refresh(recovery_log)


        return {

            "status": "success",

            "payment_id": payment.id,

            "customer_id": payment.customer_id,

            "amount": payment.amount,

            "action": action,

            "risk": risk,

            "recovery_status": "RECOVERED",

            "recovery_log_id": recovery_log.id,

            "message": (
                "Payment successfully recovered "
                "in demo mode"
            )
        }


    # --------------------------------------------------------
    # CASE 2: SEND PAYMENT LINK
    # --------------------------------------------------------

    elif action == "SEND_PAYMENT_LINK":

        recovery_log = models.RecoveryLog(

            payment_id=payment.id,

            customer_id=payment.customer_id,

            amount=payment.amount,

            risk=risk,

            action=action,

            result="CUSTOMER_ACTION_REQUIRED",

            reason=reason
        )


        db.add(recovery_log)

        db.commit()

        db.refresh(recovery_log)


        return {

            "status": "success",

            "payment_id": payment.id,

            "customer_id": payment.customer_id,

            "amount": payment.amount,

            "action": action,

            "risk": risk,

            "recovery_status": (
                "CUSTOMER_ACTION_REQUIRED"
            ),

            "recovery_log_id": recovery_log.id,

            "message": (
                "Payment link should be sent "
                "to customer"
            )
        }


    # --------------------------------------------------------
    # CASE 3: NEW PAYMENT METHOD
    # --------------------------------------------------------

    elif action == "REQUEST_NEW_PAYMENT_METHOD":

        recovery_log = models.RecoveryLog(

            payment_id=payment.id,

            customer_id=payment.customer_id,

            amount=payment.amount,

            risk=risk,

            action=action,

            result="CUSTOMER_ACTION_REQUIRED",

            reason=reason
        )


        db.add(recovery_log)

        db.commit()

        db.refresh(recovery_log)


        return {

            "status": "success",

            "payment_id": payment.id,

            "customer_id": payment.customer_id,

            "amount": payment.amount,

            "action": action,

            "risk": risk,

            "recovery_status": (
                "CUSTOMER_ACTION_REQUIRED"
            ),

            "recovery_log_id": recovery_log.id,

            "message": (
                "Customer should provide "
                "a new payment method"
            )
        }