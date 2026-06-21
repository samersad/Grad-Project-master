# Frontend API Contract

This document describes what the current backend expects from the frontend and what it sends back.

## Base URLs

- API base path: `/api/v1`
- Local default server: `http://localhost:5000`
- Health check: `GET /health`
- Swagger UI: `GET /api-docs`
- Local uploaded images are returned as URLs like `/uploads/tmp/file.png`; prefix them with the backend origin when rendering from another frontend origin.

## Required Frontend Setup

For protected endpoints, send:

```http
Authorization: Bearer <accessToken>
```

For refresh-token cookie support, frontend requests should include credentials:

```js
fetch(url, { credentials: 'include' })
```

Allowed local CORS origins from `.env.example` are:

- `http://localhost:3000`
- `http://localhost:5173`

Use `Content-Type: application/json` for normal requests. Use `multipart/form-data` for:

- `PATCH /users/me` when uploading `avatar`
- `POST /apartments` when uploading `images`
- `PATCH /apartments/:id` when replacing `images`

Do not manually set the `Content-Type` header for `FormData`; the browser must add the boundary.

## Common Response Shape

Every normal success response uses:

```json
{
  "success": true,
  "message": "Text message",
  "data": {}
}
```

Paginated responses also include:

```json
{
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Error responses use:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Valid email is required",
      "value": "bad value"
    }
  ]
}
```

In development only, errors may also include `stack`.

## Main Data Shapes

### User

Auth responses and `/users/me` send a sanitized user with no `password` and no `refreshTokens`.

```js
{
  _id: string,
  fullName: string,
  email: string,
  phone: string,
  role: 'student' | 'owner' | 'admin' | 'super_admin',
  avatar?: { url: string, publicId?: string, storage?: string },
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say',
  university?: string,
  faculty?: string,
  isVerified: boolean,
  isBlocked: boolean,
  preferredLanguage: 'en' | 'ar',
  lastLogin?: string,
  createdAt: string,
  updatedAt: string
}
```

Current warning: admin user endpoints currently do not sanitize the same way, so they may send `refreshTokens` metadata. The frontend does not need that field.

### Apartment

```js
{
  _id: string,
  ownerId: string | {
    _id: string,
    fullName: string,
    phone: string,
    email: string,
    avatar?: object
  },
  title: string,
  slug?: string,
  description_ar: string,
  description_en: string,
  price: number,
  city: string,
  district: string,
  address: string,
  buildingNumber: string,
  unitNumber: string,
  latitude?: number,
  longitude?: number,
  location?: { type: 'Point', coordinates: [number, number] },
  apartmentType: 'studio' | 'room' | 'shared_room' | 'apartment' | 'bed',
  beds: number,
  rooms: number,
  bathrooms: number,
  floor: number,
  amenities: string[],
  images: Array<{ url: string, publicId?: string, storage?: string }>,
  status: 'draft' | 'pending_approval' | 'published' | 'rejected' | 'removed',
  availability: 'available' | 'reserved' | 'rented' | 'unavailable',
  isApproved: boolean,
  rejectionReason?: string,
  averageRating: number,
  reviewCount: number,
  createdAt: string,
  updatedAt: string
}
```

### Booking

```js
{
  _id: string,
  studentId: string | { _id: string, fullName: string, email: string, phone: string },
  apartmentId: string | {
    _id: string,
    title: string,
    price: number,
    city: string,
    district: string,
    images: Array<{ url: string }>
  },
  ownerId: string,
  message?: string,
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired' | 'completed',
  expiresAt: string,
  checkInDate?: string,
  checkOutDate?: string,
  cancellationReason?: string,
  ownerResponseNote?: string,
  respondedAt?: string,
  completedAt?: string,
  createdAt: string,
  updatedAt: string
}
```

### Review

```js
{
  _id: string,
  studentId: string | { _id: string, fullName: string, avatar?: object },
  apartmentId: string,
  rating: number,
  comment: string,
  createdAt: string,
  updatedAt: string
}
```

### Notification

```js
{
  _id: string,
  recipientId: string,
  title: string,
  body: string,
  type: 'booking_request' | 'booking_accepted' | 'booking_rejected' | 'account_approved' | 'listing_approved' | 'listing_rejected' | 'account_blocked' | 'announcement' | 'system',
  isRead: boolean,
  metadata?: object,
  createdAt: string,
  updatedAt: string
}
```

