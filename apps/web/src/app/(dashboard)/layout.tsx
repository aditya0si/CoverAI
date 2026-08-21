'use client';

import React from 'react';
import {
  LayoutDashboard,
  ShieldCheck,
  FilePlus,
  FileText,
  HelpCircle,
  Cpu,
  Lock,
  Users,
} from 'lucide-react';
import { AppShell, NavItem } from '@/components/layouts/AppShell';

const customerNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'My Policies', href: '/policies', icon: ShieldCheck },
  { name: 'File a Claim', href: '/claims/new', icon: FilePlus },
  { name: 'My Claims', href: '/claims', icon: FileText },
  { name: 'AI Advisor', href: '/dashboard/ai-advisor', icon: Cpu },
  { name: 'My Advisor', href: '/dashboard/my-advisor', icon: Users },
  { name: 'Privacy & DPDP', href: '/dashboard/privacy', icon: Lock },
  { name: 'Help', href: '/help', icon: HelpCircle },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      navItems={customerNavItems}
      portalLabel="Customer Portal"
      roleBadge="Policyholder"
      brandIcon={ShieldCheck}
    >
      {children}
    </AppShell>
  );
}
