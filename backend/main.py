from fastapi import FastAPI, Depends, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Literal
import os
import uuid
import requests
import hashlib
import hmac
import json

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
# RAZORPAY TEST MODE CONFIGURATION
# ============================================================

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
RAZORPAY_API_BASE = "https://api.razorpay.com/v1"
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET")


def create_razorpay_payment_link(payment, customer):
    """Create a Razorpay Test Mode Standard Payment Link."""

    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        return None, "Razorpay Test API credentials are not configured"

    # RecoverAI stores amounts in rupees; Razorpay expects the
    # smallest currency unit (paise for INR).
    amount_in_paise = int(round(float(payment.amount) * 100))

    reference_id = f"recoverai-{payment.id}-{uuid.uuid4().hex[:8]}"

    customer_data = {}
    if customer:
        if getattr(customer, "name", None):
            customer_data["name"] = customer.name
        if getattr(customer, "email", None):
            customer_data["email"] = customer.email
        if getattr(customer, "phone", None):
            customer_data["contact"] = customer.phone

    payload = {
        "amount": amount_in_paise,
        "currency": "INR",
        "accept_partial": False,
        "reference_id": reference_id,
        "description": f"RecoverAI recovery for payment #{payment.id}",
        "customer": customer_data,
        "expire_by": int(__import__("time").time()) + (7 * 24 * 60 * 60),
        "notes": {
            "source": "RecoverAI",
            "payment_id": str(payment.id),
            "customer_id": str(payment.customer_id),
        },
    }

    try:
        response = requests.post(
            f"{RAZORPAY_API_BASE}/payment_links",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            json=payload,
            timeout=20,
        )

        data = response.json()

        if not response.ok:
            error_message = (
                data.get("error", {}).get("description")
                or data.get("error", {}).get("reason")
                or "Razorpay Payment Link creation failed"
            )
            return None, error_message

        return data, None

    except requests.RequestException as exc:
        return None, f"Unable to connect to Razorpay: {exc}"


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
    for attempt in range(3):
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

            print(f"Gemini returned no parsed result (attempt {attempt + 1}/3)")

        except Exception as e:
            print(f"Gemini analysis failed (attempt {attempt + 1}/3):", e)

            # Retry temporary Gemini service/capacity errors.
            if "503" in str(e) or "UNAVAILABLE" in str(e):
                if attempt < 2:
                    import time
                    time.sleep(2)
                    continue

            return None

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
# RAZORPAY WEBHOOK HELPERS
# ============================================================

def verify_razorpay_webhook_signature(raw_body: bytes, signature: str | None):
    """Verify Razorpay webhook signature using the raw request body."""

    if not RAZORPAY_WEBHOOK_SECRET:
        return False, "RAZORPAY_WEBHOOK_SECRET is not configured"

    if not signature:
        return False, "Missing X-Razorpay-Signature header"

    expected = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        return False, "Invalid Razorpay webhook signature"

    return True, None


def extract_payment_id_from_payment_link(payload):
    """Extract RecoverAI's local payment_id from Razorpay Payment Link notes."""

    payment_link = (payload.get("payload") or {}).get("payment_link") or {}
    entity = payment_link.get("entity") or {}
    notes = entity.get("notes") or {}

    value = notes.get("payment_id")
    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ============================================================
# RAZORPAY PAYMENT LINK PAID WEBHOOK
# ============================================================

