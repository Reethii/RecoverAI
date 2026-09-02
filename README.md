# RecoverAI

## AI-Powered Revenue Recovery Agent

RecoverAI is an AI-powered revenue recovery system built for **Razorpay Buildathon — Track 03: AI Revenue Recovery**.

It detects failed payments, analyzes the reason for payment failure using **Google Gemini**, determines the safest recovery action, and executes a bounded recovery workflow using **Razorpay Test Mode**.

> **Buildathon Track:** Track 03 — AI Revenue Recovery

---

## Problem Statement

Failed payments create significant revenue leakage for businesses.

A payment can fail because of reasons such as:

- Insufficient balance
- Temporary payment failures
- Invalid or expired payment methods
- Customers abandoning the payment process
- Customers needing to use an alternative payment method

Traditional payment systems often stop at simply reporting the failure.

RecoverAI goes one step further by asking:

> **Why did the payment fail, what should happen next, and can the revenue be recovered safely?**

The system uses AI to analyze payment context and recommend an appropriate recovery action while following predefined safety boundaries and stopping rules.

---

## What RecoverAI Does

RecoverAI provides an end-to-end AI-driven workflow for recovering revenue from failed payments.

### Core Workflow

1. **Detect** — Identifies failed or at-risk payments.
2. **Analyze** — Uses Google Gemini to understand the payment failure and customer context.
3. **Decide** — Selects an appropriate recovery action based on the available payment information.
4. **Execute** — Performs a bounded recovery action through the backend.
5. **Track** — Records the recovery attempt and outcome in the audit trail.
6. **Stop** — Stops further automated action when recovery succeeds or customer intervention is required.

### Supported Recovery Actions

- **Retry Payment**
- **Send Razorpay Payment Link**
- **Request New Payment Method**
- **No Action**

This creates a complete loop from **payment failure → AI decision → recovery action → outcome tracking**.

---

## Key Features

### 🤖 AI Payment Analysis

RecoverAI uses **Google Gemini** to analyze failed payments and determine:

- Payment risk level
- Recommended recovery action
- Reason behind the recommendation
- AI confidence score

The AI decision is based on the available payment, customer, and payment-history information.

### 💳 Razorpay Payment Link Recovery

When a payment link is the appropriate recovery action, RecoverAI creates a **Razorpay Test Mode Payment Link** that the customer can use to complete the payment securely.

### 🔄 Bounded Recovery Actions

RecoverAI supports controlled recovery actions instead of unlimited automated retries:

- Retry Payment
- Send Payment Link
- Request New Payment Method
- No Action

### 🔔 Razorpay Webhook Integration

RecoverAI receives Razorpay webhook events to detect when a recovery payment has been successfully completed.

This allows the system to update the payment status and recovery outcome automatically.

### 📊 Revenue Recovery Analytics

The dashboard provides visibility into:

- Payments monitored
- Revenue at risk
- Recovered revenue
- Recovery rate
- Recovery outcomes
- Recovery actions

### 📝 Audit Trail

Every recovery action is recorded with information such as:

- Payment ID
- Customer ID
- Amount
- Risk level
- AI-recommended action
- Recovery result
- Reason for the action

This makes the recovery workflow traceable and transparent.

---

## AI Safety & Boundaries

RecoverAI is designed with controlled and bounded AI decision-making.

The AI does not have unrestricted access to payment operations. Instead, Gemini selects from a predefined set of recovery actions supported by the application.

### Safety Rules

- AI recommendations are limited to predefined recovery actions.
- The system does not initiate refunds.
- The system does not move money directly.
- Unlimited payment retries are not allowed.
- Successful payments are not retried or acted upon again.
- Customer-action-required cases are not repeatedly automated.
- Recovery actions and outcomes are recorded in the audit trail.
- Razorpay Test Mode is used during development and demonstration.

### Stopping Rules

The recovery workflow stops when:

- The payment is successfully recovered.
- A customer needs to take further action.
- The AI recommends **NO ACTION**.
- The payment has already been recovered.

These boundaries ensure that automation remains controlled, traceable, and aligned with the recovery workflow.

---

## System Architecture

RecoverAI follows a full-stack architecture connecting the frontend, backend, AI layer, database, and Razorpay.

### Architecture

