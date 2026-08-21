import asyncio
import sys
import os
from datetime import datetime, timedelta

# Add apps/api to path so we can import core modules
sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from core.database import SessionLocal, engine
from models import User, UserRole, Policy, PolicyType, PolicyStatus, Claim, ClaimType, ClaimStatus
from services.auth_service import hash_password

async def seed_data():
    print("Starting development database seeding...")
    
    async with SessionLocal() as session:
        # Clear existing data using CASCADE to handle FK constraints smoothly
        print("Clearing existing database tables...")
        await session.execute(text(
            "TRUNCATE TABLE advisor_assignments, consent_records, audit_logs, "
            "messages, conversations, claim_images, claims, policies, users CASCADE;"
        ))
        await session.commit()
        
        # Test password for all roles
        raw_password = "Password123!"
        hashed = hash_password(raw_password)
        
        # 1. Create Users
        users = [
            User(
                email="admin@coverai.com",
                phone="+919999999991",
                hashed_password=hashed,
                role=UserRole.admin,
                full_name="System Admin",
                is_active=True,
                is_verified=True
            ),
            User(
                email="customer@coverai.com",
                phone="+919999999992",
                hashed_password=hashed,
                role=UserRole.customer,
                full_name="Alice Customer",
                is_active=True,
                is_verified=True
            ),
            User(
                email="officer@coverai.com",
                phone="+919999999993",
                hashed_password=hashed,
                role=UserRole.insurer_officer,
                full_name="Bob Insurer Officer",
                is_active=True,
                is_verified=True
            ),
            User(
                email="advisor@coverai.com",
                phone="+919999999994",
                hashed_password=hashed,
                role=UserRole.advisor,
                full_name="Charlie Insurance Advisor",
                is_active=True,
                is_verified=True
            ),
            User(
                email="aggregator@coverai.com",
                phone="+919999999995",
                hashed_password=hashed,
                role=UserRole.aggregator,
                full_name="Delta Aggregator API",
                is_active=True,
                is_verified=True
            )
        ]
        
        print("Inserting users...")
        for u in users:
            session.add(u)
        await session.flush()
        
        # Extract customer and officer users for policy/claim relationship bindings
        customer_user = [u for u in users if u.role == UserRole.customer][0]
        officer_user = [u for u in users if u.role == UserRole.insurer_officer][0]
        
        # 2. Create a Policy for the customer
        test_policy = Policy(
            policy_number="POL-88392102",
            user_id=customer_user.id,
            insurer_name="CoverAI General Insurance Ltd.",
            vehicle_registration="MH-12-QN-4920",
            vehicle_make="Tesla",
            vehicle_model="Model Y",
            vehicle_year=2024,
            policy_type=PolicyType.comprehensive,
            start_date=datetime.utcnow() - timedelta(days=90),
            end_date=datetime.utcnow() + timedelta(days=275),
            premium_amount=24500.00,
            sum_insured=4500000.00,
            pdf_storage_path="documents/policies/POL-88392102.pdf",
            extracted_text="CoverAI Comprehensive Policy. Premium: 24500 INR. Sum Insured: 45L INR.",
            embedding_model_version="text-embedding-3-small",
            status=PolicyStatus.active
        )
        
        print("Inserting sample policy...")
        session.add(test_policy)
        await session.flush()
        
        # 3. Create a Claim under that policy
        test_claim = Claim(
            policy_id=test_policy.id,
            claimant_id=customer_user.id,
            incident_date=datetime.utcnow() - timedelta(days=15),
            incident_location="Western Express Highway, Mumbai",
            incident_description="Minor fender bender during high traffic. Rear bumper has dent and paint scrapes.",
            claim_type=ClaimType.own_damage,
            status=ClaimStatus.under_review,
            assigned_officer_id=officer_user.id,
            ai_risk_score=0.08,
            ai_summary=(
                '{"risk_score": 0.08, "coverage_assessment": "likely_covered", '
                '"key_policy_clauses": ["Own Damage Section I - Loss or Damage to the Vehicle"], '
                '"red_flags": [], "recommended_action": "standard_review", '
                '"summary_for_officer": "Front/rear bumper damage only. Standard low-speed collision. Low risk of fraud.", '
                '"customer_prediction": "likely_accepted", '
                '"customer_explanation": "Based on a review of the own damage section of your policy, accidental damage to your front/rear bumper is likely covered."}'
            ),
            estimated_amount=15000.00,
            approved_amount=None
        )
        
        print("Inserting sample claim...")
        session.add(test_claim)
        
        await session.commit()
        
        print("Seeding completed successfully!")
        print("\nSeeded Accounts details (Password for all accounts is 'Password123!'):")
        for u in users:
            print(f" - {u.role.value.upper()}: email={u.email}, phone={u.phone}")
            
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(seed_data())
