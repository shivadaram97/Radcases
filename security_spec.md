# Security Specification & "Dirty Dozen" Adversarial Payloads

This document defines the zero-trust security architecture, data invariants, and test payload assertions for the Firestore DB.

## 1. Data Invariants

1. **User Ownership Boundaries**: Every document under `/users/{userId}` belongs strictly to the authenticated user whose `request.auth.uid == userId`. No user can read, create, update, or resolve data for any other user's collections.
2. **Category Ownership**: Every category document under `/users/{userId}/categories/{categoryId}` must contain a matching `.userId` field matching `userId` and `request.auth.uid`. No user can inject files into another user's account space.
3. **Verified Identities**: All mutating write actions require verified emails: `request.auth.token.email_verified == true`.
4. **Temporal Integrity**: The fields `createdAt` and `updatedAt` are strictly governed. They can only use the validated server clock `request.time`.
5. **Sanitized IDs**: All ID parameters (e.g., `userId`, `categoryId`) must pass regex checks to prevent directory transversal or Resource Poisoning injection attacks: `id.matches('^[a-zA-Z0-9_\\-]+$')`.

---

## 2. The "Dirty Dozen" Threat Payloads (Adversarial Scenarios)

These adversarial payloads are designed by a simulated red team to break security constraints and must return `PERMISSION_DENIED` at the Firestore firewall layer.

### Payload 1: PII Blanket Fetch (Read Leak)
* **Goal**: Malicious signed-in User `attacker_123` attempts to retrieve private user meta for `victim_456`.
* **Path**: `/users/victim_456`
* **Result**: `PERMISSION_DENIED`

### Payload 2: Category Hijacking (Create Spoof)
* **Goal**: `attacker_123` attempts to create a category under `victim_456`'s account path.
* **Path**: `/users/victim_456/categories/cat_999`
* **Payload**: `{ "id": "cat_999", "userId": "victim_456", "name": "Fake Cat", "cases": [] }`
* **Result**: `PERMISSION_DENIED`

### Payload 3: Privilege Elevation / Owner Masquerading (Create Spoof)
* **Goal**: `attacker_123` creates a category under their own path but assigns `userId = "victim_456"` to spoof owner stats or steal ownership keys.
* **Path**: `/users/attacker_123/categories/cat_999`
* **Payload**: `{ "id": "cat_999", "userId": "victim_456", "name": "Fake Cat", "cases": [] }`
* **Result**: `PERMISSION_DENIED`

### Payload 4: Invalid Email Verification Bypass
* **Goal**: User with unverified email attempts to create a clinical entry.
* **Path**: `/users/guest_123/categories/cat_1`
* **Auth**: `{ uid: "guest_123", token: { email_verified: false } }`
* **Result**: `PERMISSION_DENIED`

### Payload 5: Remote Timestamp Injection (Client clock manipulation)
* **Goal**: Force a custom `createdAt` date in the past to alter record priority.
* **Path**: `/users/user_123/categories/cat_1`
* **Payload**: `{ "id": "cat_1", "userId": "user_123", "name": "Knee", "cases": [], "createdAt": "2010-01-01T00:00:00Z" }`
* **Result**: `PERMISSION_DENIED`

### Payload 6: Immutable Field Modification (Shadow Override)
* **Goal**: Overwrite a category's `createdAt` or initial `userId` after creation.
* **Path**: `/users/user_123/categories/cat_1`
* **Update Payload**: `{ "userId": "new_guy", "updatedAt": "request.time" }`
* **Result**: `PERMISSION_DENIED`

### Payload 7: Denial of Wallet (Resource Exhaustion)
* **Goal**: User tries to save a massive category title (>128 chars) or highly nested list.
* **Path**: `/users/user_123/categories/cat_1`
* **Payload**: `{ "id": "cat_1", "userId": "user_123", "name": "A".repeat(500), "cases": [] }`
* **Result**: `PERMISSION_DENIED`

### Payload 8: Null-Pointer Deletion Escape
* **Goal**: Attempt to delete another user's category file by tricking identity gates.
* **Path**: `/users/victim_456/categories/cat_20`
* **Auth**: `{ uid: "attacker_123" }`
* **Result**: `PERMISSION_DENIED`

### Payload 9: ID Poisoning (Injection Hack)
* **Goal**: Inject a recursive folder path `../etc/passwd` as a category document ID.
* **Path**: `/users/user_123/categories/%2E%2E%2Fetc%2Fpasswd`
* **Result**: `PERMISSION_DENIED`

### Payload 10: Case Poisoning Schema (Invalid List Struct)
* **Goal**: Inject an array filled with non-case strings into a Category's cases.
* **Path**: `/users/user_123/categories/cat_1`
* **Payload**: `{ "id": "cat_1", "userId": "user_123", "name": "Brain", "cases": ["NotACase", "JustAString"] }`
* **Result**: `PERMISSION_DENIED`

### Payload 11: Arbitrary Keys Extension (Shadow Field Injection)
* **Goal**: Inject helper boolean `isAdmin: true` during profile creation.
* **Path**: `/users/user_123`
* **Payload**: `{ "uid": "user_123", "email": "spoof@gmail.com", "isAdmin": true }`
* **Result**: `PERMISSION_DENIED`

### Payload 12: Broken Sequence Query Scraping
* **Goal**: Query lists inside the `/users` directory without applying owner constraints.
* **Path**: `/users/victim_456/categories`
* **Auth**: `{ uid: "attacker_123" }`
* **Query**: `getDocs(...)`
* **Result**: `PERMISSION_DENIED`