```text
                    ┌──────────────────────┐
                    │     React Frontend   │
                    │      Dashboard       │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    FastAPI Backend   │
                    │ Recovery Orchestrator│
                    └───────┬───────┬──────┘
                            │       │
                 ┌──────────┘       └──────────┐
                 ▼                             ▼
        ┌─────────────────┐           ┌─────────────────┐
        │  Google Gemini  │           │    Database     │
        │   AI Analysis   │           │ Customers /     │
        │                 │           │ Payments / Logs │
        └─────────────────┘           └─────────────────┘
                            │
                            ▼
                  ┌────────────────────┐
                  │      Razorpay      │
                  │ Test Mode APIs &   │
                  │ Payment Links      │
                  └─────────┬──────────┘
                            │
                            ▼
                  ┌────────────────────┐
                  │ Razorpay Webhooks  │
                  │  payment_link.paid │
                  └────────────────────┘
```

### Recovery Flow

```text
Failed Payment
      ↓
Payment & Customer Context
      ↓
Gemini AI Analysis
      ↓
Risk + Recommended Action
      ↓
Bounded Recovery Action
      ↓
Razorpay / Customer Action
      ↓
Webhook Confirmation
      ↓
Database & Audit Trail Update
      ↓
Recovery Analytics
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Python + FastAPI |
| Database | SQLite / SQLAlchemy |
| AI | Google Gemini |
| Payments | Razorpay Test Mode |
| Payment Recovery | Razorpay Payment Links API |
| Events | Razorpay Webhooks |
| API Testing | Postman |
| Development | VS Code |
| Version Control | Git + GitHub |

### AI Model

RecoverAI uses **Google Gemini** for structured payment-risk analysis.

The AI returns:

- Risk level
- Recovery recommendation
- Reason
- Confidence score

The backend validates the AI response before using it in the recovery workflow.

---

## Project Structure

```text
RecoverAI/
│
├── backend/
│   ├── main.py              # FastAPI application and recovery logic
│   ├── models.py            # Database models
│   └── database.py          # Database configuration
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main React application
│   │   ├── App.css          # Application styling
│   │   └── assets/          # Frontend assets
│   ├── public/              # Public assets
│   ├── package.json         # Frontend dependencies
│   └── vite.config.js       # Vite configuration
│
├── .gitignore               # Git ignore rules
└── README.md                # Project documentation
```

### Main Components

**Backend**

- Handles API requests and recovery workflows.
- Connects to the database.
- Communicates with Gemini.
- Integrates with Razorpay APIs.
- Processes Razorpay webhook events.

**Frontend**

- Displays payment and customer information.
- Shows AI risk analysis.
- Provides recovery actions.
- Displays recovery analytics and audit information.

---

## Getting Started

Follow the steps below to run RecoverAI locally.

### Prerequisites

Make sure the following are installed:

- Python 3.10+
- Node.js and npm
- Git
- Razorpay Test Mode account
- Google Gemini API key

### 1. Clone the Repository

```bash
git clone https://github.com/Reethii/RecoverAI.git
cd RecoverAI
```

### 2. Backend Setup

Open a terminal in the project root:

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
```

Install the required Python dependencies used by the backend.

Create a `.env` file inside the `backend` folder:

```env
GEMINI_API_KEY=your_gemini_api_key
RAZORPAY_KEY_ID=your_razorpay_test_key_id
RAZORPAY_KEY_SECRET=your_razorpay_test_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

Start the FastAPI backend:

```powershell
uvicorn main:app --reload
```

The backend will run at:

```text
http://localhost:8000
```

### 3. Frontend Setup

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

The React application will be available at the local URL shown by Vite.

### 4. Razorpay Webhook

For local webhook testing, expose the FastAPI server through a public HTTPS tunnel and configure the following endpoint in Razorpay Test Mode:

```text
/webhooks/razorpay
```

The webhook is used to receive payment-link payment events and update the recovery status.

---

## Example Recovery Flow

A typical RecoverAI recovery flow works as follows:

```text
1. Payment fails
       ↓
2. RecoverAI retrieves payment and customer context
       ↓
3. Gemini analyzes the payment
       ↓
4. AI returns:
      • Risk level
      • Recommended action
      • Reason
      • Confidence score
       ↓
5. Backend validates the recommendation
       ↓
6. Recovery action is executed
       ↓
7. Recovery result is recorded
       ↓
8. Razorpay webhook confirms successful payment
       ↓
9. Payment status is updated
       ↓
10. Analytics and audit trail are updated
```

### Example

```text
Payment
Amount: ₹3,000
Status: FAILED
Failure Reason: Insufficient Balance

        ↓

Gemini Analysis

Risk: MEDIUM
Recommendation: SEND PAYMENT LINK
Confidence: 85%

        ↓

Recovery Action

Razorpay Payment Link Created

        ↓

Customer Completes Payment

        ↓

Razorpay Webhook

payment_link.paid

        ↓

RecoverAI

