# CoverAI — Architecture & Design Overhaul Plan

> **Goal**: Refactor the CoverAI monorepo to production-quality architecture and overhaul the entire visual design language to an Anthropic-inspired warm, editorial, premium aesthetic — making it a standout hackathon submission.

---

## Progress Checklist

- [x] **Session 1: Foundation — Types, Root Cleanup, Design Tokens**
  - [x] Fix `UserRoleSchema` and export response types in `packages/shared-types/src/index.ts`
  - [x] Clean root directory clutter (delete debug screenshots, logs, debug scripts) & update `.gitignore`
  - [x] Configure Anthropic-inspired warm design tokens in `apps/web/src/app/globals.css`
  - [x] Update `apps/web/tailwind.config.ts` with font families & custom color palette
  - [x] Update `apps/web/src/app/layout.tsx` (Google Fonts Inter + Playfair Display / Serif, theme setup)
  - [x] Verify packages build & type-check

- [x] **Session 2: Component Library & Layout DRY**
  - [x] Create `apps/web/src/components/layouts/AppShell.tsx` reusable layout
  - [x] Refactor `(dashboard)/layout.tsx`, `(insurer)/layout.tsx`, `(advisor)/layout.tsx` to use `AppShell`
  - [x] Create `useRole` hook in `apps/web/src/hooks/useRole.ts`
  - [x] Create UI primitives (`MetricBar`, `EmptyState`, `StatusBadge`, `ToastOverlay`)
  - [x] Expand `@coverai/ui` with enhanced Button, Card, Badge, Input primitives

- [x] **Session 3: Landing Page + Auth Pages Redesign (Anthropic Aesthetic)**
  - [x] Overhaul `apps/web/src/app/page.tsx` with editorial hero, warm palette, clean typography, dark contrast trust section
  - [x] Redesign `apps/web/src/app/(auth)/login/page.tsx`
  - [x] Redesign `apps/web/src/app/(auth)/register/page.tsx`

- [x] **Session 4: Dashboard & Internal Pages Redesign**
  - [x] Redesign `(dashboard)/dashboard/page.tsx` and Tab Switcher
  - [x] Redesign `(dashboard)/dashboard/vault/page.tsx`
  - [x] Redesign `(dashboard)/dashboard/ai-advisor/page.tsx`
  - [x] Redesign `(dashboard)/claims/page.tsx`, `claims/new/page.tsx`, `claims/[id]/page.tsx`
  - [x] Redesign `(insurer)/insurer/dashboard/page.tsx` & claim queue
  - [x] Redesign `(advisor)/advisor/customers/page.tsx`
  - [x] Redesign `(dashboard)/dashboard/privacy/page.tsx` & `my-advisor/page.tsx`

- [x] **Session 5: API Client Cleanup + Final Polish & Verification**
  - [x] Deduplicate types in `apps/web/src/lib/api-client.ts` by consuming `@coverai/shared-types`
  - [x] Full TypeScript build verification across monorepo (`pnpm build`)
  - [x] End-to-End sanity checks and Walkthrough artifact creation