@app.post("/webhooks/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Close the recovery loop when a Razorpay Payment Link is paid."""

    raw_body = await request.body()

    valid, error = verify_razorpay_webhook_signature(
        raw_body,
        x_razorpay_signature,
    )

    if not valid:
        return {
            "status": "error",
            "message": error,
        }

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {
            "status": "error",
            "message": "Invalid webhook JSON",
        }

    event = payload.get("event")

    # We only need the paid event for the recovery workflow.
    if event != "payment_link.paid":
        return {
            "status": "ignored",
            "event": event,
            "message": "Webhook event received but no recovery update was required",
        }

    local_payment_id = extract_payment_id_from_payment_link(payload)

    if not local_payment_id:
        return {
            "status": "error",
            "message": "RecoverAI payment_id not found in Payment Link notes",
        }

    payment = db.query(models.Payment).filter(
        models.Payment.id == local_payment_id
    ).first()

    if not payment:
        return {
            "status": "error",
            "message": f"RecoverAI payment #{local_payment_id} not found",
        }

    # Idempotency / stopping rule: don't process an already recovered payment again.
    if payment.status.upper() == "SUCCESS":
        return {
            "status": "success",
            "event": event,
            "payment_id": payment.id,
            "recovery_status": "ALREADY_RECOVERED",
            "message": "Payment was already marked successful",
        }

    payment_link_entity = (payload.get("payload") or {}).get("payment_link", {}).get("entity", {})
    razorpay_link_id = payment_link_entity.get("id")

    recovery_log = db.query(models.RecoveryLog).filter(
        models.RecoveryLog.payment_id == payment.id
    ).order_by(models.RecoveryLog.id.desc()).first()

    if recovery_log:
        recovery_log.result = "RECOVERED"
        recovery_log.reason = (
            f"Razorpay Payment Link {razorpay_link_id or 'unknown'} paid successfully. "
            "Revenue recovered through the AI recovery workflow."
        )
    else:
        recovery_log = models.RecoveryLog(
            payment_id=payment.id,
            customer_id=payment.customer_id,
            amount=payment.amount,
            risk="MEDIUM",
            action="SEND_PAYMENT_LINK",
            result="RECOVERED",
            reason=(
                f"Razorpay Payment Link {razorpay_link_id or 'unknown'} paid successfully. "
                "Revenue recovered through the AI recovery workflow."
            ),
        )
        db.add(recovery_log)

    payment.status = "SUCCESS"
    payment.failure_reason = None

    db.commit()
    db.refresh(payment)
    db.refresh(recovery_log)

    return {
        "status": "success",
        "event": event,
        "payment_id": payment.id,
        "customer_id": payment.customer_id,
        "amount": payment.amount,
        "recovery_status": "RECOVERED",
        "recovery_log_id": recovery_log.id,
        "razorpay_payment_link_id": razorpay_link_id,
        "message": "Payment marked as recovered from Razorpay payment_link.paid webhook",
    }

# ============================================================
# EXECUTE AI-RECOMMENDED RECOVERY ACTION
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
    # ASK GEMINI FOR THE RECOVERY DECISION
    # --------------------------------------------------------

    ai_result = analyze_payment_with_gemini(
        payment,
        customer,
        payment_history
    )

    # --------------------------------------------------------
    # FALLBACK IF GEMINI IS UNAVAILABLE
    # --------------------------------------------------------

    if ai_result:
        recommendation = ai_result["recommendation"]
        risk = ai_result["risk"]
        reason = ai_result["reason"]
        confidence = ai_result["confidence"]
        ai_provider = "Gemini"

    else:

        failure_reason = (
            payment.failure_reason or ""
        ).lower()

        confidence = 0.0
        ai_provider = "Fallback"

        if "insufficient" in failure_reason:
            recommendation = "RETRY PAYMENT"
            risk = "HIGH"
            reason = (
                "Temporary insufficient balance. "
                "Retrying payment."
            )

        elif "timeout" in failure_reason:
            recommendation = "RETRY PAYMENT"
            risk = "MEDIUM"
            reason = (
                "Temporary timeout detected. "
                "Retrying payment."
            )

        elif "declined" in failure_reason:
            recommendation = "SEND PAYMENT LINK"
            risk = "HIGH"
            reason = (
                "Payment method declined. "
                "Customer needs another payment option."
            )

        elif "expired" in failure_reason:
            recommendation = "REQUEST NEW PAYMENT METHOD"
            risk = "MEDIUM"
            reason = (
                "Payment method expired. "
                "Customer needs to update it."
            )

        else:
            recommendation = "SEND PAYMENT LINK"
            risk = "MEDIUM"
            reason = (
                "Unknown failure reason. "
                "Customer intervention required."
            )

    # --------------------------------------------------------
    # CONVERT AI RECOMMENDATION INTO RECOVERY ACTION
    # --------------------------------------------------------

    action_map = {
        "RETRY PAYMENT": "RETRY_PAYMENT",
        "SEND PAYMENT LINK": "SEND_PAYMENT_LINK",
        "REQUEST NEW PAYMENT METHOD": "REQUEST_NEW_PAYMENT_METHOD",
        "NO ACTION": "NO_ACTION"
    }

    action = action_map.get(
        recommendation,
        "NO_ACTION"
    )

    # --------------------------------------------------------
    # CASE 1: NO ACTION
    # --------------------------------------------------------

    if action == "NO_ACTION":

        recovery_log = models.RecoveryLog(
            payment_id=payment.id,
            customer_id=payment.customer_id,
            amount=payment.amount,
            risk=risk,
            action=action,
            result="NO_ACTION",
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
            "recovery_status": "NO_ACTION",
            "recovery_log_id": recovery_log.id,
            "confidence": confidence,
            "ai_provider": ai_provider,
            "message": "No recovery action required"
        }

    # --------------------------------------------------------
    # CASE 2: RETRY PAYMENT
    # --------------------------------------------------------

    if action == "RETRY_PAYMENT":

        # Demo simulation:
        # Assume the retry succeeds

        payment.status = "SUCCESS"
        payment.failure_reason = None

        recovery_log = models.RecoveryLog(
            payment_id=payment.id,
            customer_id=payment.customer_id,
            amount=payment.amount,
            risk=risk,
            action=action,
            result="RECOVERED",
            reason=(
                f"{reason} "
                "Payment successfully recovered after retry."
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
            "confidence": confidence,
            "ai_provider": ai_provider,
            "message": (
                "Payment successfully recovered "
                "using the AI-recommended retry action"
            )
        }

    # --------------------------------------------------------
    # CASE 3: SEND PAYMENT LINK
    # --------------------------------------------------------

    if action == "SEND_PAYMENT_LINK":

        # Create a real Razorpay Test Mode Payment Link.
        payment_link, razorpay_error = create_razorpay_payment_link(
            payment,
            customer
        )

        if razorpay_error:
            recovery_log = models.RecoveryLog(
                payment_id=payment.id,
                customer_id=payment.customer_id,
                amount=payment.amount,
                risk=risk,
                action=action,
                result="FAILED",
                reason=f"{reason} Razorpay error: {razorpay_error}"
            )

            db.add(recovery_log)
            db.commit()
            db.refresh(recovery_log)

            return {
                "status": "error",
                "payment_id": payment.id,
                "customer_id": payment.customer_id,
                "amount": payment.amount,
                "action": action,
                "risk": risk,
                "recovery_status": "FAILED",
                "recovery_log_id": recovery_log.id,
                "confidence": confidence,
                "ai_provider": ai_provider,
                "message": razorpay_error
            }

        payment_link_url = payment_link.get("short_url")
        payment_link_id = payment_link.get("id")

        recovery_log = models.RecoveryLog(
            payment_id=payment.id,
            customer_id=payment.customer_id,
            amount=payment.amount,
            risk=risk,
            action=action,
            result="CUSTOMER_ACTION_REQUIRED",
            reason=(
                f"{reason} Razorpay Test Mode Payment Link "
                f"created: {payment_link_id}"
            )
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
            "recovery_status": "CUSTOMER_ACTION_REQUIRED",
            "recovery_log_id": recovery_log.id,
            "confidence": confidence,
            "ai_provider": ai_provider,
            "razorpay_payment_link_id": payment_link_id,
            "payment_link": payment_link_url,
            "message": (
                "Razorpay Test Mode Payment Link created. "
                "Customer action is required to complete payment."
            )
        }

    # --------------------------------------------------------
    # CASE 4: REQUEST NEW PAYMENT METHOD
    # --------------------------------------------------------

    if action == "REQUEST_NEW_PAYMENT_METHOD":

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
            "recovery_status": "CUSTOMER_ACTION_REQUIRED",
            "recovery_log_id": recovery_log.id,
            "confidence": confidence,
            "ai_provider": ai_provider,
            "message": (
                "Customer should provide "
                "a new payment method"
            )
        }


# ============================================================
# RECOVERY LOGS / ANALYTICS
# ============================================================

@app.get("/recovery-logs")
def get_recovery_logs(db: Session = Depends(get_db)):
    """Return recovery actions for the RecoverAI analytics dashboard."""

    logs = (
        db.query(models.RecoveryLog)
        .order_by(models.RecoveryLog.id.desc())
        .all()
    )

    return {
        "count": len(logs),
        "recovery_logs": [
            {
                "id": log.id,
                "payment_id": log.payment_id,
                "customer_id": log.customer_id,
                "amount": log.amount,
                "risk": log.risk,
                "action": log.action,
                "result": log.result,
                "reason": log.reason,
            }
            for log in logs
        ],
    }