Payment Status: SUCCESS
Recovery Result: RECOVERED
```

This demonstrates the complete journey from a failed payment to successful revenue recovery.

---

## Stopping Rules & Recovery Outcomes

RecoverAI follows bounded recovery rules to prevent unnecessary or repeated actions.

### Recovery Outcomes

| Outcome | Meaning |
|---|---|
| `RECOVERED` | Payment was successfully recovered |
| `CUSTOMER_ACTION_REQUIRED` | Customer needs to complete an action |
| `NO_ACTION` | No recovery action is required |

### Stopping Rules

The recovery workflow stops when:

- The payment is successfully recovered.
- A Razorpay Payment Link has been created and customer action is required.
- Gemini recommends `NO ACTION`.
- The payment has already been recovered.

Once a recovery outcome is reached, RecoverAI does not continue performing unnecessary automated recovery actions.

This ensures that the agent remains **bounded, predictable, and auditable**.

---

## Test Mode & Demo

RecoverAI is developed and demonstrated using **Razorpay Test Mode**.

No real money is involved during testing.

### Demo Capabilities

The application can demonstrate:

- Failed payment detection
- AI-powered payment analysis
- Risk assessment
- Recovery recommendation
- Retry-based recovery simulation
- Razorpay Payment Link creation
- Customer-action-required recovery
- Razorpay webhook confirmation
- Successful payment recovery
- Recovery analytics
- Recovery audit trail

### Payment Link Demo

For a failed payment where Gemini recommends `SEND PAYMENT LINK`:

```text
Failed Payment
      ↓
Gemini Recommendation
      ↓
SEND PAYMENT LINK
      ↓
Razorpay Test Payment Link Created
      ↓
Customer Opens Payment Link
      ↓
Test Payment Completed
      ↓
Razorpay Webhook
      ↓
RecoverAI Marks Payment as RECOVERED
```

The entire workflow can be demonstrated without processing real transactions.

---

## API Endpoints

RecoverAI exposes REST APIs through the FastAPI backend.

### Payment APIs

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/payments` | Retrieve monitored payments |
| `GET` | `/payments/{payment_id}` | Retrieve a specific payment |
| `GET` | `/payments/{payment_id}/analyze` | Analyze a payment using AI |
| `POST` | `/payments/{payment_id}/recover` | Execute the recommended recovery action |

### Customer APIs

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/customers` | Retrieve customers |

### Recovery & Analytics APIs

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/recovery-logs` | Retrieve recovery audit logs |

### Razorpay Integration

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/webhooks/razorpay` | Receive Razorpay webhook events |

### API Documentation

When the FastAPI backend is running, interactive API documentation is available at:

```text
http://localhost:8000/docs
```

---

## Why RecoverAI?

RecoverAI is designed around a simple idea:

> **A failed payment should be treated as a recoverable revenue opportunity, not just an error.**

Instead of stopping at payment-failure detection, RecoverAI combines:

- **AI reasoning** to understand payment context
- **Risk assessment** to prioritize revenue at risk
- **Bounded actions** to recover payments safely
- **Razorpay integration** to execute payment-link recovery
- **Webhooks** to confirm successful recovery
- **Analytics** to measure recovery performance
- **Audit logs** to maintain transparency

The result is an end-to-end recovery agent that can **detect → reason → act → verify → stop**.

---

## Future Improvements

RecoverAI can be extended into a more advanced revenue recovery platform with additional capabilities.

### Planned Improvements

- **Smart retry scheduling** based on payment failure patterns.
- **Customer segmentation** for personalized recovery strategies.
- **Hinglish voice recovery** for customer communication.
- **B2B receivables recovery** with promise-to-pay workflows.
- **Subscription payment recovery** for recurring payments.
- **Checkout drop-off detection** and recovery.
- **Advanced revenue forecasting** using historical recovery data.
- **Multi-channel customer communication** through email, SMS, and messaging platforms.
- **Production-grade payment integrations** beyond Test Mode.
- **Advanced AI evaluation** to continuously measure recovery effectiveness.

These improvements could help RecoverAI evolve from a Buildathon MVP into a production-ready revenue recovery platform.

---

## Buildathon

RecoverAI was built for the **Razorpay Buildathon — Track 03: AI Revenue Recovery**.

### Track Focus

The project focuses on building an AI agent that can:

- Detect revenue at risk
- Understand payment failure context
- Determine an appropriate intervention
- Execute a bounded recovery workflow
- Verify recovery outcomes
- Maintain an audit trail

RecoverAI implements these concepts through AI-powered payment analysis, Razorpay Payment Links, webhook-based confirmation, recovery analytics, and controlled stopping rules.

---

## Author

**Reethii**

Built as a solo project for the Razorpay Buildathon.

---

## License

This project is created for educational, demonstration, and Buildathon purposes.