'use client';

import React from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Briefcase,
} from 'lucide-react';
import { AppShell, NavItem } from '@/components/layouts/AppShell';

const insurerNavItems: NavItem[] = [
  { name: 'Claims Queue', href: '/insurer/dashboard', icon: LayoutDashboard },
  { name: 'All Claims', href: '/insurer/claims', icon: ClipboardList },
  { name: 'Audit & Reports', href: '/insurer/reports', icon: BarChart3 },
];

export default function InsurerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      navItems={insurerNavItems}
      portalLabel="Insurer Officer Portal"
      roleBadge="Claims Officer"
      brandIcon={Briefcase}
    >
      {children}
    </AppShell>
  );
}
