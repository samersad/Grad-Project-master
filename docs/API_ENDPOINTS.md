# SOKON API Endpoint Summary

Base URL: `/api/v1`

## Auth

- `POST /auth/register/student`
- `POST /auth/register/owner`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/verify-email`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

## Users

- `GET /users/me`
- `PATCH /users/me`
- `GET /users` admin/super_admin
- `GET /users/:id` admin/super_admin
- `PATCH /users/:id` admin/super_admin
- `DELETE /users/:id` super_admin

## Apartments

- `GET /apartments`
- `GET /apartments/:id`
- `GET /apartments/mine` owner/admin/super_admin
- `POST /apartments` owner/admin/super_admin
- `PATCH /apartments/:id` owner/admin/super_admin
- `DELETE /apartments/:id` owner/admin/super_admin

## Bookings

- `GET /bookings/mine`
- `POST /bookings` student
- `PATCH /bookings/:id/cancel` student
- `PATCH /bookings/:id/accept` owner/admin/super_admin
- `PATCH /bookings/:id/reject` owner/admin/super_admin

## Reviews

- `GET /reviews/apartments/:apartmentId`
- `POST /reviews` student
- `DELETE /reviews/:id` admin/super_admin

## Notifications

- `GET /notifications/mine`
- `PATCH /notifications/read-all`
- `PATCH /notifications/:id/read`

## Admin

- `PATCH /admin/users/:id/block`
- `PATCH /admin/users/:id/unblock`
- `PATCH /admin/apartments/:id/approve`
- `PATCH /admin/apartments/:id/reject`
- `PATCH /admin/apartments/:id/remove`
- `POST /admin/announcements`

## Analytics

- `GET /analytics/dashboard`
