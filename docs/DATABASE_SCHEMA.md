# Database Schema Overview

## Users

Stores students, owners, admins, and super admins. Includes secure password hash, role, verification status, block status, multi-device refresh tokens, profile fields, and language preference.

## Apartments

Stores property listings. Includes bilingual descriptions, location data, pricing, rooms/beds, amenities, images, approval status, availability, average rating, and duplicate-prevention index on owner + address + building + floor + unit.

## Bookings

Stores rent requests. Enforces one active request per student per apartment through a partial unique index. Supports pending, accepted, rejected, cancelled, expired, and completed statuses.

## Reviews

Stores one review per student per apartment. Review creation requires a verified completed stay.

## Notifications

Stores in-app notifications for all users.

## Announcements

Stores admin-created announcements and target audiences.

## Audit Logs

Tracks login/admin/moderation-sensitive actions and request metadata.
