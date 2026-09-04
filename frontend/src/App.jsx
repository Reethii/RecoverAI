import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = "https://recoverai-idw1.onrender.com";

function App() {
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [recoveryLogs, setRecoveryLogs] = useState([]);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [showDecision, setShowDecision] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState("");
  const [activePage, setActivePage] = useState("Dashboard");
  const [recoverySearch, setRecoverySearch] = useState("");
  const [recoveryFilter, setRecoveryFilter] = useState("ALL");
  // Payments page controls
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [paymentPage, setPaymentPage] = useState(1);
  const paymentsPerPage = 10;

  // --------------------------------------------------
  // LOAD DATA
  // --------------------------------------------------

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const [paymentsResponse, customersResponse, recoveryLogsResponse] =
        await Promise.all([
          fetch(`${API}/payments`),
          fetch(`${API}/customers`),
          fetch(`${API}/recovery-logs`).catch(() => null),
        ]);

      if (!paymentsResponse.ok || !customersResponse.ok) {
        throw new Error("Backend request failed");
      }

      const paymentsData = await paymentsResponse.json();
      const customersData = await customersResponse.json();
      const recoveryLogsData = recoveryLogsResponse?.ok
        ? await recoveryLogsResponse.json()
        : { recovery_logs: [] };

      setPayments(paymentsData.payments || []);
      setCustomers(customersData.customers || []);
      setRecoveryLogs(recoveryLogsData.recovery_logs || []);
    } catch (err) {
      console.error(err);

      setError(
        "Unable to connect to RecoverAI backend. Make sure FastAPI is running on port 8000."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // --------------------------------------------------
  // CUSTOMER NAME
  // --------------------------------------------------

  const getCustomer = (customerId) => {
    return customers.find(
      (customer) => customer.id === customerId
    );
  };

  // --------------------------------------------------
  // ANALYZE PAYMENT
  // --------------------------------------------------

  const analyzePayment = async (payment) => {
    try {
      setAnalyzing(true);
      setSelectedPayment(payment);
      setAnalysis(null);
      setShowDecision(false);
      setError("");

      const response = await fetch(
        `${API}/payments/${payment.id}/analyze`
      );

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(
          data.message || "Analysis failed"
        );
      }

      setAnalysis(data);
      setShowDecision(true);
    } catch (err) {
      console.error(err);
      setError("Unable to analyze payment.");
    } finally {
      setAnalyzing(false);
    }
  };

  // --------------------------------------------------
  // RECOVER PAYMENT
  // --------------------------------------------------

  const recoverPayment = async () => {
    if (!selectedPayment) return;

    try {
      setRecovering(true);
      setError("");

      const response = await fetch(
        `${API}/payments/${selectedPayment.id}/recover`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(data.message || "Recovery failed");
      }

      // Show the backend result immediately in the decision center.
      setAnalysis((previous) => ({
        ...(previous || {}),
        recovery_status: data.recovery_status,
        action: data.action,
        recovery_log_id: data.recovery_log_id,
        message: data.message,
        risk: data.risk ?? previous?.risk,
        confidence: data.confidence ?? previous?.confidence,
        ai_provider: data.ai_provider ?? previous?.ai_provider,
        razorpay_payment_link_id:
          data.razorpay_payment_link_id ??
          previous?.razorpay_payment_link_id,
        payment_link:
          data.payment_link ?? previous?.payment_link,
      }));

      // Live buildathon demo:
      // every successfully executed recovery action moves
      // FAILED -> SUCCESS immediately.
      if (
        data.recovery_status === "RECOVERED" ||
        data.recovery_status === "CUSTOMER_ACTION_REQUIRED"
      ) {
        const recoveredPayment = {
          ...selectedPayment,
          status: "SUCCESS",
          failure_reason: null,
        };

        setSelectedPayment(recoveredPayment);

        setPayments((previous) =>
          previous.map((payment) =>
            payment.id === selectedPayment.id
              ? recoveredPayment
              : payment
          )
        );
      }

      // Reload the persisted state so every page stays synchronized.
      await loadData();
    } catch (err) {
      console.error(err);
      setError("Unable to execute recovery.");
    } finally {
      setRecovering(false);
    }
  };

  // --------------------------------------------------
  // DASHBOARD NUMBERS
  // --------------------------------------------------

  const stats = useMemo(() => {
    const failed = payments.filter(
      (payment) =>
        payment.status?.toUpperCase() === "FAILED"
    );

    const successful = payments.filter(
      (payment) =>
        payment.status?.toUpperCase() === "SUCCESS"
    );

    const recoveredPaymentIds = new Set(
      recoveryLogs
        .filter((log) => log.result?.toUpperCase() === "RECOVERED")
        .map((log) => log.payment_id)
    );

    const revenueAtRisk = failed.reduce(
      (total, payment) =>
        total + Number(payment.amount || 0),
      0
    );

    const recoveredRevenue = payments
      .filter((payment) => recoveredPaymentIds.has(payment.id))
      .reduce((total, payment) => total + Number(payment.amount || 0), 0);

    const recoveredCount = recoveredPaymentIds.size;
    const recoveryBase = recoveredCount + failed.length;
    const recoveryRate = recoveryBase > 0
      ? Math.round((recoveredCount / recoveryBase) * 100)
      : 0;

    return {
      failedCount: failed.length,
      successCount: successful.length,
      recoveredCount,
      revenueAtRisk,
      recoveredRevenue,
      recoveryRate,
    };
  }, [payments, recoveryLogs]);
// --------------------------------------------------
// RECOVERY PAGE
// --------------------------------------------------

const renderRecoveryPage = () => {
  const failedPayments = payments.filter(
    (payment) =>
      payment.status?.toUpperCase() === "FAILED"
  );

  const filteredPayments = failedPayments.filter(
    (payment) => {
      const customer = getCustomer(
        payment.customer_id
      );

      const search =
        recoverySearch.trim().toLowerCase();

      const matchesSearch =
        !search ||
        String(payment.id)
          .toLowerCase()
          .includes(search) ||
        customer?.name
          ?.toLowerCase()
          .includes(search) ||
        customer?.email
          ?.toLowerCase()
          .includes(search) ||
        payment.failure_reason
          ?.toLowerCase()
          .includes(search);

      if (!matchesSearch) {
        return false;
      }

      if (recoveryFilter === "ALL") {
        return true;
      }

      if (recoveryFilter === "HIGH_RISK") {
        return (
          payment.failure_reason
            ?.toLowerCase()
            .includes("insufficient") ||
          payment.failure_reason
            ?.toLowerCase()
            .includes("declined")
        );
      }

      if (recoveryFilter === "CUSTOMER_ACTION") {
        return (
          payment.failure_reason
            ?.toLowerCase()
            .includes("expired") ||
          payment.failure_reason
            ?.toLowerCase()
            .includes("invalid")
        );
      }

      return true;
    }
  );

  const revenueAtRisk = failedPayments.reduce(
    (total, payment) =>
      total + Number(payment.amount || 0),
    0
  );

  return (
    <div className="page-container">

      <div className="page-title-row">

        <div>
          <h2 className="page-title">
            ϟ Recovery
          </h2>

          <p className="page-subtitle">
            Manage failed payments and execute
            AI-powered recovery actions
          </p>
        </div>

        <button
          className="refresh-button"
          onClick={loadData}
        >
          ↻ Refresh
        </button>

      </div>

      <div className="payment-summary-grid">

        <div className="payment-summary-card">
          <span>Revenue at Risk</span>

          <strong className="danger-text">
            ₹{revenueAtRisk.toLocaleString("en-IN")}
          </strong>
        </div>

        <div className="payment-summary-card">
          <span>Failed Payments</span>

          <strong className="danger-text">
            {failedPayments.length}
          </strong>
        </div>

        <div className="payment-summary-card">
          <span>Recovery Rate</span>

          <strong className="success-text">
            {stats.recoveryRate}%
          </strong>
        </div>

        <div className="payment-summary-card">
          <span>Recovered Revenue</span>

          <strong className="success-text">
            ₹{stats.recoveredRevenue.toLocaleString("en-IN")}
          </strong>
        </div>

      </div>

      <div className="panel full-page-panel">

        <div className="panel-header">

          <div>
            <h2>
              ϟ &nbsp; Recovery Queue
            </h2>

            <p>
              Failed payments requiring recovery
              action
            </p>
          </div>

        </div>

        <div className="payment-toolbar">

          <div className="payment-tabs">

            <button
              className={
                recoveryFilter === "ALL"
                  ? "payment-tab active"
                  : "payment-tab"
              }
              onClick={() =>
                setRecoveryFilter("ALL")
              }
            >
              All
              <span>
                {failedPayments.length}
              </span>
            </button>

            <button
              className={
                recoveryFilter === "HIGH_RISK"
                  ? "payment-tab active"
                  : "payment-tab"
              }
              onClick={() =>
                setRecoveryFilter("HIGH_RISK")
              }
            >
              High Risk
            </button>

            <button
              className={
                recoveryFilter === "CUSTOMER_ACTION"
                  ? "payment-tab active"
                  : "payment-tab"
              }
              onClick={() =>
                setRecoveryFilter(
                  "CUSTOMER_ACTION"
                )
              }
            >
              Customer Action
            </button>

          </div>

          <input
            className="payments-search"
            value={recoverySearch}
            onChange={(event) =>
              setRecoverySearch(
                event.target.value
              )
            }
            placeholder="🔍 Search recovery queue..."
          />

        </div>

        <div className="full-table-wrapper">

          <table className="payments-table">

            <thead>
              <tr>
                <th>Payment</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Failure Reason</th>
                <th>Risk</th>
                <th>Recommended Action</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>

              {loading ? (

                <tr>
                  <td
                    colSpan="7"
                    className="empty"
                  >
                    Loading recovery queue...
                  </td>
                </tr>

              ) : filteredPayments.length === 0 ? (

                <tr>
                  <td
                    colSpan="7"
                    className="empty"
                  >
                    <div className="empty-icon">
                      ✓
                    </div>

                    <strong>
                      No payments require recovery
                    </strong>

                    <p>
                      Your recovery queue is clear.
                    </p>
                  </td>
                </tr>

              ) : (

                filteredPayments.map(
                  (payment) => {

                    const customer =
                      getCustomer(
                        payment.customer_id
                      );

                    const reason =
                      (
                        payment.failure_reason ||
                        ""
                      ).toLowerCase();

                    let risk = "MEDIUM";
                    let recommendation =
                      "SEND PAYMENT LINK";

                    if (
                      reason.includes(
                        "insufficient"
                      )
                    ) {
                      risk = "HIGH";
                      recommendation =
                        "RETRY PAYMENT";
                    } else if (
                      reason.includes(
                        "declined"
                      )
                    ) {
                      risk = "HIGH";
                      recommendation =
                        "SEND PAYMENT LINK";
                    } else if (
                      reason.includes(
                        "expired"
                      )
                    ) {
                      risk = "MEDIUM";
                      recommendation =
                        "REQUEST NEW PAYMENT METHOD";
                    } else if (
                      reason.includes(
                        "timeout"
                      )
                    ) {
                      risk = "MEDIUM";
                      recommendation =
                        "RETRY PAYMENT";
                    }

                    return (
                      <tr key={payment.id}>

                        <td>
                          <strong>
                            #{payment.id}
                          </strong>
                        </td>

                        <td>

                          <div className="customer">

                            <div className="customer-avatar">
                              {customer?.name
                                ?.split(" ")
                                .map(
                                  (word) =>
                                    word[0]
                                )
                                .join("")
                                .slice(0, 2)
                                .toUpperCase() ||
                                "CU"}
                            </div>

                            <div>
                              <strong>
                                {customer?.name ||
                                  "Unknown Customer"}
                              </strong>

                              <small>
                                {customer?.email ||
                                  "No email"}
                              </small>
                            </div>

                          </div>

                        </td>

                        <td className="amount">
                          ₹
                          {Number(
                            payment.amount
                          ).toLocaleString(
                            "en-IN"
                          )}
                        </td>

                        <td className="failure">
                          {payment.failure_reason ||
                            "Unknown"}
                        </td>

                        <td>

                          <span
                            className={
                              risk === "HIGH"
                                ? "status status-failed"
                                : "status"
                            }
                          >
                            {risk}
                          </span>

                        </td>

                        <td>
                          <strong className="recovery-action-text">
                            {recommendation}
                          </strong>
                        </td>

                        <td>

                          <button
                            className="analyze-button"
                            onClick={() =>
                              analyzePayment(
                                payment
                              )
                            }
                          >
                            ✨ Analyze
                          </button>

                        </td>

                      </tr>
                    );
                  }
                )

              )}

            </tbody>

          </table>

        </div>

        <div className="table-footer">
          Showing {filteredPayments.length} recovery
          payment
          {filteredPayments.length !== 1
            ? "s"
            : ""}
        </div>

      </div>

    </div>
  );
};
  // --------------------------------------------------
  // PAYMENTS PAGE FILTER
  // --------------------------------------------------

  const filteredPayments = useMemo(() => {
    const search = paymentSearch
      .trim()
      .toLowerCase();

    return payments.filter((payment) => {
      const customer = getCustomer(
        payment.customer_id
      );

      const customerName =
        customer?.name?.toLowerCase() || "";

      const customerEmail =
        customer?.email?.toLowerCase() || "";

      const paymentId =
        String(payment.id).toLowerCase();

      const matchesSearch =
        !search ||
        customerName.includes(search) ||
        customerEmail.includes(search) ||
        paymentId.includes(search);

      const status =
        payment.status?.toUpperCase();

      const matchesFilter =
        paymentFilter === "ALL" ||
        status === paymentFilter;

      return (
        matchesSearch &&
        matchesFilter
      );
    });
  }, [
    payments,
    customers,
    paymentSearch,
    paymentFilter,
  ]);

  const totalPaymentPages = Math.max(
    1,
    Math.ceil(filteredPayments.length / paymentsPerPage)
  );

  const paginatedPayments = filteredPayments.slice(
    (paymentPage - 1) * paymentsPerPage,
    paymentPage * paymentsPerPage
  );

  useEffect(() => {
    setPaymentPage(1);
  }, [paymentSearch, paymentFilter]);

  useEffect(() => {
    if (paymentPage > totalPaymentPages) {
      setPaymentPage(totalPaymentPages);
    }
  }, [paymentPage, totalPaymentPages]);

  // --------------------------------------------------
  // DASHBOARD
  // --------------------------------------------------

  const renderDashboard = () => {
    const failedPayments = payments.filter(
      (payment) => payment.status?.toUpperCase() === "FAILED"
    );

    const recentPayments = [...payments]
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, 6);

    const topRiskPayments = [...failedPayments]
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      .slice(0, 5);

    const successRate = payments.length
      ? Math.round((stats.successCount / payments.length) * 100)
      : 0;

    return (
      <div className="command-dashboard">
        <section className="command-welcome">
          <div>
            <div className="command-eyebrow">
              <span className="live-pulse" /> LIVE REVENUE MONITORING
              <span className="test-mode-pill">RAZORPAY TEST MODE</span>
            </div>
            <h1>Recover revenue before it is lost.</h1>
            <p>
              RecoverAI continuously diagnoses failed payments, prioritizes risk,
              and recommends the next best recovery action.
            </p>
          </div>
          <div className="command-date">
            <span>OPERATIONS CENTER</span>
            <strong>{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</strong>
          </div>
        </section>

        <section className="ai-command-hero">
          <div className="hero-copy">
            <span className="hero-kicker">AI REVENUE RECOVERY</span>
            <h2>Turn payment failures into recoverable revenue.</h2>
            <p>
              One command center for payment intelligence, customer history and
              automated recovery decisions.
            </p>
            <div className="hero-actions">
              <button className="hero-primary" onClick={() => setActivePage("Recovery")}>
                Open Recovery Center <span>→</span>
              </button>
              <button className="hero-secondary" onClick={() => setActivePage("Payments")}>
                View payment activity
              </button>
            </div>
          </div>

          <div className="ai-orbit-stage" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="ai-core">
              <span>✦</span>
              <small>AI</small>
            </div>
            <div className="floating-signal signal-risk">
              <span>RISK</span><strong>{failedPayments.length}</strong>
            </div>
            <div className="floating-signal signal-recovered">
              <span>RECOVERED</span><strong>₹{stats.recoveredRevenue.toLocaleString("en-IN")}</strong>
            </div>
          </div>
        </section>

        <section className="command-metrics">
          <div className="command-metric metric-risk">
            <div className="metric-label"><span>01</span> REVENUE AT RISK</div>
            <strong>₹{stats.revenueAtRisk.toLocaleString("en-IN")}</strong>
            <p>{stats.failedCount} failed payments need attention</p>
            <div className="metric-bar"><i style={{ width: `${Math.min(100, stats.failedCount * 3)}%` }} /></div>
          </div>
          <div className="command-metric metric-recovered">
            <div className="metric-label"><span>02</span> RECOVERED REVENUE</div>
            <strong>₹{stats.recoveredRevenue.toLocaleString("en-IN")}</strong>
            <p>{stats.recoveredCount} recovery decisions completed</p>
            <div className="metric-bar"><i style={{ width: `${Math.min(100, stats.recoveryRate)}%` }} /></div>
          </div>
          <div className="command-metric metric-volume">
            <div className="metric-label"><span>03</span> PAYMENTS MONITORED</div>
            <strong>{payments.length}</strong>
            <p>{stats.successCount} successful · {stats.failedCount} failed</p>
            <div className="metric-bar"><i style={{ width: `${Math.min(100, successRate)}%` }} /></div>
          </div>
          <div className="command-metric metric-rate">
            <div className="metric-label"><span>04</span> RECOVERY RATE</div>
            <strong>{stats.recoveryRate}%</strong>
            <p>Recovered vs. failed payment queue</p>
            <div className="metric-bar"><i style={{ width: `${Math.min(100, stats.recoveryRate)}%` }} /></div>
          </div>
        </section>

        <section className="command-main-grid">
          <div className="command-panel recovery-focus">
            <div className="command-panel-head">
              <div>
                <span className="panel-kicker">PRIORITY QUEUE</span>
                <h3>Payments that need a decision</h3>
              </div>
              <button className="text-action" onClick={() => setActivePage("Recovery")}>Open queue →</button>
            </div>

            <div className="priority-list">
              {loading ? (
                <div className="dashboard-empty">Loading payment intelligence…</div>
              ) : topRiskPayments.length === 0 ? (
                <div className="dashboard-empty"><strong>Queue is clear</strong><span>No failed payments currently require recovery.</span></div>
              ) : (
                topRiskPayments.map((payment) => {
                  const customer = getCustomer(payment.customer_id);
                  const reason = (payment.failure_reason || "").toLowerCase();
                  const risk = reason.includes("declined") || reason.includes("insufficient") ? "HIGH" : reason.includes("expired") ? "MEDIUM" : "MEDIUM";
                  const recommendation = reason.includes("declined") ? "SEND PAYMENT LINK" : reason.includes("expired") ? "NEW PAYMENT METHOD" : "RETRY PAYMENT";
                  return (
                    <div className="priority-row" key={payment.id}>
                      <div className="priority-index">#{payment.id}</div>
                      <div className="priority-customer">
                        <div className="priority-avatar">{customer?.name?.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase() || "CU"}</div>
                        <div><strong>{customer?.name || "Unknown Customer"}</strong><span>{payment.failure_reason || "Payment failed"}</span></div>
                      </div>
                      <div className="priority-amount">₹{Number(payment.amount || 0).toLocaleString("en-IN")}</div>
                      <span className={`risk-chip ${risk.toLowerCase()}`}>{risk}</span>
                      <div className="priority-action"><span>{recommendation}</span><button onClick={() => analyzePayment(payment)}>Analyze →</button></div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="command-panel health-panel">
            <div className="command-panel-head">
              <div><span className="panel-kicker">SYSTEM HEALTH</span><h3>Recovery performance</h3></div>
              <span className="healthy-badge"><i /> Healthy</span>
            </div>
            <div className="health-visual">
              <div className="health-ring" style={{ "--progress": `${Math.min(100, stats.recoveryRate)}%` }}>
                <div><strong>{stats.recoveryRate}%</strong><span>recovery</span></div>
              </div>
              <div className="health-summary">
                <div><span>Successful payments</span><strong>{stats.successCount}</strong></div>
                <div><span>Failed payments</span><strong>{stats.failedCount}</strong></div>
                <div><span>Recovered cases</span><strong>{stats.recoveredCount}</strong></div>
              </div>
            </div>
            <div className="health-foot"><span>AI monitoring active</span><strong>●</strong></div>
          </div>
        </section>

        <section className="command-panel activity-panel">
          <div className="command-panel-head">
            <div><span className="panel-kicker">LIVE ACTIVITY</span><h3>Recent payment movement</h3></div>
            <button className="text-action" onClick={() => setActivePage("Payments")}>View all →</button>
          </div>
          <div className="activity-grid-new">
            {recentPayments.map((payment) => {
              const customer = getCustomer(payment.customer_id);
              const successful = payment.status?.toUpperCase() === "SUCCESS";
              return (
                <div className="activity-card-new" key={payment.id}>
                  <div className={`activity-status-dot ${successful ? "success" : "failed"}`} />
                  <div className="activity-card-main">
                    <strong>{customer?.name || `Customer #${payment.customer_id}`}</strong>
                    <span>Payment #{payment.id} · {successful ? "Payment completed" : payment.failure_reason || "Payment failed"}</span>
                  </div>
                  <div className="activity-card-amount">₹{Number(payment.amount || 0).toLocaleString("en-IN")}</div>
                  <span className={`activity-state ${successful ? "success" : "failed"}`}>{successful ? "SUCCESS" : "FAILED"}</span>
                </div>
              );
            })}
          </div>
        </section>


      </div>
    );
  };

  // --------------------------------------------------
  // PAYMENTS PAGE
  // --------------------------------------------------

  const renderPaymentsPage = () => (
    <div className="page-container">

      <div className="page-title-row">

        <div>
          <h2 className="page-title">
            Payments
          </h2>

          <p className="page-subtitle">
            Complete payment history and recovery status
          </p>
        </div>

        <button
          className="refresh-button"
          onClick={loadData}
        >
          ↻ Refresh
        </button>

      </div>

      {/* PAYMENT SUMMARY */}

      <div className="payment-summary-grid">

        <div className="payment-summary-card">
          <span>Total Payments</span>
          <strong>{payments.length}</strong>
        </div>

        <div className="payment-summary-card">
          <span>Successful</span>
          <strong className="success-text">
            {stats.successCount}
          </strong>
        </div>

        <div className="payment-summary-card">
          <span>Failed</span>
          <strong className="danger-text">
            {stats.failedCount}
          </strong>
        </div>

        <div className="payment-summary-card">
          <span>Total Value</span>
          <strong>
            ₹
            {payments
              .reduce(
                (total, payment) =>
                  total +
                  Number(payment.amount || 0),
                0
              )
              .toLocaleString("en-IN")}
          </strong>
        </div>

      </div>

      {/* PAYMENT TABLE */}

      <div className="panel full-page-panel">

        <div className="payment-toolbar">

          <div className="payment-tabs">

            <button
              className={
                paymentFilter === "ALL"
                  ? "payment-tab active"
                  : "payment-tab"
              }
              onClick={() =>
                setPaymentFilter("ALL")
              }
            >
              All
              <span>
                {payments.length}
              </span>
            </button>

            <button
              className={
                paymentFilter === "SUCCESS"
                  ? "payment-tab active"
                  : "payment-tab"
              }
              onClick={() =>
                setPaymentFilter("SUCCESS")
              }
            >
              Success
              <span>
                {stats.successCount}
              </span>
            </button>

            <button
              className={
                paymentFilter === "FAILED"
                  ? "payment-tab active"
                  : "payment-tab"
              }
              onClick={() =>
                setPaymentFilter("FAILED")
              }
            >
              Failed
              <span>
                {stats.failedCount}
              </span>
            </button>

          </div>

          <input
            className="payments-search"
            value={paymentSearch}
            onChange={(event) =>
              setPaymentSearch(
                event.target.value
              )
            }
            placeholder="🔍  Search customer, email or payment ID..."
          />

        </div>

        <div className="full-table-wrapper">

          <table className="payments-table">

            <thead>

              <tr>
                <th>Payment ID</th>
                <th>Customer ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Failure Reason</th>
                <th>Action</th>
              </tr>

            </thead>

            <tbody>

              {loading ? (

                <tr>
                  <td
                    colSpan="7"
                    className="empty"
                  >
                    Loading payments...
                  </td>
                </tr>

              ) : filteredPayments.length === 0 ? (

                <tr>
                  <td
                    colSpan="7"
                    className="empty"
                  >
                    No payments match your search.
                  </td>
                </tr>

              ) : (

                paginatedPayments.map(
                  (payment) => {

                    const customer =
                      getCustomer(
                        payment.customer_id
                      );

                    const isFailed =
                      payment.status?.toUpperCase() ===
                      "FAILED";

                    return (

                      <tr key={payment.id}>

                        <td>
                          <span className="id-badge payment-id-badge">
                            #{payment.id}
                          </span>
                        </td>

                        <td>
                          <span className="id-badge customer-id-badge">
                            #{payment.customer_id}
                          </span>
                        </td>

                        <td>

                          <div className="customer">

                            <div className="customer-avatar">

                              {customer?.name
                                ?.split(" ")
                                .map(
                                  (word) =>
                                    word[0]
                                )
                                .join("")
                                .slice(0, 2)
                                .toUpperCase() ||
                                "CU"}

                            </div>

                            <div>

                              <strong>
                                {customer?.name ||
                                  "Unknown Customer"}
                              </strong>

                              <small>
                                {customer?.email ||
                                  "No email"}
                              </small>

                            </div>

                          </div>

                        </td>

                        <td className="amount">
                          ₹
                          {Number(
                            payment.amount
                          ).toLocaleString(
                            "en-IN"
                          )}
                        </td>

                        <td>

                          <span
                            className={`status ${
                              isFailed
                                ? "status-failed"
                                : "status-success"
                            }`}
                          >
                            {isFailed
                              ? "FAILED"
                              : "SUCCESS"}
                          </span>

                        </td>

                        <td className="failure">
                          {payment.failure_reason ||
                            "—"}
                        </td>

                        <td>

                          {isFailed ? (

                            <button
                              className="analyze-button"
                              onClick={() => {
                                setActivePage(
                                  "Dashboard"
                                );

                                analyzePayment(
                                  payment
                                );
                              }}
                            >
                              ✨ Analyze
                            </button>

                          ) : (

                            <span className="success-check">
                              ✓
                            </span>

                          )}

                        </td>

                      </tr>

                    );
                  }
                )

              )}

            </tbody>

          </table>

        </div>

        <div className="table-footer payment-pagination-footer">
          <span>
            Showing{" "}
            {filteredPayments.length === 0
              ? 0
              : (paymentPage - 1) * paymentsPerPage + 1}
            –
            {Math.min(
              paymentPage * paymentsPerPage,
              filteredPayments.length
            )}{" "}
            of {filteredPayments.length} payments
          </span>

          {totalPaymentPages > 1 && (
            <div className="pagination">
              <button
                disabled={paymentPage === 1}
                onClick={() =>
                  setPaymentPage((page) => Math.max(1, page - 1))
                }
              >
                ← Previous
              </button>

              {Array.from(
                { length: totalPaymentPages },
                (_, index) => index + 1
              ).map((page) => (
                <button
                  key={page}
                  className={paymentPage === page ? "active" : ""}
                  onClick={() => setPaymentPage(page)}
                >
                  {page}
                </button>
              ))}

              <button
                disabled={paymentPage === totalPaymentPages}
                onClick={() =>
                  setPaymentPage((page) =>
                    Math.min(totalPaymentPages, page + 1)
                  )
                }
              >
                Next →
              </button>
            </div>
          )}
        </div>

      </div>

    </div>
  );

  // --------------------------------------------------
  // ADDITIONAL PAGES
  // --------------------------------------------------
  const renderCustomersPage = () => {
  const customerRows = customers.map((customer) => {
    const customerPayments = payments.filter(
      (payment) => payment.customer_id === customer.id
    );

    const total = customerPayments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    const failed = customerPayments.filter(
      (payment) => payment.status?.toUpperCase() === "FAILED"
    ).length;

    return {
      ...customer,
      paymentCount: customerPayments.length,
      total,
      failed,
    };
  });

  return (
    <div className="page-container">
      <div className="page-title-row">
        <div>
          <h2 className="page-title">♙ Customers</h2>
          <p className="page-subtitle">
            Customer profiles and payment history
          </p>
        </div>

        <button className="refresh-button" onClick={loadData}>
          ↻ Refresh
        </button>
      </div>

      <div className="payment-summary-grid">
        <div className="payment-summary-card">
          <span>Total Customers</span>
          <strong>{customers.length}</strong>
        </div>

        <div className="payment-summary-card">
          <span>Customers With Payments</span>
          <strong>
            {customerRows.filter((c) => c.paymentCount > 0).length}
          </strong>
        </div>

        <div className="payment-summary-card">
          <span>Customer Payment Value</span>
          <strong>
            ₹
            {customerRows
              .reduce((sum, customer) => sum + customer.total, 0)
              .toLocaleString("en-IN")}
          </strong>
        </div>

        <div className="payment-summary-card">
          <span>Failed Payments</span>
          <strong className="danger-text">{stats.failedCount}</strong>
        </div>
      </div>

      <div className="panel full-page-panel">
        <div className="panel-header">
          <div>
            <h2>♙ &nbsp; Customer Directory</h2>
            <p>Customers connected to your payment data</p>
          </div>
        </div>

        <div className="full-table-wrapper">
          <table className="payments-table">
            <thead>
              <tr>
                <th>Customer ID</th>
                <th>Customer</th>
                <th>Email</th>
                <th>Payment IDs</th>
                <th>Total Value</th>
                <th>Failed</th>
                <th>Profile</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="empty">
                    Loading customers...
                  </td>
                </tr>
              ) : customerRows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty">
                    No customers available.
                  </td>
                </tr>
              ) : (
                customerRows.map((customer) => {
                  const linkedPayments = payments.filter(
                    (payment) => payment.customer_id === customer.id
                  );

                  return (
                    <tr key={customer.id}>
                      <td>
                        <span className="id-badge customer-id-badge">
                          #{customer.id}
                        </span>
                      </td>

                      <td>
                        <div className="customer">
                          <div className="customer-avatar">
                            {customer.name
                              ?.split(" ")
                              .map((word) => word[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase() || "CU"}
                          </div>

                          <div>
                            <strong>
                              {customer.name || "Unknown Customer"}
                            </strong>
                            <small>Payment records linked below</small>
                          </div>
                        </div>
                      </td>

                      <td>{customer.email || "—"}</td>

                      <td>
                        <div className="payment-id-list">
                          {linkedPayments.length > 0 ? (
                            linkedPayments.map((payment) => (
                              <span
                                className={`id-badge payment-id-badge ${
                                  payment.status?.toUpperCase() === "FAILED"
                                    ? "id-failed"
                                    : "id-success"
                                }`}
                                key={payment.id}
                              >
                                #{payment.id}
                              </span>
                            ))
                          ) : (
                            <span className="muted-id">—</span>
                          )}
                        </div>

                        <small className="payment-count-label">
                          {customer.paymentCount} payment
                          {customer.paymentCount !== 1 ? "s" : ""}
                        </small>
                      </td>

                      <td className="amount">
                        ₹{customer.total.toLocaleString("en-IN")}
                      </td>

                      <td>
                        <span
                          className={
                            customer.failed
                              ? "status status-failed"
                              : "status status-success"
                          }
                        >
                          {customer.failed}
                        </span>
                      </td>

                      <td>
                        <span className="status status-success">
                          ACTIVE
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
  const renderAnalyticsPage = () => {
    const totalValue = payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    const recoveredLogs = recoveryLogs.filter(
      (log) => log.result?.toUpperCase() === "RECOVERED"
    );

    const actionCounts = recoveryLogs.reduce((counts, log) => {
      const action = log.action || "UNKNOWN";
      counts[action] = (counts[action] || 0) + 1;
      return counts;
    }, {});

    const outcomeCounts = recoveryLogs.reduce((counts, log) => {
      const result = log.result || "UNKNOWN";
      counts[result] = (counts[result] || 0) + 1;
      return counts;
    }, {});

    const maxActionCount = Math.max(
      1,
      ...Object.values(actionCounts)
    );

    return (
      <div className="page-container">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">▥ Analytics</h2>
            <p className="page-subtitle">
              Measured revenue recovery across the current payment batch
            </p>
          </div>
          <button className="refresh-button" onClick={loadData}>
            ↻ Refresh
          </button>
        </div>

        <div className="analytics-grid">
          <div className="analytics-card">
            <span>Payments Monitored</span>
            <strong>{payments.length}</strong>
            <small>Current payment batch</small>
          </div>

          <div className="analytics-card danger-card">
            <span>Revenue at Risk</span>
            <strong>₹{stats.revenueAtRisk.toLocaleString("en-IN")}</strong>
            <small>{stats.failedCount} payments still failed</small>
          </div>

          <div className="analytics-card success-card">
            <span>Recovered Revenue</span>
            <strong>₹{stats.recoveredRevenue.toLocaleString("en-IN")}</strong>
            <small>{stats.recoveredCount} payments recovered by the agent</small>
          </div>

          <div className="analytics-card">
            <span>Recovery Rate</span>
            <strong>{stats.recoveryRate}%</strong>
            <small>Recovered ÷ recovered + still at risk</small>
          </div>
        </div>

        <div className="analytics-panels">
          <div className="panel analytics-panel">
            <div className="panel-header">
              <div>
                <h2>ϟ &nbsp; Recovery Outcomes</h2>
                <p>What happened after the AI recovery decision</p>
              </div>
            </div>
            <div className="metric-list">
              <div className="metric-row">
                <span>Recovered</span>
                <strong>{outcomeCounts.RECOVERED || 0}</strong>
                <div className="metric-bar">
                  <div style={{ width: `${recoveryLogs.length ? Math.round(((outcomeCounts.RECOVERED || 0) / recoveryLogs.length) * 100) : 0}%` }} />
                </div>
              </div>
              <div className="metric-row">
                <span>Customer Action Required</span>
                <strong>{outcomeCounts.CUSTOMER_ACTION_REQUIRED || 0}</strong>
                <div className="metric-bar failed">
                  <div style={{ width: `${recoveryLogs.length ? Math.round(((outcomeCounts.CUSTOMER_ACTION_REQUIRED || 0) / recoveryLogs.length) * 100) : 0}%` }} />
                </div>
              </div>
              <div className="metric-row">
                <span>No Action</span>
                <strong>{outcomeCounts.NO_ACTION || 0}</strong>
                <div className="metric-bar">
                  <div style={{ width: `${recoveryLogs.length ? Math.round(((outcomeCounts.NO_ACTION || 0) / recoveryLogs.length) * 100) : 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="panel analytics-panel">
            <div className="panel-header">
              <div>
                <h2>✦ &nbsp; Recovery Actions</h2>
                <p>Bounded actions selected by the recovery agent</p>
              </div>
            </div>
            <div className="metric-list">
              {[
                ["RETRY_PAYMENT", "Retry Payment"],
                ["SEND_PAYMENT_LINK", "Send Payment Link"],
                ["REQUEST_NEW_PAYMENT_METHOD", "New Payment Method"],
                ["NO_ACTION", "No Action"],
              ].map(([key, label]) => (
                <div className="metric-row" key={key}>
                  <span>{label}</span>
                  <strong>{actionCounts[key] || 0}</strong>
                  <div className="metric-bar">
                    <div style={{ width: `${Math.round(((actionCounts[key] || 0) / maxActionCount) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel analytics-recovery-summary">
          <div className="panel-header">
            <div>
              <h2>Revenue Recovery Summary</h2>
              <p>Evidence used for the Track 03 batch-recovery metric</p>
            </div>
            <span className="analytics-live-badge">LIVE DATA</span>
          </div>
          <div className="analytics-summary-grid">
            <div><span>Total payment value</span><strong>₹{totalValue.toLocaleString("en-IN")}</strong></div>
            <div><span>Recovery actions logged</span><strong>{recoveryLogs.length}</strong></div>
            <div><span>Recovered payments</span><strong>{stats.recoveredCount}</strong></div>
            <div><span>Still at risk</span><strong>{stats.failedCount}</strong></div>
          </div>
          {recoveredLogs.length === 0 && (
            <div className="analytics-note">
              No recovered payment logs are recorded yet. Complete a Test Mode recovery to populate this metric.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAuditPage = () => {
    const failed = payments.filter(
      (p) => p.status?.toUpperCase() === "FAILED"
    );
    const successful = payments.filter(
      (p) => p.status?.toUpperCase() === "SUCCESS"
    );

    return (
      <div className="page-container">
        <div className="page-title-row">
          <div>
            <h2 className="page-title">▤ Audit Trail</h2>
            <p className="page-subtitle">
              Review payment, analysis and recovery activity
            </p>
          </div>
          <button className="refresh-button" onClick={loadData}>
            ↻ Refresh
          </button>
        </div>

        <div className="audit-timeline">
          <div className="audit-item">
            <div className="audit-icon">✓</div>
            <div>
              <strong>Payment data loaded</strong>
              <p>{payments.length} payment records are currently available.</p>
            </div>
            <span>LIVE</span>
          </div>

          <div className="audit-item">
            <div className="audit-icon">!</div>
            <div>
              <strong>Failed payments detected</strong>
              <p>{failed.length} payment{failed.length !== 1 ? "s" : ""} require attention.</p>
            </div>
            <span>{failed.length}</span>
          </div>

          <div className="audit-item">
            <div className="audit-icon">✦</div>
            <div>
              <strong>AI analysis available</strong>
              <p>Failed payments can be analyzed using the existing AI endpoint.</p>
            </div>
            <span>READY</span>
          </div>

          <div className="audit-item">
            <div className="audit-icon">ϟ</div>
            <div>
              <strong>Recovery status</strong>
              <p>{successful.length} payment{successful.length !== 1 ? "s" : ""} currently have SUCCESS status.</p>
            </div>
            <span>{stats.recoveryRate}%</span>
          </div>
        </div>
      </div>
    );
  };

  const renderSettingsPage = () => (
    <div className="page-container">
      <div className="page-title-row">
        <div>
          <h2 className="page-title">⚙ Settings</h2>
          <p className="page-subtitle">
            RecoverAI workspace and system configuration
          </p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="panel settings-card">
          <h2>Workspace</h2>
          <p>Revenue Intelligence</p>
          <label>
            Workspace Name
            <input value="RecoverAI" readOnly />
          </label>
          <label>
            API Endpoint
            <input value={API} readOnly />
          </label>
        </div>

        <div className="panel settings-card">
          <h2>Recovery Controls</h2>
          <p>Current frontend recovery configuration</p>

          <div className="setting-row">
            <div>
              <strong>AI Analysis</strong>
              <small>Enabled for failed payments</small>
            </div>
            <span className="setting-enabled">ON</span>
          </div>

          <div className="setting-row">
            <div>
              <strong>Recovery Actions</strong>
              <small>Uses the existing backend recovery endpoint</small>
            </div>
            <span className="setting-enabled">ON</span>
          </div>

          <div className="setting-row">
            <div>
              <strong>Audit Logging</strong>
              <small>Recovery results are displayed in the UI</small>
            </div>
            <span className="setting-enabled">ON</span>
          </div>
        </div>
      </div>
    </div>
  );

  // --------------------------------------------------
  // PAGE CONTENT
  // --------------------------------------------------

  const renderPage = () => {
    if (activePage === "Dashboard") {
      return renderDashboard();
    }

    if (activePage === "Payments") {
      return renderPaymentsPage();
    }

    if (activePage === "Recovery") {
      return renderRecoveryPage();
    }

    if (activePage === "Customers") {
      return renderCustomersPage();
    }

    if (activePage === "Analytics") {
      return renderAnalyticsPage();
    }

    if (activePage === "Audit Trail") {
      return renderAuditPage();
    }

    if (activePage === "Settings") {
      return renderSettingsPage();
    }

    return renderDashboard();
  };


  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <div className="app">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-logo">
            R
          </div>

          <div>

            <div className="brand-name">
              RecoverAI
            </div>

            <div className="brand-subtitle">
              Revenue Intelligence
            </div>

          </div>

        </div>

        <nav className="navigation">

          <NavItem
            icon="⌂"
            text="Dashboard"
            active={
              activePage === "Dashboard"
            }
            onClick={() =>
              setActivePage("Dashboard")
            }
          />

          <NavItem
            icon="▣"
            text="Payments"
            active={
              activePage === "Payments"
            }
            onClick={() =>
              setActivePage("Payments")
            }
          />

          <NavItem
            icon="ϟ"
            text="Recovery"
            active={
              activePage === "Recovery"
            }
            onClick={() =>
              setActivePage("Recovery")
            }
          />

          <NavItem
            icon="♙"
            text="Customers"
            active={
              activePage === "Customers"
            }
            onClick={() =>
              setActivePage("Customers")
            }
          />

          <NavItem
            icon="▥"
            text="Analytics"
            active={
              activePage === "Analytics"
            }
            onClick={() =>
              setActivePage("Analytics")
            }
          />

          <NavItem
            icon="▤"
            text="Audit Trail"
            active={
              activePage === "Audit Trail"
            }
            onClick={() =>
              setActivePage("Audit Trail")
            }
          />

          <NavItem
            icon="⚙"
            text="Settings"
            active={
              activePage === "Settings"
            }
            onClick={() =>
              setActivePage("Settings")
            }
          />

        </nav>

        <div className="sidebar-bottom">

          <div className="system-card">

            <div className="system-title">

              <span className="status-dot"></span>

              System Operational

            </div>

            <div className="system-text">
              All systems running smoothly
            </div>

            <div className="api-status">
              API Connected
            </div>

          </div>

          <div className="user-profile">

            <div className="avatar">
              RS
            </div>

            <div>

              <div className="user-name">
                RecoverAI Admin
              </div>

              <div className="user-role">
                Administrator
              </div>

            </div>

          </div>

        </div>

      </aside>

      {/* MAIN */}

      <main className="main">

        {/* HEADER */}

        <header className="header">

          <div>

            <h1>
              Revenue Recovery <span>👋</span>
            </h1>

            <p>
              AI-powered insights to recover failed
              payments and maximize revenue
            </p>

          </div>

          <div className="header-actions">

            <div className="date-box">

              📅 &nbsp;

              {new Date().toLocaleDateString(
                "en-IN",
                {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }
              )}

            </div>

            <div className="period-box">
              Last 7 Days ▾
            </div>

            <div className="notification">

              🔔

              <span>
                3
              </span>

            </div>

          </div>

        </header>

        {/* ERROR */}

        {error && (

          <div className="error-banner">
            ⚠️ {error}
          </div>

        )}

        {/* CURRENT PAGE */}

        {renderPage()}

      </main>

      {/* DECISION MODAL - outside the scrolling main container */}
        {showDecision && selectedPayment && analysis && (
          <div className="decision-modal-backdrop" onClick={() => setShowDecision(false)}>
            <div className="decision-modal" onClick={(event) => event.stopPropagation()}>
              <div className="decision-modal-header"><div><span className="panel-kicker">RECOVERAI DECISION CENTER</span><h2>Payment #{selectedPayment.id} decision</h2><p>{getCustomer(selectedPayment.customer_id)?.name || "Customer"} · ₹{Number(selectedPayment.amount || 0).toLocaleString("en-IN")}</p></div><button className="decision-close" onClick={() => setShowDecision(false)}>×</button></div>
              <div className="decision-modal-grid"><div><span>RISK</span><strong>{analysis.risk || "—"}</strong></div><div><span>AI RECOMMENDATION</span><strong>{analysis.recommendation || "—"}</strong></div><div><span>CONFIDENCE</span><strong>{analysis.confidence !== undefined ? `${Math.round(Number(analysis.confidence) * 100)}%` : "—"}</strong></div><div><span>AI PROVIDER</span><strong>{analysis.ai_provider || "—"}</strong></div></div>
              <div className="decision-modal-reason"><span>WHY THIS DECISION?</span><p>{analysis.reason || "RecoverAI analyzed this payment and selected the recommended recovery strategy."}</p></div>
              {analysis.recovery_status && <div className="decision-modal-recovery"><div><span>RECOVERY STATUS</span><strong>{String(analysis.recovery_status).replaceAll("_", " ")}</strong></div>{analysis.action && <div><span>ACTION EXECUTED</span><strong>{analysis.action}</strong></div>}{analysis.recovery_log_id && <div><span>AUDIT LOG</span><strong>#{analysis.recovery_log_id}</strong></div>}</div>}
              {analysis.message && <div className="decision-modal-message">{analysis.message}</div>}
              {analysis.payment_link && <div className="decision-modal-payment-link"><div><span>RAZORPAY PAYMENT LINK</span><strong>Customer action required</strong>{analysis.razorpay_payment_link_id && <small>Link ID: {analysis.razorpay_payment_link_id}</small>}</div><a href={analysis.payment_link} target="_blank" rel="noopener noreferrer">Open Payment Link ↗</a></div>}
              <div className="decision-modal-actions"><button className="secondary-button" onClick={() => setShowDecision(false)}>Close</button>{!analysis.recovery_status || !["RECOVERED","CUSTOMER_ACTION_REQUIRED","NO_ACTION"].includes(analysis.recovery_status) ? <button className="recover-button" onClick={recoverPayment} disabled={recovering}>{recovering ? "Executing..." : "ϟ Recover Payment"}</button> : <button className="recover-button" onClick={() => setShowDecision(false)}>Decision completed</button>}</div>
            </div>
          </div>
        )}

    </div>
  );
}

// ==================================================
// NAV ITEM
// ==================================================

function NavItem({
  icon,
  text,
  active,
  onClick,
}) {
  return (
    <button
      className={`nav-item ${
        active ? "active" : ""
      }`}
      onClick={onClick}
    >

      <span className="nav-icon">
        {icon}
      </span>

      <span>
        {text}
      </span>

    </button>
  );
}

// ==================================================
// STAT CARD
// ==================================================

function StatCard({
  title,
  value,
  subtitle,
  icon,
  type,
}) {
  return (
    <div className="stat-card">

      <div className="stat-top">

        <div>

          <div className="stat-title">
            {title}
          </div>

          <div
            className={`stat-value ${type}`}
          >
            {value}
          </div>

          <div className="stat-subtitle">
            {subtitle}
          </div>

        </div>

        <div
          className={`stat-icon ${type}`}
        >
          {icon}
        </div>

      </div>

      <div className="stat-bottom">

        <span className={type}>
          ↑
        </span>

        &nbsp; Live data from backend

      </div>

    </div>
  );
}

// ==================================================
// WORKFLOW STEP
// ==================================================

function WorkflowStep({
  number,
  title,
  text,
  complete,
}) {
  return (
    <div className="workflow-step">

      <div
        className={`workflow-number ${
          complete ? "complete" : ""
        }`}
      >
        {number}
      </div>

      <div>

        <strong>
          {title}
        </strong>

        <p>
          {text}
        </p>

      </div>

    </div>
  );
}

// ==================================================
// ACTIVITY
// ==================================================

function Activity({
  icon,
  title,
  text,
}) {
  return (
    <div className="activity">

      <div className="activity-icon">
        {icon}
      </div>

      <div>

        <strong>
          {title}
        </strong>

        <p>
          {text}
        </p>

      </div>

    </div>
  );
}

export default App;