import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = "https://recoverai-idw1.onrender.com";

function App() {
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [recoveryLogs, setRecoveryLogs] = useState([]);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [analysis, setAnalysis] = useState(null);
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
        throw new Error(
          data.message || "Recovery failed"
        );
      }

      setAnalysis((previous) => ({
        ...(previous || {}),
        recovery_status: data.recovery_status,
        action: data.action,
        recovery_log_id: data.recovery_log_id,
        message: data.message,
        risk: data.risk ?? previous?.risk,
        confidence: data.confidence ?? previous?.confidence,
        ai_provider: data.ai_provider ?? previous?.ai_provider,
        razorpay_payment_link_id: data.razorpay_payment_link_id ?? previous?.razorpay_payment_link_id,
        payment_link: data.payment_link ?? previous?.payment_link,
      }));

      if (data.recovery_status === "RECOVERED") {
        setSelectedPayment((previous) => ({
          ...previous,
          status: "SUCCESS",
          failure_reason: null,
        }));
      }

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

  // --------------------------------------------------
  // DASHBOARD
  // --------------------------------------------------

  const renderDashboard = () => (
    <>
    
      {/* KPI CARDS */}

      <section className="stats-grid">

        <StatCard
          title="REVENUE AT RISK"
          value={`₹${stats.revenueAtRisk.toLocaleString(
            "en-IN"
          )}`}
          subtitle={`${stats.failedCount} failed payment${
            stats.failedCount !== 1
              ? "s"
              : ""
          }`}
          icon="⚠"
          type="warning"
        />

        <StatCard
          title="RECOVERED REVENUE"
          value={`₹${stats.recoveredRevenue.toLocaleString(
            "en-IN"
          )}`}
          subtitle={`${stats.successCount} successful payment${
            stats.successCount !== 1
              ? "s"
              : ""
          }`}
          icon="✓"
          type="success"
        />

        <StatCard
          title="FAILED PAYMENTS"
          value={stats.failedCount}
          subtitle="Needs attention"
          icon="!"
          type="danger"
        />

        <StatCard
          title="RECOVERY RATE"
          value={`${stats.recoveryRate}%`}
          subtitle="Payment success rate"
          icon="↗"
          type="info"
        />

      </section>

      {/* CONTENT GRID */}

      <section className="content-grid">

        {/* PAYMENT QUEUE */}

        <div className="panel payment-panel">

          <div className="panel-header">

            <div>
              <h2>
                ▣ &nbsp; Payment Recovery Queue
              </h2>

              <p>
                Monitor and recover failed payments
              </p>
            </div>

            <button
              className="refresh-button"
              onClick={loadData}
            >
              ↻ Refresh
            </button>

          </div>

          <div className="filters">

            <div className="filter active">
              All&nbsp; {payments.length}
            </div>

            <div className="filter failed">
              Failed&nbsp; {stats.failedCount}
            </div>

            <div className="filter success">
              Success&nbsp; {stats.successCount}
            </div>

            <input
              className="search"
              placeholder="Search payments..."
            />

          </div>

          <div className="table-wrapper">

            <table>

              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Failure Reason</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>

                {loading ? (

                  <tr>
                    <td
                      colSpan="6"
                      className="empty"
                    >
                      Loading payments...
                    </td>
                  </tr>

                ) : payments.length === 0 ? (

                  <tr>
                    <td
                      colSpan="6"
                      className="empty"
                    >
                      No payments available
                    </td>
                  </tr>

                ) : (

                  payments.map((payment) => {

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

                        <td className="date">

                          {new Date().toLocaleDateString(
                            "en-IN"
                          )}

                          <small>
                            Today
                          </small>

                        </td>

                        <td>

                          {isFailed ? (

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

                          ) : (

                            <span className="success-check">
                              ✓
                            </span>

                          )}

                        </td>

                      </tr>

                    );
                  })

                )}

              </tbody>

            </table>

          </div>

          <div className="table-footer">
            Showing {payments.length} payment
            {payments.length !== 1
              ? "s"
              : ""}
          </div>

        </div>

        {/* AI INSIGHT */}

        <div className="panel insight-panel">

          <div className="panel-header">

            <div>

              <h2>
                ✦ &nbsp; AI Recovery Insight
              </h2>

              <p>
                Select a failed payment to get
                AI recommendation
              </p>

            </div>

            <span className="ai-badge">
              AI ENGINE
            </span>

          </div>

          {!selectedPayment ? (

            <div className="insight-empty">

              <div className="empty-icon">
                ◎
              </div>

              <h3>
                Select a payment
              </h3>

              <p>
                Click "Analyze" on a failed
                payment to see RecoverAI's
                recommendation.
              </p>

            </div>

          ) : analyzing ? (

            <div className="insight-empty">

              <div className="loader">
                ✦
              </div>

              <h3>
                AI is analyzing...
              </h3>

              <p>
                Diagnosing payment failure and
                selecting the best recovery strategy.
              </p>

            </div>

          ) : analysis ? (

            <div className="insight-content">

              <div className="insight-customer">

                <div className="large-avatar">

                  {getCustomer(
                    selectedPayment.customer_id
                  )
                    ?.name
                    ?.split(" ")
                    .map(
                      (word) => word[0]
                    )
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() ||
                    "CU"}

                </div>

                <div>

                  <h3>
                    {getCustomer(
                      selectedPayment.customer_id
                    )?.name ||
                      "Customer"}
                  </h3>

                  <p>
                    Payment #
                    {selectedPayment.id}
                  </p>

                </div>

                <strong className="insight-amount">

                  ₹
                  {Number(
                    selectedPayment.amount
                  ).toLocaleString(
                    "en-IN"
                  )}

                </strong>

              </div>

              <div className="risk-box">

                <div>

                  <small>
                    RISK LEVEL
                  </small>

                  <strong className="risk-high">
                    {analysis.risk}
                  </strong>

                </div>

                <div className="vertical-line"></div>

                <div>

                  <small>
                    RECOMMENDED ACTION
                  </small>

                  <strong>
                    {analysis.recommendation}
                  </strong>

                </div>

              </div>

              <div className="reason-section">

                <small>
                  FAILURE REASON
                </small>

                <strong>
                  {analysis.failure_reason ||
                    "Unknown"}
                </strong>

              </div>

              <div className="ai-analysis">

                <div className="ai-analysis-header">
                  <div className="ai-analysis-title">
                    ✦ AI Analysis
                  </div>

                  {analysis.ai_provider && (
                    <span className="gemini-badge">
                      {analysis.ai_provider}
                    </span>
                  )}
                </div>

                <p>
                  {analysis.reason}
                </p>

                {(analysis.confidence !== undefined || analysis.ai_provider) && (
                  <div className="ai-meta">
                    {analysis.confidence !== undefined && (
                      <div className="ai-confidence">
                        <span>AI Confidence</span>
                        <strong>
                          {Math.round(Number(analysis.confidence) * 100)}%
                        </strong>
                      </div>
                    )}

                    {analysis.ai_provider && (
                      <div className="ai-provider-text">
                        Decision powered by <strong>{analysis.ai_provider}</strong>
                      </div>
                    )}
                  </div>
                )}

              </div>

              {analysis.recovery_status && (

                <div className="recovery-result">

                  <div className="recovery-result-header">
                    <strong>Recovery Result</strong>
                    <span className={`recovery-status ${String(analysis.recovery_status).toLowerCase()}`}>
                      {analysis.recovery_status}
                    </span>
                  </div>

                  <div className="recovery-result-grid">

                    {analysis.action && (
                      <div>
                        <span>Action Executed</span>
                        <strong>{analysis.action}</strong>
                      </div>
                    )}

                    {analysis.risk && (
                      <div>
                        <span>Risk</span>
                        <strong>{analysis.risk}</strong>
                      </div>
                    )}

                    {analysis.confidence !== undefined && (
                      <div>
                        <span>AI Confidence</span>
                        <strong>
                          {Math.round(Number(analysis.confidence) * 100)}%
                        </strong>
                      </div>
                    )}

                    {analysis.recovery_log_id && (
                      <div>
                        <span>Audit Log</span>
                        <strong>#{analysis.recovery_log_id}</strong>
                      </div>
                    )}

                  </div>

                  {analysis.message && (
                    <p>{analysis.message}</p>
                  )}

                  {analysis.payment_link && (
                    <div className="razorpay-link-card">
                      <div className="razorpay-link-icon">↗</div>
                      <div className="razorpay-link-content">
                        <strong>Razorpay Payment Link Created</strong>
                        <span>Customer can complete the payment securely.</span>
                        {analysis.razorpay_payment_link_id && (
                          <small>Payment Link ID: {analysis.razorpay_payment_link_id}</small>
                        )}
                      </div>
                      <a
                        className="razorpay-link-button"
                        href={analysis.payment_link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open Payment Link ↗
                      </a>
                    </div>
                  )}

                  {analysis.ai_provider && (
                    <small>
                      Recovery decision powered by <strong>{analysis.ai_provider}</strong>
                    </small>
                  )}

                </div>

              )}

              <div className="insight-actions">

                <button
                  className="secondary-button"
                  onClick={() =>
                    analyzePayment(
                      selectedPayment
                    )
                  }
                  disabled={recovering}
                >
                  ↻ Analyze Again
                </button>

                {!["RECOVERED", "CUSTOMER_ACTION_REQUIRED", "NO_ACTION"].includes(
                  analysis.recovery_status
                ) && (

                  <button
                    className="recover-button"
                    onClick={recoverPayment}
                    disabled={recovering}
                  >
                    {recovering
                      ? "Recovering..."
                      : "ϟ Recover Payment"}
                  </button>

                )}

              </div>

            </div>

          ) : null}

        </div>

      </section>

      {/* RECOVERY WORKFLOW */}

      <section className="bottom-grid">

        <div className="panel workflow-panel">

          <div className="panel-header">

            <div>

              <h2>
                ✦ &nbsp; Recovery Workflow
              </h2>

              <p>
                How RecoverAI closes the revenue loop
              </p>

            </div>

          </div>

          <div className="workflow">

            <WorkflowStep
              number="✓"
              title="Detect"
              text="Identify failed payment"
              complete
            />

            <WorkflowStep
              number="✓"
              title="Diagnose"
              text="Determine failure reason"
              complete
            />

            <WorkflowStep
              number="3"
              title="Decide"
              text="Select recovery strategy"
            />

            <WorkflowStep
              number="4"
              title="Recover"
              text="Execute bounded action"
            />

          </div>

        </div>

        <div className="panel activity-panel">

          <div className="panel-header">

            <div>

              <h2>
                ↻ &nbsp; Recent Recovery Activity
              </h2>

              <p>
                Latest recovery actions and results
              </p>

            </div>

            <button className="link-button">
              View All Activity →
            </button>

          </div>

          <div className="activity-list">

            <Activity
              icon="✓"
              title="Payment Monitoring"
              text="RecoverAI is monitoring payment failures"
            />

            <Activity
              icon="✦"
              title="AI Analysis"
              text="Failure reasons are analyzed automatically"
            />

            <Activity
              icon="ϟ"
              title="Recovery Action"
              text="Bounded recovery action is executed"
            />

            <Activity
              icon="▤"
              title="Audit Logged"
              text="Recovery events are recorded"
            />

          </div>

        </div>

      </section>
    </>
  );

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

                filteredPayments.map(
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

        <div className="table-footer">
          Showing {filteredPayments.length} of{" "}
          {payments.length} payments
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
            <strong>{customerRows.filter((c) => c.paymentCount > 0).length}</strong>
          </div>
          <div className="payment-summary-card">
            <span>Customer Payment Value</span>
            <strong>
              ₹{customerRows.reduce((s, c) => s + c.total, 0).toLocaleString("en-IN")}
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
                    <td colSpan="7" className="empty">Loading customers...</td>
                  </tr>
                ) : customerRows.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty">No customers available.</td>
                  </tr>
                ) : (
                  customerRows.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <span className="id-badge customer-id-badge">
                          #{customer.id}
                        </span>
                      </td>
                      <td>
                        <div className="customer">
                          <div className="customer-avatar">
                            {customer.name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "CU"}
                          </div>
                          <div>
                            <strong>{customer.name || "Unknown Customer"}</strong>
                            <small>Payment records linked below</small>
                          </div>
                        </div>
                      </td>
                      <td>{customer.email || "—"}</td>
                      <td>
                        <div className="payment-id-list">
  {payments.filter((payment) => payment.customer_id === customer.id).length > 0 ? (
    payments
      .filter((payment) => payment.customer_id === customer.id)
      .map((payment) => (
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
                          {customer.paymentCount} payment{customer.paymentCount !== 1 ? "s" : ""}
                        </small>
                      </td>
                      <td className="amount">₹{customer.total.toLocaleString("en-IN")}</td>
                      <td>
                        <span className={customer.failed ? "status status-failed" : "status status-success"}>
                          {customer.failed}
                        </span>
                      </td>
                      <td>
                        <span className="status status-success">ACTIVE</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            Showing {customerRows.length} customer{customerRows.length !== 1 ? "s" : ""}
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