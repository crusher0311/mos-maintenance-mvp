// components/ui/Layout.tsx
import { ReactNode } from "react";
import { Navigation, NavigationIcons } from "./Navigation";

interface LayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
  header?: ReactNode;
  className?: string;
}

export function Layout({ children, sidebar, header, className = "" }: LayoutProps) {
  return (
    <div className={`min-h-screen bg-gray-50 ${className}`}>
      {header && (
        <div className="bg-white shadow-sm border-b border-gray-200">
          {header}
        </div>
      )}
      
      <div className="flex">
        {sidebar && (
          <div className="w-64 bg-white shadow-sm min-h-screen">
            <div className="p-4">
              {sidebar}
            </div>
          </div>
        )}
        
        <div className="flex-1">
          <main className="p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  userRole?: 'admin' | 'shop' | 'user';
}

export function DashboardLayout({ children, title = "Dashboard", userRole = 'user' }: DashboardLayoutProps) {
  const getNavigationItems = () => {
    const commonItems = [
      {
        name: "Dashboard",
        href: "/dashboard",
        icon: NavigationIcons.Dashboard
      },
      {
        name: "Vehicles",
        href: "/dashboard/vehicles",
        icon: NavigationIcons.Vehicles
      }
    ];

    if (userRole === 'admin') {
      return [
        ...commonItems,
        {
          name: "Analytics",
          href: "/dashboard/analytics",
          icon: NavigationIcons.Analytics
        },
        {
          name: "Admin",
          href: "/admin",
          icon: NavigationIcons.Settings,
          children: [
            { name: "Shops", href: "/admin/shops" },
            { name: "Users", href: "/admin/users" },
            { name: "System", href: "/admin/system" }
          ]
        }
      ];
    }

    if (userRole === 'shop') {
      return [
        ...commonItems,
        {
          name: "Customers",
          href: "/dashboard/customers",
          icon: NavigationIcons.Users
        },
        {
          name: "Settings",
          href: "/dashboard/settings",
          icon: NavigationIcons.Settings
        }
      ];
    }

    return commonItems;
  };

  const header = (
    <div className="flex items-center justify-between px-6 py-4">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center space-x-4">
        <span className="text-sm text-gray-500">Welcome back!</span>
      </div>
    </div>
  );

  const sidebar = (
    <Navigation 
      items={getNavigationItems()}
      title="MOS Maintenance"
    />
  );

  return (
    <Layout header={header} sidebar={sidebar}>
      {children}
    </Layout>
  );
}