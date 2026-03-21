# Architecture Overview

See the full implementation specification and engineering execution plan in the project docs.

## High-Level Structure

- **Frontend:** Next.js 14 App Router, React, Tailwind CSS
- **Backend:** Next.js API routes, Prisma ORM, PostgreSQL
- **Auth:** JWT (jose), bcrypt, invitation + 2FA flow

## Key Directories

- `app/` — Pages and API routes
- `lib/` — Backend logic (auth, db, validation, services)
- `components/` — Reusable UI (to be added)
- `prisma/` — Schema and migrations

## Roles

- **Professor** — Own schedule, preferences, submit for review
- **Director** — Program calendar, approvals, program-scoped access
- **Dean** — Full CRUD, faculty management, publish

## Data Model

- **Identity:** faculty + accounts (faculty exists before account)
- **Courses:** course_templates + course_offerings; course_template_programs (cross-listing); course_offering_instructors (team teaching)
- **Scheduling:** schedule_versions (draft/official), schedule_slots, schedule_proposals
