# CoverAI DPDP Act 2023 Compliance Handbook

This handbook details the technical, administrative, and legal frameworks implemented across **CoverAI** to comply with the **Digital Personal Data Protection (DPDP) Act, 2023 (India)**.

---

## 1. Consent Architecture (Section 6)

DPDP Act 2023 mandates that consent must be **free, specific, informed, unconditional, and unambiguous**, provided with an active affirmative action.

1. **Active Consent Banner Wall**:
   - On first visit, users are presented with a fullscreen frosted glass overlay blocking dashboard interaction.
   - The banner lists categories of data collected, specific processing purposes, and the contact details of the Grievance Officer.
   - Access is restricted until the user actively clicks `[Accept & Continue]`, which sets a `dpdp_consent` flag in browser local storage.
2. **Granular Consent Categories**:
   CoverAI tracks consent records on the database via `/consent` endpoints:
   - `data_processing`: Baseline consent required to store and parse policy documents.
   - `ai_analysis`: Consent to perform OpenAI triage and image damage assessments.

---

## 2. Right to Withdraw Consent & AI Controls (Section 6(4))

Users have the right to withdraw consent at any time as easily as it was given.

- **Withdrawal Endpoint**: `PATCH /api/v1/consent/ai_analysis` with `{ "granted": false }`.
- **System Impact**:
  - Sets `ai_analysis_consent = False` on the User's database profile.
  - **Audit Retention**: In accordance with administrative compliance and fraud auditing standards, existing AI summaries are NOT deleted.
  - **Execution Block**: The background triage workers `run_ai_triage` and `run_image_ai_analysis` immediately load the claimant's consent flag. If `ai_analysis_consent` is False, the workers log a security warning and immediately abort execution before invoking external OpenAI APIs.

---

## 3. Data Portability (Right to Access - Section 11)

Users have a Right to Access and download a summary of their personal data.

- **Data Export Route**: `POST /api/v1/consent/data-export-request`.
- **Async Execution**: Spawns a background task compiling a comprehensive, structured JSON export including:
  - User details (full name, email, phone decrypted).
  - Policies (omitting raw `extracted_text` to protect third-party proprietary formats, but keeping metadata).
  - Claims history, conversation logs, messages, active consents, and log actions.
- **Delivery**: The JSON export is uploaded to secure storage (local disk or S3), and a download link is sent to the user (logged via mock email logs).

---

## 4. Erasure and the 30-Day Grace Period (Section 12)

Users have the right to erase their personal data when it is no longer necessary for the purpose for which it was collected.

1. **Erasure Request**: Triggered via `POST /api/v1/consent/data-deletion-request`.
2. **30-Day Grace Period**: 
   - Final erasure is not executed immediately to prevent accidental loss and allow administrative review. The request is created in `pending` status.
   - Users can cancel their request anytime within the 30 days via `POST /api/v1/consent/data-deletion-request/cancel`.
3. **Anonymization & Purge (Day 31)**:
   A daily cron job processes deletion requests older than 30 days:
   - **Anonymize Profiles**: Replaces email with a random alias (`deleted_xxx@anonymized.coverai.com`), resets name to `Anonymized User`, sets phone to a dummy encrypted string (`0000000000`), and deactivates the user record.
   - **Purge Policies**: Nulls out all searchable `extracted_text` fields in the database.
   - **Purge Claims**: Replaces claim descriptions with dummy text.
   - **Delete Storage Files**: Physical claim survey images are permanently deleted from S3 or local disks.
   - **Regulatory Audit Log Retention**: In compliance with national financial and insurance auditing requirements, `audit_logs` are preserved for 7 years but are decoupled from the user identity (`actor_id = NULL`), ensuring absolute anonymization.

---

## 5. Automated Data Minimization

CoverAI enforces automated weekly minimization crons:
- **Policies**: Every Sunday, policies older than 2 years that are expired (`status = 'expired'`) have their `extracted_text` completely wiped from the database.
- **Messages**: Every Sunday, conversation messages older than 1 year are permanently deleted, preserving only the aggregate `message_count` on the conversation record for macro-analytics.

---

## 6. Grievance Redressal Officer

Under Section 13, users have the right to register grievances with a Data Fiduciary.

- **Designated Grievance Officer**: Mr. Anand Iyer, Director of Security Operations
- **Escalation Email**: privacy@coverai.com
- **Hotline Support**: +91 22 6698 1204
- **Address**: CoverAI Private Limited, Level 12, Godrej One, Vikhroli, Mumbai, MH, 400079, India