## Auth Endpoints

### `POST /auth/register/student`

Body:

```json
{
  "fullName": "Student Name",
  "email": "student@example.com",
  "phone": "01000000000",
  "password": "password123",
  "preferredLanguage": "en",
  "gender": "male"
}
```

Response `201`:

```json
{
  "success": true,
  "message": "Student registered successfully. Please verify your email.",
  "data": { "user": "User" }
}
```

No tokens are returned. The user must verify email before login succeeds.

### `POST /auth/register/owner`

Same body as student registration. Response message is:

```txt
Owner registered successfully. Please verify your email.
```

### `POST /auth/login`

Body:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "success": true,
  "message": "Logged in successfully",
  "data": {
    "user": "User",
    "accessToken": "jwt",
    "refreshToken": "jwt"
  }
}
```

Also sets an HTTP-only cookie named `refreshToken`.

Possible frontend-impact errors:

- `401 Invalid email or password`
- `403 Account is suspended`
- `403 Email verification is required`

### `POST /auth/refresh`

Uses either the `refreshToken` cookie or this body:

```json
{
  "refreshToken": "jwt"
}
```

Response:

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "jwt",
    "refreshToken": "jwt",
    "user": "User"
  }
}
```

Also rotates the HTTP-only `refreshToken` cookie.

### `POST /auth/logout`

Uses either the `refreshToken` cookie or this body:

```json
{
  "refreshToken": "jwt"
}
```

Response:

```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": {}
}
```

### `POST /auth/verify-email`

Body:

```json
{
  "token": "email-verification-token"
}
```

Response:

```json
{
  "success": true,
  "message": "Email verified successfully",
  "data": {}
}
```

Current warning: the controller checks `req.query.token`, but the validator requires `body.token`, so the frontend should send the token in JSON body.

### `POST /auth/forgot-password`

Body:

```json
{
  "email": "user@example.com"
}
```

Response:

```json
{
  "success": true,
  "message": "If the email exists, a reset link has been sent",
  "data": {}
}
```

### `POST /auth/reset-password`

Body:

```json
{
  "token": "reset-token",
  "password": "newPassword123"
}
```

Response:

```json
{
  "success": true,
  "message": "Password reset successfully. Please login again.",
  "data": {}
}
```

## User Endpoints

All user endpoints require `Authorization: Bearer <accessToken>`.

### `GET /users/me`

Response:

```json
{
  "success": true,
  "message": "Profile retrieved",
  "data": { "user": "User" }
}
```

### `PATCH /users/me`

Body can be JSON, or `multipart/form-data` if sending `avatar`.

Accepted fields:

```js
{
  fullName?: string,
  phone?: string,
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say',
  university?: string,
  faculty?: string,
  preferredLanguage?: 'en' | 'ar',
  avatar?: File
}
```

Response:

```json
{
  "success": true,
  "message": "Profile updated",
  "data": { "user": "User" }
}
```

### `GET /users`

Roles: `admin`, `super_admin`.

Query:

```js
{
  page?: number,
  limit?: number,
  role?: 'student' | 'owner' | 'admin' | 'super_admin',
  isBlocked?: 'true' | 'false',
  q?: string
}
```

Response:

```json
{
  "success": true,
  "message": "Users retrieved",
  "data": { "users": ["User"] },
  "meta": "PaginationMeta"
}
```

### `GET /users/:id`

Roles: `admin`, `super_admin`.

Response:

```json
{
  "success": true,
  "message": "User retrieved",
  "data": { "user": "User" }
}
```

### `PATCH /users/:id`

Roles: `admin`, `super_admin`.

Accepted body:

```js
{
  fullName?: string,
  phone?: string,
  role?: 'student' | 'owner' | 'admin' | 'super_admin',
  isVerified?: boolean,
  isBlocked?: boolean,
  preferredLanguage?: 'en' | 'ar',
  university?: string,
  faculty?: string
}
```

Response:

```json
{
  "success": true,
  "message": "User updated",
  "data": { "user": "User" }
}
```

### `DELETE /users/:id`

Roles: `super_admin`.

Response:

```json
{
  "success": true,
  "message": "User deleted",
  "data": {}
}
```

## Apartment Endpoints

### `GET /apartments`

Public.

Query:

```js
{
  page?: number,
  limit?: number,
  q?: string,
  city?: string,
  district?: string,
  apartmentType?: 'studio' | 'room' | 'shared_room' | 'apartment' | 'bed',
  availability?: 'available' | 'reserved' | 'rented' | 'unavailable',
  beds?: number,
  rooms?: number,
  floor?: number,
  minPrice?: number,
  maxPrice?: number,
  minRating?: number,
  lng?: number,
  lat?: number,
  radiusKm?: number,
  sort?: 'price' | '-price' | 'createdAt' | '-createdAt' | 'averageRating' | '-averageRating',
  includeUnapproved?: string
}
```

Response:

```json
{
  "success": true,
  "message": "Apartments retrieved",
  "data": { "apartments": ["Apartment"] },
  "meta": "PaginationMeta"
}
```

Current warning: any truthy `includeUnapproved` query skips the published/approved filter on a public route. The frontend should not send this from public pages.

### `GET /apartments/:id`

Public for approved apartments. Optional auth lets owner/admin see unapproved apartments.

Response:

```json
{
  "success": true,
  "message": "Apartment retrieved",
  "data": { "apartment": "Apartment" }
}
```

### `GET /apartments/mine`

Roles: `owner`, `admin`, `super_admin`.

Response:

```json
{
  "success": true,
  "message": "Owner apartments retrieved",
  "data": { "apartments": ["Apartment"] }
}
```

### `POST /apartments`

Roles: `owner`, `admin`, `super_admin`.

Body: `multipart/form-data`.

Required fields:

```js
{
  images: File[], // field name must be images, max 10
  title: string,
  description_ar: string,
  description_en: string,
  price: number,
  city: string,
  district: string,
  address: string,
  buildingNumber: string,
  unitNumber: string,
  apartmentType: 'studio' | 'room' | 'shared_room' | 'apartment' | 'bed',
  beds: number,
  rooms: number,
  bathrooms: number,
  floor: number,
  amenities?: string[] | string,
  latitude?: number,
  longitude?: number
}
```

Response `201`:

```json
{
  "success": true,
  "message": "Apartment created successfully and is pending admin approval",
  "data": { "apartment": "Apartment" }
}
```

### `PATCH /apartments/:id`

Roles: owner of listing, `admin`, `super_admin`.

Body: JSON or `multipart/form-data`. Same fields as create, all optional. Sending new `images` replaces the old image list.

Response:

```json
{
  "success": true,
  "message": "Apartment updated successfully",
  "data": { "apartment": "Apartment" }
}
```

Owner edits reset the listing to `pending_approval` and `isApproved: false`.

### `DELETE /apartments/:id`

Roles: owner of listing, `admin`, `super_admin`.

Response:

```json
{
  "success": true,
  "message": "Apartment deleted successfully",
  "data": {}
}
```

## Booking Endpoints

All booking endpoints require auth.

### `GET /bookings/mine`

Roles: `student`, `owner`, `admin`, `super_admin`.

Query:

```js
{
  page?: number,
  limit?: number,
  status?: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired' | 'completed'
}
```

Response:

```json
{
  "success": true,
  "message": "Bookings retrieved",
  "data": { "bookings": ["Booking"] },
  "meta": "PaginationMeta"
}
```

Current behavior: students see their bookings; every non-student sees bookings where `ownerId` equals their user id.

### `POST /bookings`

Role: `student`.

Body:

```json
{
  "apartmentId": "mongo-id",
  "message": "Optional message",
  "checkInDate": "2026-06-01",
  "checkOutDate": "2026-06-30"
}
```

Response `201`:

```json
{
  "success": true,
  "message": "Booking request created successfully",
  "data": { "booking": "Booking" }
}
```

### `PATCH /bookings/:id/cancel`

Role: `student`.

Body:

```json
{
  "reason": "Optional reason"
}
```

Response:

```json
{
  "success": true,
  "message": "Booking cancelled successfully",
  "data": { "booking": "Booking" }
}
```

### `PATCH /bookings/:id/accept`

Roles in route: `owner`, `admin`, `super_admin`.

Body:

```json
{
  "note": "Optional owner note"
}
```

Response:

```json
{
  "success": true,
  "message": "Booking accepted successfully",
  "data": { "booking": "Booking" }
}
```

Current warning: service lookup requires `ownerId` to equal the current user id, so admins who are not the owner may still get `404 Pending booking request not found`.

### `PATCH /bookings/:id/reject`

Same body and role behavior as accept.

Response:

```json
{
  "success": true,
  "message": "Booking rejected successfully",
  "data": { "booking": "Booking" }
}
```

## Review Endpoints

### `GET /reviews/apartments/:apartmentId`

Public.

Query:

```js
{
  page?: number,
  limit?: number
}
```

Response:

```json
{
  "success": true,
  "message": "Reviews retrieved",
  "data": { "reviews": ["Review"] },
  "meta": "PaginationMeta"
}
```

### `POST /reviews`

Role: `student`.

Body:

```json
{
  "apartmentId": "mongo-id",
  "rating": 5,
  "comment": "Great place"
}
```

Response `201`:

```json
{
  "success": true,
  "message": "Review created successfully",
  "data": { "review": "Review" }
}
```

Business rule: the student can review only after an accepted/completed stay with `completedAt` or a past `checkOutDate`.

### `DELETE /reviews/:id`

Roles: `admin`, `super_admin`.

Response:

```json
{
  "success": true,
  "message": "Review removed successfully",
  "data": {}
}
```

## Notification Endpoints

All notification endpoints require auth.

### `GET /notifications/mine`

Query:

```js
{
  page?: number,
  limit?: number,
  isRead?: 'true' | 'false'
}
```

Response:

```json
{
  "success": true,
  "message": "Notifications retrieved",
  "data": {
    "notifications": ["Notification"],
    "unreadCount": 3
  },
  "meta": "PaginationMeta"
}
```

### `PATCH /notifications/:id/read`

Response:

```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": {}
}
```

### `PATCH /notifications/read-all`

Response:

```json
{
  "success": true,
  "message": "All notifications marked as read",
  "data": {}
}
```

## Admin Endpoints

All admin endpoints require roles `admin` or `super_admin`.

### `PATCH /admin/users/:id/block`

Response:

```json
{
  "success": true,
  "message": "User blocked successfully",
  "data": { "user": "User" }
}
```

### `PATCH /admin/users/:id/unblock`

Response:

```json
{
  "success": true,
  "message": "User unblocked successfully",
  "data": { "user": "User" }
}
```

### `PATCH /admin/apartments/:id/approve`

Response:

```json
{
  "success": true,
  "message": "Apartment approved successfully",
  "data": { "apartment": "Apartment" }
}
```

### `PATCH /admin/apartments/:id/reject`

Body:

```json
{
  "reason": "Optional reason"
}
```

Response:

```json
{
  "success": true,
  "message": "Apartment rejected successfully",
  "data": { "apartment": "Apartment" }
}
```

### `PATCH /admin/apartments/:id/remove`

Response:

```json
{
  "success": true,
  "message": "Apartment removed successfully",
  "data": { "apartment": "Apartment" }
}
```

### `POST /admin/announcements`

Body:

```json
{
  "title": "Announcement title",
  "content": "Announcement content",
  "audience": "all"
}
```

Allowed `audience`: `all`, `students`, `owners`, `admins`.

Response `201`:

```json
{
  "success": true,
  "message": "Announcement sent successfully",
  "data": { "announcement": "Announcement" }
}
```

## Analytics Endpoint

### `GET /analytics/dashboard`

Roles: `admin`, `super_admin`.

Response:

```json
{
  "success": true,
  "message": "Dashboard analytics retrieved",
  "data": {
    "totalUsers": 0,
    "totalStudents": 0,
    "totalOwners": 0,
    "activeListings": 0,
    "approvedListings": 0,
    "pendingListings": 0,
    "totalBookings": 0,
    "bookingStats": [
      { "_id": "pending", "count": 0 }
    ],
    "reviewStats": {
      "count": 0,
      "averageRating": 0
    }
  }
}
```

## Problems To Watch While Linking

1. Email verification blocks login. Register returns no tokens, so the frontend must show a verify-email flow before login will work.
2. Protected routes require verified, unblocked users. Otherwise the backend returns `403`.
3. Refresh token is both returned in JSON and set as an HTTP-only cookie. Choose one frontend strategy and keep it consistent.
4. `POST /auth/verify-email` should send the token in the request body, not only in the URL query.
5. Public apartment listing should not use `includeUnapproved`, because the backend currently trusts that query parameter.
6. Admin user responses may include `refreshTokens` metadata. Frontend should ignore it, and backend should ideally sanitize it.
7. Admin booking accept/reject routes may fail for non-owner admins because the service still filters by `ownerId`.
