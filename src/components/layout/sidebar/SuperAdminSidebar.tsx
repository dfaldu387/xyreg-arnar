import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Users, CreditCard, Settings, Shield, FileText, History, MessageSquare, Key, Layers, Ticket, Sparkles, DollarSign } from 'lucide-react';

export default function SuperAdminSidebar() {
  const location = useLocation();

  const navigationItems = [
    {
      id: 'users',
      label: 'Users',
      icon: Users,
      path: '/super-admin/app/users',
    },
    // {
    //   id: 'billing',
    //   label: 'Billing',
    //   icon: CreditCard,
    //   path: '/super-admin/app/billing',
    // },
    {
      id: 'plans',
      label: 'Plans',
      icon: Settings,
      path: '/super-admin/app/plans',
    },
    {
      id: 'plan-pricing',
      label: 'Pricing Management',
      icon: DollarSign,
      path: '/super-admin/app/plan-pricing',
    },
    {
      id: 'api-keys',
      label: 'API Key Management',
      icon: Key,
      path: '/super-admin/app/api-keys',
    },
    {
      id: 'documents',
      label: 'Compliance Instances',
      icon: FileText,
      path: '/super-admin/app/documents',
    },
    {
      id: 'templates',
      label: 'Templates',
      icon: FileText,
      path: '/super-admin/app/templates',
    },
    {
      id: 'audit-logs',
      label: 'Audit Log',
      icon: History,
      path: '/super-admin/app/audit-logs',
    },
    {
      id: 'gap-analysis',
      label: 'Gap Analysis',
      icon: FileText,
      path: '/super-admin/app/gap-analysis',
    },
    {
      id: 'variant-config',
      label: 'Variant Configuration',
      icon: Layers,
      path: '/super-admin/app/variant-config',
    },
    {
      id: 'variant-documents',
      label: 'Variant Documents',
      icon: Layers,
      path: '/super-admin/app/variant-documents',
    },
    {
      id: 'feedback',
      label: 'Feedback',
      icon: MessageSquare,
      path: '/super-admin/app/feedback',
    },
    {
      id: 'whx-codes',
      label: 'WHX Event Codes',
      icon: Ticket,
      path: '/super-admin/app/whx-codes',
    },
    {
      id: 'whx-users',
      label: 'WHX Event Users',
      icon: Sparkles,
      path: '/super-admin/app/whx-users',
    }
  ];

  return (
    <Sidebar className="w-64 border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border bg-gradient-to-r from-sidebar-accent to-sidebar">
        <div className="p-6">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-r from-primary to-sidebar-primary rounded-lg shadow-sm">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-sidebar-foreground">
                Super Admin
              </h1>
              <p className="text-sm text-muted-foreground">System Management</p>
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-4">
        <SidebarMenu className="space-y-4">
          {/* Navigation Items */}
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton 
                  asChild 
                  isActive={isActive}
                  className={`w-full h-16 px-5 rounded-2xl transition-all duration-300 ease-in-out transform ${
                    isActive
                      ? 'bg-gradient-to-r from-primary to-sidebar-primary text-primary-foreground shadow-xl scale-105'
                      : 'bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-foreground hover:text-sidebar-foreground border-2 border-sidebar-border hover:border-primary/30 hover:shadow-lg hover:scale-102'
                  }`}
                >
                  <Link to={item.path} className="flex items-center space-x-4 w-full h-full">
                    <div className={`p-3 rounded-xl flex-shrink-0 ${
                      isActive 
                        ? 'bg-primary-foreground/20 backdrop-blur-sm' 
                        : 'bg-sidebar-accent group-hover:bg-primary/10'
                    }`}>
                      <Icon className={`h-6 w-6 transition-all duration-300 ${
                        isActive ? 'text-primary-foreground' : 'text-sidebar-foreground group-hover:text-primary'
                      }`} />
                    </div>
                    
                    <div className="text-left flex-1">
                      <div className={`font-bold text-base transition-all duration-300 ${
                        isActive ? 'text-primary-foreground' : 'text-sidebar-foreground group-hover:text-sidebar-foreground'
                      }`}>
                        {item.label}
                      </div>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
