# CoverAI API Endpoint Documentation

All endpoints are prefixed with `/api/v1` (except the `/health` endpoint).

---

## 1. Authentication Router (`/auth`)

Public rate limiting: `POST /auth/register` (3/min), `POST /auth/login` (5/min).

### `POST /auth/register`
- **Auth Required**: No (Public)
- **Rate Limit**: 3 per minute
- **Request Body**:
  ```json
  {
    "email": "customer@gmail.com",
    "phone": "9876543210",
    "password": "Password123",
    "fullName": "Aravind Sharma",
    "role": "customer"
  }
  ```
- **Response** (201 Created):
  ```json
  {
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "message": "User registered successfully."
  }
  ```

### `POST /auth/login`
- **Auth Required**: No (Public)
- **Rate Limit**: 5 per minute
- **Request Body**:
  ```json
  {
    "email": "customer@gmail.com",
    "password": "Password123"
  }
  ```
- **Response** (200 OK):
  Sets HttpOnly cookie `refresh_token` and returns:
  ```json
  {
    "accessToken": "ey...",
    "refreshToken": "ey...",
    "tokenType": "bearer",
    "user": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "customer@gmail.com",
      "role": "customer",
      "fullName": "Aravind Sharma"
    }
  }
  ```

### `GET /auth/me`
- **Auth Required**: Yes (Bearer Token)
- **Response** (200 OK):
  ```json
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "customer@gmail.com",
    "phone": "9876543210",
    "role": "customer",
    "fullName": "Aravind Sharma",
    "isActive": true,
    "isVerified": true,
    "createdAt": "2026-05-27T11:30:00Z",
    "updatedAt": "2026-05-27T11:30:00Z"
  }
  ```

---

## 2. Consent Management Router (`/consent`)

DPDP compliance endpoints. General rate limit: 60/min.

### `GET /consent`
- **Auth Required**: Yes (Bearer Token)
- **Response** (200 OK):
  ```json
  [
    {
      "consentType": "data_processing",
      "granted": true,
      "grantedAt": "2026-05-27T11:30:00Z",
      "revokedAt": null
    },
    {
      "consentType": "ai_analysis",
      "granted": true,
      "grantedAt": "2026-05-27T11:30:00Z",
      "revokedAt": null
    }
  ]
  ```

### `PATCH /consent/{consent_type}`
- **Auth Required**: Yes (Bearer Token)
- **Path Parameter**: `consent_type` (`data_processing`, `marketing`, `ai_analysis`, `third_party_sharing`)
- **Request Body**:
  ```json
  {
    "granted": false
  }
  ```
- **Response** (200 OK):
  ```json
  {
    "status": "success",
    "message": "Consent for AI analysis has been withdrawn. Existing summaries will be retained for administrative audit trails, but future claims triage and vision damage analysis will not execute...",
    "consent": {
      "consentType": "ai_analysis",
      "granted": false
    }
  }
  ```

### `POST /consent/data-export-request`
- **Auth Required**: Yes (Bearer Token)
- **Response** (200 OK):
  ```json
  {
    "requestId": "987e6543-e89b-12d3-a456-426614174000",
    "message": "Your personal data archive export is being compiled. It will be ready within 24 hours."
  }
  ```

### `POST /consent/data-deletion-request`
- **Auth Required**: Yes (Bearer Token)
- **Response** (200 OK):
  ```json
  {
    "requestId": "543e2109-e89b-12d3-a456-426614174000",
    "message": "Your account deletion request has been submitted. Your account will be completely anonymized within 30 days. You can cancel this request anytime within these 30 days."
  }
  ```

### `POST /consent/data-deletion-request/cancel`
- **Auth Required**: Yes (Bearer Token)
- **Response** (200 OK):
  ```json
  {
    "status": "success",
    "message": "Your account deletion request has been cancelled successfully. Your personal data remains active."
  }
  ```

---

## 3. Policies Router (`/policies`)

### `POST /policies/upload`
- **Auth Required**: Yes (Bearer Token, role `customer` only)
- **Request Format**: Multipart Form Data
  - `file`: PDF Upload
  - `vehicleRegistration`: string
  - `insurerName`: string
- **Response** (201 Created):
  ```json
  {
    "policyId": "321e6543-e89b-12d3-a456-426614174000",
    "policyNumber": "POL-12345678",
    "message": "Policy uploaded and text extracted successfully."
  }
  ```

### `GET /policies`
- **Auth Required**: Yes (Bearer Token)
- **Query Parameters**: `page=1`, `limit=20`
- **Response** (200 OK):
  ```json
  [
    {
      "id": "321e6543-e89b-12d3-a456-426614174000",
      "policyNumber": "POL-12345678",
      "insurerName": "HDFC Ergo",
      "vehicleRegistration": "MH-12-QN-4920",
      "status": "active",
      "startDate": "2026-01-01T00:00:00",
      "endDate": "2027-01-01T00:00:00"
    }
  ]
  ```

---

## 4. Claims Router (`/claims`)

### `POST /claims`
- **Auth Required**: Yes (Bearer Token, role `customer` only)
- **Request Body**:
  ```json
  {
    "policyId": "321e6543-e89b-12d3-a456-426614174000",
    "incidentDate": "2026-05-20T14:30:00",
    "incidentLocation": "Pune, Maharashtra",
    "incidentDescription": "Another vehicle crashed into my rear bumper at a traffic signal.",
    "claimType": "own_damage",
    "estimatedAmount": 45000.00
  }
  ```
- **Response** (201 Created):
  ```json
  {
    "claimId": "abcde123-e89b-12d3-a456-426614174000",
    "claimNumber": "CLM-202605-7H3B1A",
    "status": "draft"
  }
  ```

### `POST /claims/{claim_id}/images`
- **Auth Required**: Yes (Bearer Token, role `customer` only)
- **Request Format**: Multipart Form Data (Up to 5 images, max 10MB each)
  - `files`: File uploads
- **Response** (201 Created):
  ```json
  [
    {
      "imageId": "999f8888-e89b-12d3-a456-426614174000",
      "storagePath": "claims/abcde123.../999f8888.jpg",
      "message": "Image uploaded successfully. Analysis running in background."
    }
  ]
  ```

### `POST /claims/{claim_id}/submit`
- **Auth Required**: Yes (Bearer Token, role `customer` only)
- **Response** (200 OK):
  ```json
  {
    "claimId": "abcde123-e89b-12d3-a456-426614174000",
    "status": "submitted",
    "message": "Claim submitted successfully for review."
  }
  ```

### `GET /claims/{claim_id}`
- **Auth Required**: Yes (Bearer Token)
- **Response** (200 OK): Returns full claim metadata, list of uploaded images with signed URLs, AI risk scores, and standard audit history.

---

## 5. Health & Monitoring

### `GET /health`
- **Auth Required**: No (Public)
- **Response** (200 OK):
  ```json
  {
    "status": "ok",
    "db": "ok",
    "redis": "ok",
    "version": "1.0.0"
  }
  ```

### `GET /metrics`
- **Auth Required**: No (Public prometheus scrape)
- **Response** (200 OK): Plaintext standard Prometheus client metric dump containing request latency metrics, `ai_calls_total`, and `active_claims_gauge`.
