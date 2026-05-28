# CoverAI Data Retention and Minimization Policy

This document formalizes the data retention, minimization, and account erasure practices of **CoverAI** in compliance with the **Digital Personal Data Protection (DPDP) Act, 2023 (India)**.

---

## 1. Core Principles

CoverAI is committed to **Data Minimization** (Section 5 of DPDP Act 2023). We only collect and retain personal data that is strictly necessary for the purpose of policy analysis, claims processing, and user assistance.

---

## 2. Retention Schedules

| Data Category | Retention Limit | Minimization / Action | Rationale |
| :--- | :--- | :--- | :--- |
| **Active Policies** | Indefinite (While Active) | Retain full metadata and PDF | Required for operational claims assessment. |
| **Expired Policies** | 2 Years | **Delete `extracted_text` from database** | The legal audit window has closed. The original PDF remains in secure storage for litigation/compliance, but database-searchable text is deleted. |
| **Conversation Messages** | 1 Year | **Delete all raw chat messages** | Messages are no longer relevant. We retain only the aggregate `message_count` on the conversation record for macro-analytics. |
| **Active Claims & Images** | Indefinite (Until Erasure) | Retain for operational audit trails | Required by insurance regulations to be kept as part of policy history. |
| **Audit Logs** | 7 Years | Retained in full | Section 12 compliance & IRDAI regulatory guidelines for legal accountability. |

---

## 3. Account Erasure and Anonymization Workflow

Under Section 12 (Right to Erasure), users have the right to request the deletion of their personal accounts.

1. **Grace Period**: Deletion requests placed via the Consent API (`POST /consent/data-deletion-request`) enter a **30-day pending grace period**. This enables users to cancel accidental requests.
2. **Final Erasure & Anonymization (Day 31)**:
   - **User Profile**: Plaintext fields are permanently deleted and replaced. Email is replaced by a randomized hash `deleted_xxxx@anonymized.coverai.com`, Full Name is set to `Anonymized User`, Phone is set to `0000000000` (encrypted), and `phone_hash` is randomized. The account is set to inactive (`is_active = False`).
   - **Policies**: All associated `extracted_text` database records are nulled out.
   - **Claims**: Incident descriptions are replaced with `"Deleted as per DPDP account erasure request."` and locations are anonymized.
   - **Storage Files**: All uploaded physical claim images (JPEG, PNG, WebP) are deleted permanently from the storage backend (local disk or AWS S3).
   - **Audit Trail**: Audit logs are preserved with anonymous user IDs (`actor_id = NULL`) to ensure absolute privacy while maintaining regulatory integrity for 7 years.

---

## 4. Automated Execution

Retention routines are executed automatically via an integrated background cron scheduler (`apps/api/core/scheduler.py`):
- **Minimization Tasks**: Executed **every Sunday at midnight (00:00)**.
- **Grace Deletion Tasks**: Executed **daily at 01:00 AM**.
