'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, X, User as UserIcon, LucideIcon } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { logout } from '@/lib/auth';
import { cn } from '@coverai/ui';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
}

export interface AppShellProps {
  children: React.ReactNode;
  navItems: NavItem[];
  portalLabel?: string;
  roleBadge?: string;
  brandIcon: LucideIcon;
  accentBadgeColor?: string;
}

export function AppShell({
  children,
  navItems,
  portalLabel = 'CoverAI Portal',
  roleBadge,
  brandIcon: BrandIcon,
}: AppShellProps) {
  const pathname = usePathname();
  const { user, sidebarOpen, setSidebarOpen, toggleSidebar, syncUser } = useAppStore();

  useEffect(() => {
    syncUser();
  }, [pathname, syncUser]);

  const fullName = user?.full_name || 'Valued User';
  const roleName = roleBadge || user?.role?.replace('_', ' ') || 'Customer';

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#191919] flex flex-col md:flex-row relative selection:bg-[#191919] selection:text-[#FAF8F5]">
      {/* Mobile Top Navigation Header */}
      <header className="md:hidden sticky top-0 z-40 w-full h-16 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-[#E2DDD4] px-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-[#191919] text-[#FAF8F5] flex items-center justify-center shadow-sm">
            <BrandIcon className="h-4 w-4" />
          </div>
          <div>
            <span className="font-serif-heading font-bold text-base tracking-tight text-[#191919]">CoverAI</span>
            <span className="text-[10px] text-[#6E6862] ml-1.5 font-medium">{portalLabel}</span>
          </div>
        </div>
        <button
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={sidebarOpen}
          className="p-2 text-[#6E6862] hover:text-[#191919] transition-colors rounded-lg hover:bg-[#F1EDE4]"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Desktop & Mobile Sidebar Drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 md:sticky md:z-10 flex flex-col w-64 border-r border-[#E2DDD4] bg-[#FAF8F5] p-5 transform transition-transform duration-300 ease-in-out md:translate-x-0 shrink-0 h-screen',
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        )}
      >
        {/* Sidebar Brand Header */}
        <div className="flex items-center justify-between pb-5 border-b border-[#E2DDD4] mb-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#191919] text-[#FAF8F5] flex items-center justify-center shadow-sm">
              <BrandIcon className="h-4.5 w-4.5" />
            </div>
            <div>
              <span className="font-serif-heading font-bold text-lg tracking-tight text-[#191919] block leading-none">
                CoverAI
              </span>
              <span className="text-[10px] font-medium text-[#6E6862] tracking-wide mt-1 block">
                {portalLabel}
              </span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
            className="md:hidden p-1.5 text-[#6E6862] hover:text-[#191919] rounded-lg hover:bg-[#F1EDE4]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Badge Details */}
        <div className="p-3.5 bg-[#F3EFE6] border border-[#E2DDD4] rounded-2xl mb-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FAF8F5] text-[#191919] flex items-center justify-center border border-[#E2DDD4] shrink-0 font-medium">
            <UserIcon className="w-4 h-4 text-[#6E6862]" />
          </div>
          <div className="overflow-hidden min-w-0">
            <h4 className="font-semibold text-xs text-[#191919] truncate leading-tight">{fullName}</h4>
            <span className="inline-block text-[9px] font-medium text-[#6E6862] uppercase tracking-wider mt-0.5">
              {roleName}
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' &&
                item.href !== '/insurer/dashboard' &&
                item.href !== '/advisor/customers' &&
                pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group',
                  isActive
                    ? 'bg-[#191919] text-[#FAF8F5] shadow-sm font-semibold'
                    : 'text-[#6E6862] hover:text-[#191919] hover:bg-[#F1EDE4]'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      'w-4 h-4 shrink-0 transition-colors',
                      isActive ? 'text-[#FAF8F5]' : 'text-[#8C847B] group-hover:text-[#191919]'
                    )}
                  />
                  <span>{item.name}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={cn(
                      'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                      isActive
                        ? 'bg-[#FAF8F5]/20 text-[#FAF8F5]'
                        : 'bg-[#E2DDD4] text-[#6E6862]'
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Actions / Sign Out */}
        <div className="pt-4 mt-auto border-t border-[#E2DDD4]">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-[#6E6862] hover:text-[#C0583E] hover:bg-[#FDF2F0] transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Page Content */}
      <main className="flex-1 min-h-[calc(100vh-64px)] md:min-h-screen flex flex-col p-4 sm:p-6 md:p-8 lg:p-10 overflow-y-auto max-w-7xl w-full mx-auto pb-24 md:pb-10">
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#FAF8F5]/95 border-t border-[#E2DDD4] flex justify-around items-center px-2 backdrop-blur-lg">
        {navItems.slice(0, 4).map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' &&
              item.href !== '/insurer/dashboard' &&
              item.href !== '/advisor/customers' &&
              pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all',
                isActive ? 'text-[#191919] font-bold' : 'text-[#8C847B]'
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[9px] font-medium mt-1 tracking-tight">{item.name.split(' ')[0]}</span>
            </Link>
          );
        })}
        <button
          onClick={logout}
          className="flex flex-col items-center justify-center w-14 h-12 text-[#8C847B] active:text-[#C0583E]"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-[9px] font-medium mt-1">Exit</span>
        </button>
      </nav>
    </div>
  );
}
