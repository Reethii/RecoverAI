from database import SessionLocal
import models

# ============================================================
# RECOVERAI - CLEAN 10 CUSTOMER DEMO DATA
# ============================================================
# Demo distribution:
#   2  -> RETRY PAYMENT
#   3  -> SEND PAYMENT LINK
#   3  -> REQUEST NEW PAYMENT METHOD
#   2  -> NO ACTION
#
# Total:
#   10 customers
#   20 payments
#   8 failed current payments
#   12 successful payments
#
# The first 10 inserted payments are the current/demo payments,
# so the Payments page shows a clean first page of all scenarios.
# The next 10 are previous successful payments used as customer
# payment history for AI analysis.
# ============================================================

db = SessionLocal()

try:
    # --------------------------------------------------------
    # SAFETY CHECK
    # --------------------------------------------------------
    existing_customers = db.query(models.Customer).count()

    if existing_customers != 0:
        print(
            f"Clearing existing demo data "
            f"({existing_customers} customers)..."
        )
        db.query(models.RecoveryLog).delete()
        db.query(models.Payment).delete()
        db.query(models.Customer).delete()
        db.commit()

    # --------------------------------------------------------
    # 10 CUSTOMERS
    # --------------------------------------------------------
    customers = [
        # RETRY PAYMENT - 2
        ("Aarav Sharma", "aarav.sharma@example.com", "+91 9000000001"),
        ("Ananya Rao", "ananya.rao@example.com", "+91 9000000002"),

        # SEND PAYMENT LINK - 3
        ("Rohan Mehta", "rohan.mehta@example.com", "+91 9000000003"),
        ("Ishita Nair", "ishita.nair@example.com", "+91 9000000004"),
        ("Arjun Kapoor", "arjun.kapoor@example.com", "+91 9000000005"),

        # REQUEST NEW PAYMENT METHOD - 3
        ("Meera Iyer", "meera.iyer@example.com", "+91 9000000006"),
        ("Karan Malhotra", "karan.malhotra@example.com", "+91 9000000007"),
        ("Sneha Joshi", "sneha.joshi@example.com", "+91 9000000008"),

        # NO ACTION - 2
        ("Vikram Desai", "vikram.desai@example.com", "+91 9000000009"),
        ("Priya Menon", "priya.menon@example.com", "+91 9000000010"),
    ]

    customer_objects = []

    for name, email, phone in customers:
        customer = models.Customer(
            name=name,
            email=email,
            phone=phone
        )
        db.add(customer)
        customer_objects.append(customer)

    db.commit()

    # Refresh IDs
    for customer in customer_objects:
        db.refresh(customer)

    # --------------------------------------------------------
    # PAYMENT DATA
    # --------------------------------------------------------
    payments = []

    # ========================================================
    # CURRENT / DEMO PAYMENTS
    # These are inserted first so the first Payments page
    # contains the 10 clean demo scenarios.
    # ========================================================

    # --------------------------------------------------------
    # 1-2 : RETRY PAYMENT
    # Failure: temporary timeout
    # AI decision: RETRY PAYMENT
    # --------------------------------------------------------
    retry_amounts = [2400, 3200]

    for i in range(2):
        customer = customer_objects[i]

        payments.append(
            models.Payment(
                customer_id=customer.id,
                amount=retry_amounts[i],
                status="FAILED",
                failure_reason="Temporary timeout during payment processing"
            )
        )

    # --------------------------------------------------------
    # 3-5 : SEND PAYMENT LINK
    # Failure: payment method declined
    # AI decision: SEND PAYMENT LINK
    # --------------------------------------------------------
    link_amounts = [6800, 4500, 7200]

    for i in range(3):
        customer = customer_objects[2 + i]

        payments.append(
            models.Payment(
                customer_id=customer.id,
                amount=link_amounts[i],
                status="FAILED",
                failure_reason="Payment method declined"
            )
        )

    # --------------------------------------------------------
    # 6-8 : REQUEST NEW PAYMENT METHOD
    # Failure: payment method expired
    # AI decision: REQUEST NEW PAYMENT METHOD
    # --------------------------------------------------------
    method_amounts = [12500, 9800, 7600]

    for i in range(3):
        customer = customer_objects[5 + i]

        payments.append(
            models.Payment(
                customer_id=customer.id,
                amount=method_amounts[i],
                status="FAILED",
                failure_reason="Payment method expired"
            )
        )

    # --------------------------------------------------------
    # 9-10 : NO ACTION
    # Payment already successful
    # AI decision: NO ACTION
    # --------------------------------------------------------
    no_action_amounts = [2200, 3400]

    for i in range(2):
        customer = customer_objects[8 + i]

        payments.append(
            models.Payment(
                customer_id=customer.id,
                amount=no_action_amounts[i],
                status="SUCCESS",
                failure_reason=None
            )
        )

    # ========================================================
    # PREVIOUS SUCCESSFUL PAYMENTS
    # These provide payment history/context for the 8 customers
    # whose current payment has failed.
    # ========================================================
    previous_success_amounts = [
        1800,
        2100,
        2500,
        2800,
        3000,
        3200,
        3500,
        3800,
        1900,
        2300
    ]

    for i in range(10):
        customer = customer_objects[i]

        payments.append(
            models.Payment(
                customer_id=customer.id,
                amount=previous_success_amounts[i],
                status="SUCCESS",
                failure_reason=None
            )
        )

    # --------------------------------------------------------
    # INSERT PAYMENTS
    # --------------------------------------------------------
    db.add_all(payments)
    db.commit()

    # --------------------------------------------------------
    # SUMMARY
    # --------------------------------------------------------
    total_customers = db.query(models.Customer).count()
    total_payments = db.query(models.Payment).count()

    failed_payments = db.query(models.Payment).filter(
        models.Payment.status == "FAILED"
    ).count()

    successful_payments = db.query(models.Payment).filter(
        models.Payment.status == "SUCCESS"
    ).count()

    print()
    print("=" * 60)
    print("        RECOVERAI DEMO DATA CREATED SUCCESSFULLY")
    print("=" * 60)
    print(f"Customers           : {total_customers}")
    print(f"Total Payments      : {total_payments}")
    print(f"Failed Payments     : {failed_payments}")
    print(f"Successful Payments : {successful_payments}")
    print()
    print("Recovery Scenarios")
    print("----------------------------")
    print("Retry Payment       : 2")
    print("Send Payment Link   : 3")
    print("New Payment Method  : 3")
    print("No Action           : 2")
    print("----------------------------")
    print("TOTAL CUSTOMERS     : 10")
    print("TOTAL PAYMENTS      : 20")
    print("=" * 60)
    print()

except Exception as e:
    db.rollback()
    print()
    print("ERROR while creating demo data:")
    print(e)
    print()

finally:
    db.close()