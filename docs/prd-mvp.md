# Product Requirements Document
## Court Management System — MVP
**Version:** 1.3
**Date:** April 2026
**Status:** Draft

---

## 1. Overview

A web-based court management system for a sports facility operator to manage court bookings, entrance passes, and day-to-day operations. The system serves two audiences: customers who want to reserve courts and purchase entrance passes, and admins who manage the facility.

**Reference Inspiration:** Astra Pickleball Center (astrapickleball.com)

---

## 2. Goals

- Give customers a self-serve way to book courts and purchase entrance passes online
- Give admins full visibility and control over daily operations from the same web app
- Replace manual booking processes (calls, messages, spreadsheets)

---

## 3. Non-Goals (Out of Scope for MVP)

- Online payment processing — all payments are verified manually by admin
- Membership or loyalty programs
- DUPR or third-party rating system integration
- Mobile app (iOS / Android)
- Pro shop / inventory management
- Café / POS system
- Coaching schedule management
- SMS or push notifications
- Events admin CRUD — events are hardcoded for MVP
- Separate Staff role — one admin role handles all internal operations
- Admin analytics dashboard — deprioritized until the client knows what metrics matter

---

## 4. Tech Stack

| Layer | Tool |
|---|---|
| Frontend & Hosting | Next.js on Vercel (Hobby) |
| Backend & Database | Supabase (Free tier) |
| Authentication | Supabase Auth (email + password) |
| File Storage | Supabase Storage |
| Email Notifications | Resend (Free tier) |
| Domain | Client-provided custom domain |

### Architecture

The system is a single Next.js application serving both the customer-facing site and the admin panel under one domain. Admin routes live under `/admin/*` and are protected by Next.js middleware that checks the user's role.

```
yourcourt.com          → Customer-facing pages
yourcourt.com/admin/*  → Admin panel (role-protected)
```

One Supabase project — one database, one auth system, one file storage bucket.

### Deployment

A single Vercel project connected to the repository. One domain.

---

## 5. User Roles

### Customer
A registered user who books courts or purchases entrance passes. Can view and manage their own bookings and passes.

### Admin
Full access to everything. Manages courts, bookings, users, entrance passes, events, payment settings, and facility settings. Also handles gate entry (QR scanning) and walk-in bookings.

---

## 6. Pages & Routes

### Customer-Facing

#### Public (No Login Required)

| Page | Route | Description |
|---|---|---|
| Home / Landing | `/` | Facility info, gallery, FAQs, CTA to book (all static) |
| Events | `/events` | Hardcoded list of upcoming events and tournaments |
| Contact | `/contact` | Inquiry form for events, corporate bookings |
| Login | `/login` | Email + password login |
| Register | `/register` | New customer account creation |

#### Authenticated (Login Required)

| Page | Route | Description |
|---|---|---|
| Book a Court | `/booking` | Select date, court, and time range |
| Buy Entrance Pass | `/entrance` | Select date and number of persons |
| Payment Instructions | `/payment/[bookingOrPassId]` | Shown after submission — displays QR codes and account details, accepts receipt upload |
| My Bookings | `/my-bookings` | View upcoming and past court bookings |
| My Passes | `/my-passes` | View entrance pass QR codes |
| My Account | `/account` | Update name and password (email changes not supported in MVP) |

### Admin Panel — `/admin/*`

Accessible to admin role only. Middleware redirects non-admins away.

| Page | Route | Description |
|---|---|---|
| Login | `/admin/login` | Admin login |
| Home | `/admin` | Redirects to `/admin/schedule` for MVP |
| Court Schedule | `/admin/schedule` | Calendar/grid view of all courts by day |
| All Bookings | `/admin/bookings` | Full list with filters (date, court, status) |
| Booking Detail | `/admin/bookings/[id]` | View booking, approve payment, reschedule, cancel, add notes |
| Walk-in Booking | `/admin/bookings/new` | Manually create a booking for walk-in customers |
| Entrance Passes | `/admin/passes` | View all passes, mark as used |
| QR Scanner | `/admin/scan` | Camera-based QR scanner with manual code/name lookup fallback |
| Users | `/admin/users` | View all customer accounts, promote to admin |
| Courts | `/admin/courts` | Manage courts (name, status, rate) |
| Blocked Slots | `/admin/blocked-slots` | Block specific time slots (maintenance, private events) |
| Payment Settings | `/admin/payment-settings` | Upload GCash QR, bank account details shown to customers |
| Contact Inquiries | `/admin/inquiries` | View inquiries submitted via contact form |
| Settings | `/admin/settings` | Facility name, operating hours, rates, contact info |

---

## 7. Core Features

### 7.1 Court Booking

Customers select a date, then see a real-time availability grid of all courts and time slots. They pick a **contiguous time range** on a single court (e.g. 2pm–6pm), confirm their booking, and are redirected to the Payment Instructions page. The booking is held in **Pending** state until the admin approves it after verifying the uploaded receipt.

**Booking States:** Pending → Confirmed → Completed / Cancelled

**Business Rules:**
- A booking covers one or more consecutive time slots on the same court
- Bookings are non-refundable but reschedulable with at least 10 days' notice
- Walk-in bookings can be created directly by admin
- Bookings cannot overlap with blocked slots or existing confirmed/pending bookings

**Payment Flow:**
Customer submits booking → redirected to Payment Instructions page showing GCash QR and bank details (pulled from Payment Settings) → customer uploads proof of payment → admin reviews and confirms or rejects → customer receives confirmation email.

