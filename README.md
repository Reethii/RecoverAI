# RecoverAI

### AI-Powered Revenue Recovery Agent

RecoverAI is an AI-powered revenue recovery system designed to detect failed payments, assess recovery risk, recommend the safest intervention, and execute bounded recovery actions.

Built for the **Razorpay AI Buildathon — Track 03: AI Revenue Recovery**.

---

## 🚀 The Problem

Payment failures directly impact business revenue.

When a payment fails, businesses often need to determine:

- Why did the payment fail?
- Is the payment worth recovering?
- Should the payment be retried?
- Should the customer receive a new payment link?
- Does the customer need to update their payment method?
- When should the system stop taking action?

RecoverAI turns this process into an AI-assisted revenue recovery workflow.

---

## 💡 What RecoverAI Does

RecoverAI follows a simple recovery loop:

```text
Failed Payment
      ↓
Analyze Payment + Customer History
      ↓
AI Risk Assessment
      ↓
Recovery Recommendation
      ↓
Execute Bounded Recovery Action
      ↓
Track Outcome
      ↓
Update Recovery Analytics

The AI analyzes the failed payment together with the customer's previous payment history and selects one of four allowed actions:

RETRY PAYMENT
SEND PAYMENT LINK
REQUEST NEW PAYMENT METHOD
NO ACTION

The AI is explicitly constrained to avoid refunds, moving money, and unlimited retries.

✨ Key Features
🤖 AI Payment Analysis

Gemini analyzes:

Payment amount
Payment status
Failure reason
Customer information
Previous payment history

It returns:

Risk level
Recommended recovery action
Reason for the recommendation
AI confidence score
💳 Razorpay Payment Link Recovery

When the AI recommends a payment link, RecoverAI creates a Razorpay Test Mode Payment Link for the failed payment.

The generated link is displayed directly in the dashboard so the customer can complete the payment securely.

🔄 Bounded Recovery Actions

RecoverAI supports controlled recovery actions:

AI Recommendation	Recovery Action
RETRY PAYMENT	Retry recovery flow
SEND PAYMENT LINK	Create Razorpay Payment Link
REQUEST NEW PAYMENT METHOD	Ask customer to update payment method
NO ACTION	Stop recovery

The system does not perform unlimited retries or unauthorized financial operations.

🔔 Razorpay Webhook Integration

RecoverAI listens for the Razorpay:

payment_link.paid

event.

When the customer successfully completes a recovery payment:

Razorpay Payment Link
        ↓
Webhook
        ↓
Verify Signature
        ↓
Identify RecoverAI Payment
        ↓
Mark Payment SUCCESS
        ↓
Mark Recovery RECOVERED
        ↓
Update Analytics
📊 Recovery Analytics

The dashboard tracks revenue recovery performance, including:

Payments monitored
Revenue at risk
Recovered revenue
Recovery rate
Recovery outcomes
Recovery actions

This allows businesses to see how much revenue was recovered through the AI workflow.

🧾 Audit Trail

Each recovery action is recorded with information such as:

Payment ID
Customer ID
Amount
Risk
AI-selected action
Recovery result
Recovery reason

This creates an auditable record of the agent's decisions.

🧠 AI Safety Boundaries

RecoverAI uses bounded AI decisions rather than allowing the model to perform unrestricted financial operations.

The AI is instructed to:

Use only the provided payment and customer information
Consider previous payment history
Avoid inventing customer information
Never authorize refunds
Never capture or move money
Never recommend unlimited retries
Choose only from predefined recovery actions

This keeps the AI focused on revenue recovery while maintaining controlled execution.

🏗️ Architecture
                    ┌─────────────────────┐
                    │     RecoverAI UI    │
                    │    React + Vite     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    FastAPI Backend  │
                    │       Python        │
                    └──────┬───────┬──────┘
                           │       │
                 ┌─────────┘       └─────────┐
                 ▼                           ▼
        ┌─────────────────┐         ┌─────────────────┐
        │   Gemini AI     │         │    Database     │
        │ Payment Analysis│         │ SQLAlchemy/DB   │
        └─────────────────┘         └─────────────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ Razorpay Test   │
        │      Mode       │
        │ Payment Links   │
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ Razorpay        │
        │ Webhooks        │
        └────────┬────────┘
                 │
                 ▼
        Recovery Status + Audit Log
🛠️ Tech Stack
Frontend
React
Vite
JavaScript
CSS
Backend
Python
FastAPI
SQLAlchemy
Pydantic
Requests
AI
Google Gemini API
Gemini structured JSON output
Payments
Razorpay Test Mode
Razorpay Payment Links
Razorpay Webhooks
Development
VS Code
Postman
Git
GitHub
📁 Project Structure
RecoverAI/
│
├── backend/
│   ├── main.py
│   ├── main_backup.py
│   ├── models.py
│   ├── database.py
│   └── .gitignore
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
⚙️ Local Setup
1. Clone the repository
git clone https://github.com/Reethii/RecoverAI.git
cd RecoverAI
🔧 Backend Setup

Open a terminal:

cd backend

Create and activate a virtual environment:

Windows
python -m venv venv
venv\Scripts\activate

Install dependencies:

pip install fastapi uvicorn sqlalchemy pydantic requests python-dotenv google-genai

Create:

backend/.env

Add your credentials:

GEMINI_API_KEY=your_gemini_api_key

RAZORPAY_KEY_ID=your_razorpay_test_key_id
RAZORPAY_KEY_SECRET=your_razorpay_test_key_secret

RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

Never commit .env or expose API keys publicly.

Start the backend:

uvicorn main:app --reload

Backend:

http://localhost:8000

API health check:

http://localhost:8000/health
🎨 Frontend Setup

Open another terminal:

cd frontend

Install dependencies:

npm install

Start the frontend:

npm run dev

Frontend:

http://localhost:5173
🔄 Example Recovery Flow

Suppose a customer has a failed payment:

Payment
₹3,000
Status: FAILED
Failure: Insufficient balance

RecoverAI sends the payment information and customer history to Gemini.

The AI may determine:

Risk: MEDIUM

Recommendation:
SEND PAYMENT LINK

Confidence:
85%

RecoverAI then creates a Razorpay Test Mode Payment Link.

The customer completes the test payment.

Razorpay sends:

payment_link.paid

to RecoverAI.

RecoverAI verifies the webhook and updates:

Payment Status:
SUCCESS

Recovery Status:
RECOVERED

The result is then reflected in the analytics and audit trail.

🛡️ Recovery Stopping Rules

RecoverAI does not continuously retry failed payments.

Recovery stops when:

Payment is successfully recovered
Customer action is required
AI recommends no action
The recovery workflow reaches a terminal state

This prevents uncontrolled recovery attempts.

🧪 Test Mode

RecoverAI uses Razorpay Test Mode for development and demonstration.

No real money is moved during the demo.

The complete recovery workflow can therefore be tested safely:

Failed Payment
      ↓
Gemini Analysis
      ↓
Recovery Decision
      ↓
Razorpay Test Payment Link
      ↓
Test Payment
      ↓
Webhook
      ↓
Recovered
📈 Why RecoverAI?

RecoverAI is designed around one goal:

Recover revenue intelligently while keeping recovery actions controlled, explainable, and auditable.

Instead of treating every failed payment the same way, the system considers the failure context and customer history before selecting an intervention.

🎯 Buildathon Track

Razorpay AI Buildathon

Track 03 — AI Revenue Recovery

RecoverAI addresses the core revenue recovery workflow:

Detect → Analyze → Decide → Act → Recover → Record
🔮 Future Improvements

Potential future enhancements include:

Automated customer notifications
WhatsApp / SMS recovery workflows
Subscription payment recovery
Smart retry scheduling
B2B invoice recovery
Promise-to-pay workflows
Recovery prioritization across large payment batches
Recovery performance prediction
More advanced customer segmentation
👩‍💻 Author

Reethii

RecoverAI — AI Revenue Recovery Agent

Built for the Razorpay AI Buildathon.


### One important thing

I deliberately **didn't claim features that aren't actually implemented** as completed features. For example, the README says WhatsApp/SMS and subscription recovery are *future improvements*, rather than pretending they're already working. That's much better for a judge reviewing the repository.

Your Gemini implementation really does constrain the model to those four recommendations and prohibits refunds, moving money, and unlimited retries, so those sections accurately represent the current backend. :contentReference[oaicite:2]{index=2}

### What you do now

Create:

```text
D:\RAZOR PAY PROJ\README.md