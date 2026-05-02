# BloodLink API Documentation

**Version:** 1.0  
**Base URL:** `http://localhost:5000/api/v1`  
**Auth:** Bearer token — include `Authorization: Bearer <accessToken>` on all protected routes.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Donors](#2-donors)
3. [Contact Requests](#3-contact-requests)
4. [Users & Profile](#4-users--profile)
5. [Blood Requests](#5-blood-requests)
6. [Admin](#6-admin)
7. [Data Models](#7-data-models)
8. [Error Responses](#8-error-responses)

---

## 1. Authentication

### POST `/auth/register`
Register a new user account.

**Public** — no token required.

**Body**
```json
{
  "fullName": "Amadou Jallow",
  "email": "amadou@example.gm",
  "password": "Secret@123",
  "roles": ["donor"],
  "phone": "+2207100001",
  "city": "Banjul"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| fullName | string | yes | |
| email | string | yes | Must be unique |
| password | string | yes | Min 8 characters |
| roles | string[] | no | `"donor"` / `"seeker"`. Defaults to `["seeker"]` |
| phone | string | no | |
| city | string | no | |

**Response `201`**
```json
{
  "status": "success",
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "data": { "user": { ... } }
}
```

---

### POST `/auth/login`
Authenticate and receive tokens.

**Public**

**Body**
```json
{ "email": "amadou@example.gm", "password": "Secret@123" }
```

**Response `200`** — same shape as register.

---

### POST `/auth/logout`
Invalidate the current session's refresh token.

**Protected**

**Response `200`**
```json
{ "status": "success", "message": "Logged out successfully." }
```

---

### POST `/auth/refresh`
Exchange a refresh token for a new access token.

**Public**

**Body**
```json
{ "refreshToken": "<jwt>" }
```

**Response `200`** — same shape as login.

---

### POST `/auth/forgot-password`
Initiate a password reset flow.

**Public**

**Body**
```json
{ "email": "amadou@example.gm" }
```

**Response `200`**
```json
{
  "status": "success",
  "message": "If that email is registered, a reset code has been sent.",
  "resetToken": "<token>"
}
```
> `resetToken` is only included in `development` mode. In production, it would be delivered via email.

---

### POST `/auth/reset-password`
Set a new password using the reset token.

**Public**

**Body**
```json
{ "token": "<resetToken>", "password": "NewSecret@123" }
```

**Response `200`** — new tokens issued.

---

## 2. Donors

All endpoints require authentication.

### Donor Application Flow

1. Any authenticated user can submit a donor application via `POST /donors/apply`.
2. The application is created with `isApproved: false` and `approvalStatus: pending` — the donor is **not yet visible** in search results.
3. An admin reviews the application via `GET /admin/donors` and approves or rejects it.
4. On approval, `isApproved` is set to `true` and `approvalStatus` to `approved`; the donor becomes searchable.
5. On rejection, `isApproved` remains `false` and `approvalStatus` is set to `rejected`; the donor stays hidden.

---

### GET `/donors`
Search approved donor profiles.

**Query parameters**

| Param | Type | Description |
|---|---|---|
| blood_group | string | e.g. `O+`, `A-` |
| city | string | Partial match (case-insensitive) |
| available | boolean | `true` / `false` |
| name | string | Partial name match (case-insensitive) |
| page | number | Default `1` |
| limit | number | Default `20` |

**Response `200`**
```json
{
  "status": "success",
  "results": 5,
  "total": 12,
  "page": 1,
  "pages": 2,
  "data": {
    "donors": [
      {
        "_id": "...",
        "bloodGroup": "O+",
        "availabilityStatus": true,
        "approvalStatus": "approved",
        "user": {
          "fullName": "Amadou Jallow",
          "city": "Banjul",
          "profilePhoto": null
        }
      }
    ]
  }
}
```
> `user.phone` is **omitted** unless the authenticated user has an accepted contact request with that donor.

---

### GET `/donors/:id`
Get a single donor profile by its DonorProfile `_id`.

**Response `200`** — single `donor` object (same phone-visibility rules apply).

---

### POST `/donors/apply`
Submit a donor application for the authenticated user.

The application is created with `isApproved: false` and `approvalStatus: pending`. It is hidden from public search until an admin approves it.

**Body**
```json
{
  "bloodGroup": "O+",
  "availabilityStatus": true,
  "lastDonatedDate": "2025-11-10",
  "donationCount": 5,
  "donationType": "free",
  "donationCapacity": 2
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| bloodGroup | string | yes | `A+` `A-` `B+` `B-` `AB+` `AB-` `O+` `O-` |
| availabilityStatus | boolean | no | Default `true` |
| lastDonatedDate | date | no | ISO 8601 |
| donationCount | number | no | Default `0` |
| donationType | string | no | `free` / `paid`. Default `free` |
| donationAmount | number | no | Required if `donationType` is `paid` |
| donationCapacity | number | no | Default `1` |

**Response `201`**
```json
{ "status": "success", "data": { "donor": { "isApproved": false, "approvalStatus": "pending", ... } } }
```

> Each user may only submit one application. A `409` is returned if one already exists.

---

### PUT `/donors/:id`
Update a donor profile. Owner or admin only.

**Body** — any subset of the fields from POST (except `bloodGroup` changes reset `approvalStatus` to `pending`... *not implemented in v1; noted for v2*).

**Response `200`**

---

### PATCH `/donors/:id/availability`
Toggle or explicitly set availability. Owner only.

**Body**
```json
{ "availabilityStatus": false }
```
> Omit `availabilityStatus` to simply flip the current value.

**Response `200`**
```json
{ "status": "success", "data": { "availabilityStatus": false } }
```

---

## 3. Contact Requests

All endpoints require authentication.

### POST `/contact-requests`
Seeker initiates a contact request for a donor.

**Body**
```json
{
  "donorId": "<DonorProfile _id>",
  "bloodGroupNeeded": "O+",
  "message": "Urgently need O+ blood for surgery tomorrow."
}
```

| Field | Type | Required |
|---|---|---|
| donorId | ObjectId | yes |
| bloodGroupNeeded | string | yes |
| message | string | no | Max 500 chars |

> - Cannot send to yourself.  
> - Only one `pending` request per seeker–donor pair at a time.  
> - The donor is notified in-app immediately.

**Response `201`**
```json
{ "status": "success", "data": { "contactRequest": { ... } } }
```

---

### GET `/contact-requests/mine`
Returns all contact requests where the current user is the **seeker** or the **donor**.

**Response `200`**
```json
{
  "status": "success",
  "results": 3,
  "data": {
    "contactRequests": [
      {
        "_id": "...",
        "status": "accepted",
        "bloodGroupNeeded": "O+",
        "seeker": { "fullName": "...", "city": "..." },
        "donor": { "fullName": "...", "city": "...", "phone": "+2207100001" }
      }
    ]
  }
}
```
> `donor.phone` is only present when `status === "accepted"` **and** the caller is the seeker.

---

### PATCH `/contact-requests/:id`
Donor accepts or declines a pending request. Donor only.

**Body**
```json
{ "status": "accepted" }
```
> `status` must be `"accepted"` or `"declined"`. The seeker is notified in-app.

**Response `200`**
```json
{ "status": "success", "data": { "contactRequest": { ... } } }
```

---

## 4. Users & Profile

All endpoints require authentication.

### GET `/users/me`
Get the authenticated user's full profile.

**Response `200`**
```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "...",
      "fullName": "Amadou Jallow",
      "email": "amadou@example.gm",
      "roles": ["donor"],
      "city": "Banjul",
      "phone": "+2207100001",
      "profilePhoto": null,
      "notificationPreferences": {
        "email": true,
        "sms": false,
        "inApp": true
      }
    }
  }
}
```

---

### PUT `/users/me`
Update profile info and/or notification preferences.

**Body** — any subset of:
```json
{
  "fullName": "Amadou B. Jallow",
  "phone": "+2207100099",
  "city": "Serrekunda",
  "profilePhoto": "https://res.cloudinary.com/...",
  "notificationPreferences": {
    "email": true,
    "sms": true,
    "inApp": true
  }
}
```
> Do **not** send `password` here — use `PUT /users/me/password` instead.

**Response `200`** — updated user object.

---

### PUT `/users/me/password`
Change own password. Requires current password for verification.

**Body**
```json
{
  "currentPassword": "OldSecret@123",
  "newPassword": "NewSecret@456"
}
```
> Successfully changing the password **logs out all other sessions** by invalidating the refresh token.

**Response `200`**
```json
{ "status": "success", "message": "Password updated successfully." }
```

---

### DELETE `/users/me`
Delete (deactivate) own account.

> Soft-delete: sets `isActive: false`, anonymises PII, hides donor profile from search. Contact request history is preserved.

**Response `204`** — no body.

---

### GET `/users/me/notifications`
Fetch in-app notifications for the current user.

**Query parameters**

| Param | Type | Description |
|---|---|---|
| unread | boolean | `true` — return only unread notifications |

**Response `200`**
```json
{
  "status": "success",
  "results": 2,
  "data": {
    "notifications": [
      {
        "_id": "...",
        "type": "contact_request_received",
        "message": "Isatou Sanneh has sent you a contact request for O+ blood.",
        "isRead": false,
        "createdAt": "2026-04-16T10:00:00.000Z"
      }
    ]
  }
}
```

---

### PATCH `/users/me/notifications/read`
Mark notifications as read.

**Body**
```json
{ "ids": ["<notifId1>", "<notifId2>"] }
```
> Omit `ids` to mark **all** unread notifications as read.

**Response `200`**
```json
{ "status": "success", "message": "Notifications marked as read." }
```

---

## 5. Blood Requests

All endpoints require authentication.

### POST `/requests`
Seeker posts a public blood request.

**Body**
```json
{
  "bloodGroup": "O+",
  "city": "Banjul",
  "urgency": "critical",
  "message": "Need O+ blood immediately for emergency surgery at RVTH."
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| bloodGroup | string | yes | |
| city | string | yes | |
| urgency | string | no | `normal` / `urgent` / `critical`. Default `normal` |
| message | string | no | Max 500 chars |

> Approved, available donors with a matching blood group are notified in-app automatically.

**Response `201`**
```json
{ "status": "success", "data": { "bloodRequest": { ... } } }
```

---

### GET `/requests`
List blood requests. Defaults to `status=open`.

**Query parameters**

| Param | Type | Description |
|---|---|---|
| status | string | `open` / `fulfilled` / `expired`. Default `open` |
| blood_group | string | Filter by blood group |
| city | string | Partial city match |
| urgency | string | `normal` / `urgent` / `critical` |
| page | number | Default `1` |
| limit | number | Default `20` |

**Response `200`**
```json
{
  "status": "success",
  "total": 5,
  "page": 1,
  "pages": 1,
  "data": { "bloodRequests": [ ... ] }
}
```

---

### GET `/requests/:id`
Get a single blood request.

**Response `200`** — single `bloodRequest` object.

---

### PATCH `/requests/:id`
Update or close a blood request. Owner only.

**Body** — any subset of: `bloodGroup`, `city`, `urgency`, `message`, `status`.

```json
{ "status": "fulfilled" }
```

**Response `200`** — updated `bloodRequest`.

---

### DELETE `/requests/:id`
Delete a blood request. Owner or admin.

**Response `204`** — no body.

---

## 6. Admin

All endpoints require authentication **and** the `admin` role.

### GET `/admin/users`
List all registered users with optional role filter.

**Query parameters**

| Param | Type | Description |
|---|---|---|
| role | string | `donor` / `seeker` / `admin` |
| page | number | Default `1` |
| limit | number | Default `20` |

**Response `200`**
```json
{
  "status": "success",
  "total": 9,
  "page": 1,
  "pages": 1,
  "data": { "users": [ ... ] }
}
```

---

### GET `/admin/donors`
List all donor applications. Use the `status` filter to review the pending queue.

**Query parameters**

| Param | Type | Description |
|---|---|---|
| status | string | `pending` / `approved` / `rejected` |
| page | number | Default `1` |
| limit | number | Default `20` |

**Response `200`**
```json
{
  "status": "success",
  "total": 3,
  "page": 1,
  "pages": 1,
  "data": {
    "donors": [
      {
        "_id": "...",
        "isApproved": false,
        "approvalStatus": "pending",
        "bloodGroup": "O+",
        "user": { "fullName": "Amadou Jallow", "email": "amadou@example.gm", "city": "Banjul" }
      }
    ]
  }
}
```

---

### PATCH `/admin/donors/:id/approve`
Approve a pending donor application. Sets `isApproved: true` and `approvalStatus: approved`. Notifies the donor in-app.

**Response `200`** — updated donor profile.

---

### PATCH `/admin/donors/:id/reject`
Reject a donor application. Sets `isApproved: false` and `approvalStatus: rejected`. Notifies the donor in-app.

**Body** *(optional)*
```json
{ "reason": "Incomplete information provided." }
```

**Response `200`** — updated donor profile.

---

### DELETE `/admin/users/:id`
Deactivate (or permanently delete) a user account.

| Query | Description |
|---|---|
| `?permanent=true` | Hard-deletes user and their donor profile. Irreversible. |

Default (no query param) — soft deactivation: `isActive: false`, donor hidden from search.

**Response `200`** (soft) or `204` (permanent).

---

### GET `/admin/contact-requests`
View all contact requests platform-wide.

**Query parameters:** `status` (`pending` / `accepted` / `declined`), `page`, `limit`.

**Response `200`** — paginated list with seeker and donor info populated.

---

### GET `/admin/analytics`
Platform statistics dashboard.

**Response `200`**
```json
{
  "status": "success",
  "data": {
    "users": {
      "total": 9,
      "donors": 5,
      "seekers": 4
    },
    "donors": {
      "pendingApprovals": 1,
      "byBloodGroup": {
        "A+": 1,
        "AB-": 1,
        "B+": 1,
        "O+": 1,
        "O-": 1
      }
    },
    "contactRequests": {
      "total": 3,
      "byStatus": { "accepted": 1, "pending": 1, "declined": 1 }
    },
    "bloodRequests": {
      "total": 3,
      "byStatus": { "open": 2, "fulfilled": 1 }
    }
  }
}
```

---

### GET `/admin/requests`
Admin view of all blood requests (all statuses, with seeker contact details).

**Query parameters:** `status`, `page`, `limit`.

**Response `200`** — paginated list.

---

## 7. Data Models

### User
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| fullName | String | |
| email | String | Unique, lowercase |
| password | String | Hashed, never returned |
| phone | String | Hidden from public responses |
| roles | String[] | `donor` / `seeker` / `admin` |
| city | String | |
| profilePhoto | String | URL |
| isActive | Boolean | Default `true` |
| notificationPreferences | Object | `{ email, sms, inApp }` |
| createdAt / updatedAt | Date | |

### DonorProfile
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| user | ObjectId | Ref → User |
| bloodGroup | String | `A+` `A-` `B+` `B-` `AB+` `AB-` `O+` `O-` |
| availabilityStatus | Boolean | Default `true` |
| lastDonatedDate | Date | Self-reported |
| donationCount | Number | Self-reported |
| donationType | String | `free` / `paid` |
| donationAmount | Number | For paid donations |
| donationCapacity | Number | Default `1` |
| isApproved | Boolean | `false` until admin approves. Convenience flag mirroring `approvalStatus` |
| approvalStatus | String | `pending` / `approved` / `rejected` |
| approvedBy | ObjectId | Ref → User (admin) |
| approvedAt | Date | |
| registeredBy | ObjectId | Ref → User |
| createdAt / updatedAt | Date | |

### ContactRequest
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| seeker | ObjectId | Ref → User |
| donor | ObjectId | Ref → User |
| bloodGroupNeeded | String | |
| message | String | Max 500 chars |
| status | String | `pending` / `accepted` / `declined` |
| respondedAt | Date | Set when donor responds |
| createdAt / updatedAt | Date | |

### BloodRequest
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| seeker | ObjectId | Ref → User |
| bloodGroup | String | |
| city | String | |
| urgency | String | `normal` / `urgent` / `critical` |
| message | String | Max 500 chars |
| status | String | `open` / `fulfilled` / `expired` |
| createdAt / updatedAt | Date | |

### Notification
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| user | ObjectId | Ref → User (recipient) |
| type | String | See types below |
| message | String | Human-readable |
| channel | String | `in-app` / `email` / `sms` |
| isRead | Boolean | Default `false` |
| relatedId | ObjectId | Optional — points to the triggering document |
| createdAt | Date | |

**Notification types:** `contact_request_received`, `contact_request_accepted`, `contact_request_declined`, `donor_approved`, `donor_rejected`, `blood_request_match`

---

## 8. Error Responses

All errors follow this shape:

```json
{
  "status": "error",
  "message": "Human-readable description of what went wrong."
}
```

| Code | Meaning |
|---|---|
| 400 | Bad request — missing or invalid fields |
| 401 | Unauthenticated — missing, expired, or invalid token |
| 403 | Forbidden — authenticated but not authorised |
| 404 | Resource not found |
| 409 | Conflict — e.g. duplicate email or existing donor profile |
| 500 | Internal server error |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create .env file
cp .env.example .env   # fill in MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET

# 3. Seed the database
npm run seed

# 4. Start the development server
npm run dev
# API is available at http://localhost:5000/api/v1
```

**Seeded credentials**

| Role | Email | Password |
|---|---|---|
| Admin | admin@bloodlink.gm | Admin@1234 |
| Donor | amadou.jallow@example.gm | Donor@1234 |
| Donor | fatou.ceesay@example.gm | Donor@1234 |
| Seeker | isatou.sanneh@example.gm | Seeker@1234 |
