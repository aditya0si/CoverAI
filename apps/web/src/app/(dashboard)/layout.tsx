'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ShieldCheck, 
  FilePlus, 
  FileText, 
  HelpCircle, 
  LogOut, 
  Menu, 
  X,
  User
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { logout } from '@/lib/auth';
import { cn } from '@coverai/ui';

interface NavItem {
  name: string;
  href: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, sidebarOpen, setSidebarOpen, toggleSidebar, syncUser } = useAppStore();

  useEffect(() => {
    // Sync user from localStorage once on mount (covers page refresh / direct navigation)
    syncUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fullName = user?.full_name || 'Valued Customer';
  const role = user?.role || 'customer';

  const navItems: NavItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'My Policies', href: '/policies', icon: ShieldCheck },
    { name: 'File a Claim', href: '/claims/new', icon: FilePlus },
    { name: 'My Claims', href: '/claims', icon: FileText },
    { name: 'Help', href: '/help', icon: HelpCircle },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row relative">
      {/* Mobile Top Navigation Header */}
      <header className="md:hidden sticky top-0 z-40 w-full h-16 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-650 flex items-center justify-center shadow-md">
            <ShieldCheck className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="font-bold text-base text-white">CoverAI</span>
        </div>
        <button onClick={toggleSidebar} className="p-2 text-slate-400 hover:text-white transition-colors">
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Desktop & Mobile Sidebar Drawer */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 md:sticky md:z-10 flex flex-col w-64 border-r border-slate-900 bg-slate-950 p-5 transform transition-transform duration-350 ease-in-out md:translate-x-0 shrink-0 h-screen",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-900 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-650 flex items-center justify-center shadow-lg">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">CoverAI</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1.5 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Badge Details */}
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1B4FD8]/10 text-blue-400 flex items-center justify-center border border-[#1B4FD8]/10">
            <User className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <h4 className="font-bold text-xs text-white truncate leading-normal">{fullName}</h4>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#1B4FD8]/10 text-[#1B4FD8] mt-1 uppercase border border-[#1B4FD8]/25 tracking-wider">
              {role}
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all",
                  isActive
                    ? "bg-[#1B4FD8] text-white shadow-md shadow-[#1B4FD8]/15"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                )}
              >
                <item.icon className="w-4.5 h-4.5 shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout Button */}
        <button
          onClick={logout}
          className="flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide text-rose-400 hover:text-rose-350 hover:bg-rose-500/5 border border-transparent hover:border-rose-500/10 mt-auto transition-all cursor-pointer"
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          <span>Sign Out</span>
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-h-[calc(100vh-64px)] md:min-h-screen flex flex-col p-4 sm:p-6 md:p-8 overflow-y-auto max-w-7xl w-full pb-24 md:pb-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-slate-950/95 border-t border-slate-900 flex justify-around items-center px-2 backdrop-blur-lg">
        {navItems.slice(0, 4).map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all",
                isActive ? "text-[#1B4FD8]" : "text-slate-500"
              )}
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              <span className="text-[9px] font-semibold mt-1 tracking-wide">{item.name.split(' ')[0]}</span>
            </Link>
          );
        })}
        <button
          onClick={logout}
          className="flex flex-col items-center justify-center w-14 h-12 text-slate-500 active:text-rose-400"
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          <span className="text-[9px] font-semibold mt-1">Exit</span>
        </button>
      </nav>
    </div>
  );
}
