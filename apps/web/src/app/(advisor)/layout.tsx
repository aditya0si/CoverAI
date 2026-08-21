'use client';

import React from 'react';
import {
  Users,
  CalendarClock,
  FileText,
  Handshake,
} from 'lucide-react';
import { AppShell, NavItem } from '@/components/layouts/AppShell';

const advisorNavItems: NavItem[] = [
  { name: 'My Customers', href: '/advisor/customers', icon: Users },
  { name: 'Renewals Due', href: '/advisor/renewals', icon: CalendarClock },
  { name: 'Claims Overview', href: '/advisor/claims', icon: FileText },
];

export default function AdvisorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      navItems={advisorNavItems}
      portalLabel="Advisor Hub"
      roleBadge="Insurance Advisor"
      brandIcon={Handshake}
    >
      {children}
    </AppShell>
  );
}
