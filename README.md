# SOKON Backend API

```bash
cp .env.example .env
npm install
npm run dev
```

- Health check: `GET /health`
- Swagger docs: `GET /api-docs`

## Base URL

All API endpoints are mounted under: `/api/v1`

---

## Authentication (/auth)

- `POST /auth/register/student` — Register a new student account (fields: `fullName`, `email`, `phone`, `password`). Email verification sent.
- `POST /auth/register/owner` — Register a new owner account.
- `POST /auth/login` — Authenticate with email & password. Returns access token and sets refresh cookie.
- `POST /auth/refresh` — Rotate refresh token and return new access token (uses refresh cookie or body token).
- `POST /auth/logout` — Revoke refresh token and clear cookie.
- `POST /auth/verify-email` — Verify account using a token (from verification email).
- `POST /auth/forgot-password` — Send password reset email.
- `POST /auth/reset-password` — Reset password using reset token.

## Users (/users)

- `GET /users/me` — Get current authenticated user profile (auth required).
- `PATCH /users/me` — Update profile (avatar upload supported via multipart/form-data).
- `GET /users` — List all users (admin/super_admin only).
- `GET /users/:id` — Get user by id (admin/super_admin only).
- `PATCH /users/:id` — Admin update user (role, isVerified, isBlocked).
- `DELETE /users/:id` — Delete user (super_admin only).

## Apartments (/apartments)

- `GET /apartments` — List/search apartments. Supports filters: `q`, `minPrice`, `maxPrice`, `beds`, `rooms`, `floor`, `apartmentType`, `availability`, `lng/lat/radiusKm`.
- `GET /apartments/:id` — Get apartment details (owner/admin can see unapproved listings).
- `GET /apartments/mine` — Get apartments owned by the authenticated owner (owner/admin/super_admin).
- `POST /apartments` — Create apartment (owner/admin). Multipart upload `images[]` (Multer). New listings are `pending_approval`.
- `PATCH /apartments/:id` — Update apartment (owner/admin). Owner edits reset listing to `pending_approval`.
- `DELETE /apartments/:id` — Delete apartment (owner/admin).

## Bookings (/bookings)

- `GET /bookings/mine` — Get bookings for current user. Students see their bookings; owners see bookings for their apartments.
- `POST /bookings` — Create a booking request (student only). Prevents owner booking own listing and duplicate pending/accepted bookings.
- `PATCH /bookings/:id/cancel` — Cancel a pending booking (student).
- `PATCH /bookings/:id/accept` — Accept a pending booking (owner/admin). Marks apartment `reserved`.
- `PATCH /bookings/:id/reject` — Reject a pending booking (owner/admin).

Background: bookings auto-expire after configured days (default 4) via `jobs/bookingExpiry.job.js`.

## Reviews (/reviews)

- `GET /reviews/apartments/:apartmentId` — List reviews for an apartment.
- `POST /reviews` — Create a review (student only). Allowed only after an accepted/completed stay or past checkout.
- `DELETE /reviews/:id` — Remove a review (admin/super_admin).

## Notifications (/notifications)

- `GET /notifications/mine` — List notifications for the authenticated user.
- `PATCH /notifications/read-all` — Mark all notifications as read.
- `PATCH /notifications/:id/read` — Mark a single notification as read.

## Admin (/admin)

- `PATCH /admin/users/:id/block` — Block a user (admin/super_admin). Revokes refresh tokens.
- `PATCH /admin/users/:id/unblock` — Unblock a user (admin/super_admin).
- `PATCH /admin/apartments/:id/approve` — Approve a listing (admin/super_admin).
- `PATCH /admin/apartments/:id/reject` — Reject a listing with optional reason (admin/super_admin).
- `PATCH /admin/apartments/:id/remove` — Remove a listing (admin/super_admin).
- `POST /admin/announcements` — Create an announcement and notify users (admin/super_admin).

## Analytics (/analytics)

- `GET /analytics/dashboard` — Dashboard metrics and aggregates (admin/super_admin).

## Other routes

- `GET /health` — Health check (not under `/api/v1`).
- `GET /api-docs` — Swagger UI (OpenAPI docs).

## Implementation Notes

- Authentication: Bearer access tokens in `Authorization` header; refresh tokens stored in `refreshToken` cookie. Login/refresh logic in `src/modules/auth/auth.service.js`.
- Validation: `express-validator` validators applied per-route and `validate` middleware returns `422` with field errors.
- Error handling: `ApiError` pattern and centralized `errorHandler` middleware return structured error payloads.
- Security: `helmet`, CORS whitelist, `express-mongo-sanitize`, `xss-clean`, `hpp`, rate limiting (`authLimiter` for auth endpoints).
- Passwords: hashed with `bcrypt` in `src/modules/users/user.model.js` pre-save hook.
- File uploads: handled via Multer (`src/middleware/upload.js`) — images allowed (`jpg/jpeg/png/webp`).
- Notifications: implemented as DB records and optional emails (`src/modules/notifications`); real-time Socket.IO is not implemented in this repo.

## Contact / Next Steps

For changes, edit controllers in `src/modules/*`, validators in `src/modules/*/*.validators.js`, and models in `src/modules/*/*.model.js`.

---

Generated API reference — see the routes in `src/routes.js` and per-module route files for implementation details.
