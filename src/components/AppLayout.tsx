'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { keilSidebarMenu } from '@/config/navigation/keil';
import { Sidebar } from './layout/Sidebar';
import { Navbar } from './layout/Navbar';
import { PermissionProvider, usePermissions } from '@/providers/PermissionProvider';

function LayoutContent({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const pathname = usePathname();
  const router = useRouter();
  const activeEntity = 'keil';
  const { hasPermission } = usePermissions();

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (!token && pathname !== '/login') {
      router.push('/login');
    } else if (token && pathname === '/login') {
      router.push('/keil');
    } else if (storedUser) {
      const userObj = JSON.parse(storedUser);
      setUser(userObj);
    }
  }, [pathname, router]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const canShowItem = (allowedRoles?: string[], permissionKey?: string, path?: string) => {
    if (!user) return false;
    const userRole = (user?.role_name || user?.user_types?.name || '').toLowerCase();
    const isAdmin = userRole === 'admin' || user?.email?.toLowerCase() === 'admin@keil.com' || user?.email?.toLowerCase() === 'admin@maxtron.com';
    if (isAdmin) return true;

    if (permissionKey) {
        return hasPermission(permissionKey, 'view');
    }
    if (!allowedRoles || allowedRoles.length === 0) return true;
    return allowedRoles.some(role => role.toLowerCase() === userRole);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const toggleExpand = (title: string) => {
    setExpanded(prev => ({ ...prev, [title]: !prev[title] }));
  };

  if (!mounted) return null;
  if (pathname === '/login') return <>{children}</>;

  const currentMenu = keilSidebarMenu;

  return (
    <div className="h-screen flex bg-background font-sans text-foreground overflow-hidden">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 sidebar-hide:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        menuItems={currentMenu}
        activeEntity={activeEntity}
        expanded={expanded}
        toggleExpand={toggleExpand}
        canShowItem={canShowItem}
        hasPermission={hasPermission}
        router={router}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Navbar
          user={user}
          handleLogout={handleLogout}
          onMenuToggle={() => setSidebarOpen(o => !o)}
        />

        <div className="flex-1 overflow-auto bg-background p-3 sidebar-hide:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <PermissionProvider>
            <LayoutContent>{children}</LayoutContent>
        </PermissionProvider>
    );
}