---

### 7.2 Entrance Pass

Customers purchase a day pass for a selected date and number of persons. Same payment flow as bookings: submit → payment instructions → upload receipt → admin confirms. After admin confirmation, each person receives a unique QR code by email. Admin scans the QR code at the gate to mark it as used.

**Pass States:** Pending → Confirmed → Redeemed / Expired

---

### 7.3 Admin Booking Management

Admin can view all bookings in a calendar or list view. From a booking detail page they can:
- Approve or reject a booking after viewing the uploaded payment receipt
- Reschedule a booking (subject to availability)
- Cancel a booking
- Add internal notes

---

### 7.4 Blocked Time Slots

Admin can block specific court/time combinations to prevent customer bookings — useful for maintenance, private events, or holds. Blocked slots appear in the customer availability grid as unavailable. Admin can unblock them at any time.

---

### 7.5 QR Code Gate Entry

When an entrance pass is confirmed, each guest receives a QR code by email. At the gate, admin opens the scanner page on any device (phone or tablet):

- **Primary flow:** camera scans the QR code, system marks the pass as redeemed, shows a green/red confirmation on screen
- **Fallback flow:** if the camera fails or the customer doesn't have the QR, admin can search by pass code or customer name and manually mark as redeemed

---

### 7.6 Events Listing (Static)

A public-facing events page showing upcoming events (tournaments, open play nights, clinics). **Content is hardcoded in the repo for MVP** — no admin CRUD. To update events, the developer edits the file and redeploys. Each event has a title, date, description, and optional registration link.

---

### 7.7 Payment Settings & Instructions

**Admin side — Payment Settings:**
Admin uploads one or more payment method entries. Each entry has a label (e.g. "GCash", "BPI"), an optional QR image, and account details text. These are displayed to customers on the Payment Instructions page.

**Customer side — Payment Instructions:**
After submitting a booking or pass purchase, the customer lands on a page showing:
- Booking/pass summary and total amount
- All payment method entries (QR images + account details)
- A receipt upload widget (image or PDF)
- Confirmation that admin will review within X hours

---

### 7.8 Contact Inquiries

Customers submit inquiries via the public contact form (name, email, phone, message). Inquiries are:
- Saved to the database so admin can view them in `/admin/inquiries`
- Emailed to the admin so they can reply directly from their inbox

Admin can mark an inquiry as resolved in the admin panel.

---

### 7.9 Email Notifications (via Resend)

| Trigger | Recipient | Content |
|---|---|---|
| Booking submitted | Customer | Booking summary + link to payment instructions |
| Booking confirmed | Customer | Confirmation + court details |
| Booking rejected | Customer | Rejection reason |
| Booking cancelled | Customer | Cancellation notice |
| Booking rescheduled | Customer | New booking details |
| Entrance pass submitted | Customer | Link to payment instructions |
| Entrance pass confirmed | Customer | QR code(s) for each guest |
| Contact form submitted | Admin | Inquiry details |

---

## 8. Data Models (High Level)

### User
All accounts — customers and admins. Role field determines access level. Uses Supabase Auth under the hood.

### Court
A physical court in the facility. Fields: name, status (active / under maintenance), hourly rate.

### Booking
Links a user to a contiguous time range on a specific court. Tracks booking status, payment receipt file reference, reschedule history, and admin notes.

### TimeSlot
Represents a one-hour block on a specific court and date. Used for availability calculations. Status: available, booked, or blocked.

### EntrancePass
Purchased by a customer for a specific date and number of guests. Each guest gets a unique QR code. Tracks redemption status per guest.

### PaymentMethod
A payment method entry managed by admin. Fields: label, QR image reference, account details text, display order.

### ContactInquiry
Submissions from the contact form. Fields: name, email, phone, message, status (new / resolved), timestamps.

---

## 9. Service Constraints (Free Tier)

| Service | Relevant Limit |
|---|---|
| Vercel Hobby | Fair use limits; suitable for MVP/pre-launch stage |
| Supabase Free | 500MB database, 1GB file storage, 50K monthly active users; project pauses after 7 days of inactivity |
| Resend Free | 3,000 emails/month, 100/day |

These limits are sufficient for an MVP. Upgrade paths are straightforward when the client is ready for full production.

---

## 10. MVP Success Criteria

- Customers can browse availability and submit a court booking without calling or messaging
- Customers can purchase an entrance pass and receive QR codes by email after admin confirmation
- Customers can see payment instructions and upload receipts in-app
- Admin can review payment receipts and confirm/reject bookings and passes from the admin panel
- Admin can scan QR codes at the gate, with a manual lookup fallback
- Admin can block time slots to control availability
- Contact form submissions reach admin both in-app and by email
- The system sends the right email at every key touchpoint

---

## 11. Future Phases (Post-MVP)

- **Automated payment processing** — e.g. PayMongo integration to remove the manual receipt review step
- **Recurring bookings** — weekly/monthly court reservations
- **Membership system** — monthly packages and member discounts
- **Coaching scheduler** — bookable coaching sessions
- **Private lounge booking** — as a separate bookable resource
- **Analytics dashboard** — occupancy rates, revenue trends, peak hours
- **Events admin CRUD** — self-serve event management for the client
- **Staff role** — separate role with limited permissions (scanning, walk-ins only)
- **Booking transfer** — change the name on an existing booking
- **Corporate/event packages** — multi-court + lounge bundle pricing
- **Multi-venue support** — if the client expands to additional locations
