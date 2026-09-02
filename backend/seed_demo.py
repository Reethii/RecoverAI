from database import SessionLocal
import models

# ============================================================
# RECOVERAI - FRESH 35 CUSTOMER DEMO DATA
# ============================================================

db = SessionLocal()

try:
    # --------------------------------------------------------
    # SAFETY CHECK
    # --------------------------------------------------------
    existing_customers = db.query(models.Customer).count()

    if existing_customers != 0:
        print(f"ERROR: Database already contains {existing_customers} customers.")
        print("Please make sure recoverai.db was deleted before running this script.")
        raise SystemExit(1)

    # --------------------------------------------------------
    # 35 CUSTOMERS
    # --------------------------------------------------------
    customers = [
        # RETRY PAYMENT - 9
        ("Aarav Sharma", "aarav.sharma@example.com", "+91 9000000001"),
        ("Ananya Rao", "ananya.rao@example.com", "+91 9000000002"),
        ("Rohan Mehta", "rohan.mehta@example.com", "+91 9000000003"),
        ("Ishita Nair", "ishita.nair@example.com", "+91 9000000004"),
        ("Arjun Kapoor", "arjun.kapoor@example.com", "+91 9000000005"),
        ("Meera Iyer", "meera.iyer@example.com", "+91 9000000006"),
        ("Karan Malhotra", "karan.malhotra@example.com", "+91 9000000007"),
        ("Sneha Joshi", "sneha.joshi@example.com", "+91 9000000008"),
        ("Vikram Desai", "vikram.desai@example.com", "+91 9000000009"),

        # PAYMENT LINK - 9
        ("Priya Menon", "priya.menon@example.com", "+91 9000000010"),
        ("Aditya Verma", "aditya.verma@example.com", "+91 9000000011"),
        ("Neha Kulkarni", "neha.kulkarni@example.com", "+91 9000000012"),
        ("Rahul Bhat", "rahul.bhat@example.com", "+91 9000000013"),
        ("Kavya Reddy", "kavya.reddy@example.com", "+91 9000000014"),
        ("Siddharth Jain", "siddharth.jain@example.com", "+91 9000000015"),
        ("Pooja Shah", "pooja.shah@example.com", "+91 9000000016"),
        ("Nikhil Shetty", "nikhil.shetty@example.com", "+91 9000000017"),
        ("Divya Krishnan", "divya.krishnan@example.com", "+91 9000000018"),

        # NEW PAYMENT METHOD - 8
        ("Manish Agarwal", "manish.agarwal@example.com", "+91 9000000019"),
        ("Tanvi Sinha", "tanvi.sinha@example.com", "+91 9000000020"),
        ("Harsh Vardhan", "harsh.vardhan@example.com", "+91 9000000021"),
        ("Riya Patel", "riya.patel@example.com", "+91 9000000022"),
        ("Akash Gupta", "akash.gupta@example.com", "+91 9000000023"),
        ("Nandini Rao", "nandini.rao@example.com", "+91 9000000024"),
        ("Yash Raj", "yash.raj@example.com", "+91 9000000025"),
        ("Simran Kaur", "simran.kaur@example.com", "+91 9000000026"),

        # NO ACTION - 9
        ("Aniket Roy", "aniket.roy@example.com", "+91 9000000027"),
        ("Shreya Das", "shreya.das@example.com", "+91 9000000028"),
        ("Mohit Arora", "mohit.arora@example.com", "+91 9000000029"),
        ("Aditi Singh", "aditi.singh@example.com", "+91 9000000030"),
        ("Varun Kumar", "varun.kumar@example.com", "+91 9000000031"),
        ("Lakshmi Narayan", "lakshmi.narayan@example.com", "+91 9000000032"),
        ("Dev Patel", "dev.patel@example.com", "+91 9000000033"),
        ("Sanya Kapoor", "sanya.kapoor@example.com", "+91 9000000034"),
        ("Ritesh Gowda", "ritesh.gowda@example.com", "+91 9000000035"),
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
    # 1-9 : RETRY PAYMENT
    # ========================================================

    retry_amounts = [
        2400, 3200, 1800, 4500, 2750,
        3900, 2100, 5200, 3500
    ]

    for i in range(9):
        customer = customer_objects[i]

        # Previous successful payment gives Gemini context
        payments.append(
            models.Payment(
                customer_id=customer.id,
                amount=1800 + (i * 150),
                status="SUCCESS",
                failure_reason=None
            )
        )

        # Current failed payment
        payments.append(
            models.Payment(
                customer_id=customer.id,
                amount=retry_amounts[i],
                status="FAILED",
                failure_reason="Temporary timeout during payment processing"
            )
        )

    # ========================================================
    # 10-18 : SEND PAYMENT LINK
    # ========================================================

    link_amounts = [
        6800, 4500, 7200, 5600, 8400,
        6300, 9100, 4800, 7600
    ]

    for i in range(9):
        customer = customer_objects[9 + i]

        payments.append(
            models.Payment(
                customer_id=customer.id,
                amount=2500 + (i * 200),
                status="SUCCESS",
                failure_reason=None
            )
        )

        payments.append(
            models.Payment(
                customer_id=customer.id,
                amount=link_amounts[i],
                status="FAILED",
                failure_reason="Payment method declined"
            )
        )

    # ========================================================
    # 19-26 : REQUEST NEW PAYMENT METHOD
    # ========================================================

    method_amounts = [
        12500, 9800, 7600, 11400,
        8900, 13200, 6700, 10500
    ]

    for i in range(8):
        customer = customer_objects[18 + i]

        payments.append(
            models.Payment(
                customer_id=customer.id,
                amount=3000 + (i * 250),
                status="SUCCESS",
                failure_reason=None
            )
        )

        payments.append(
            models.Payment(
                customer_id=customer.id,
                amount=method_amounts[i],
                status="FAILED",
                failure_reason="Payment method expired"
            )
        )

    # ========================================================
    # 27-35 : NO ACTION
    # ========================================================

    no_action_amounts = [
        2200, 3400, 1800, 4200, 2900,
        5100, 3600, 2750, 4600
    ]

    for i in range(9):
        customer = customer_objects[26 + i]

        payments.append(
            models.Payment(
                customer_id=customer.id,
                amount=no_action_amounts[i],
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
    print("Retry Payment       : 9")
    print("Send Payment Link   : 9")
    print("New Payment Method  : 8")
    print("No Action           : 9")
    print("----------------------------")
    print("TOTAL CUSTOMERS     : 35")
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