import React, { useState, useEffect } from "react";
import { Bell, AlertTriangle, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DirectNameFix } from "@/components/eudamed/DirectNameFix";
import { useCompanyRole } from "@/context/CompanyRoleContext";
import { useNotifications } from "@/hooks/useNotifications";
import { useCompanyId } from "@/hooks/useCompanyId";
import { formatDistanceToNow } from "date-fns";

export function NotificationBell() {
  const [showUrgentModal, setShowUrgentModal] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { companyRoles } = useCompanyRole();
  const companyId = useCompanyId();
  
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(companyId);
  
  const hasNoxMedical = companyRoles.some(role => role.companyName === 'Nox Medical');
  const noxMedicalCompanyId = companyRoles.find(role => role.companyName === 'Nox Medical')?.companyId || '';

  useEffect(() => {
    // if (isDropdownOpen) {
      console.log('🔄 Dropdown opened, refreshing notifications');
      console.log('🔄 Fetching notifications for company:', companyId);
      console.log('📊 Received notifications:', notifications);
      console.log('🔔 Updated unread count:', unreadCount);
    // }
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'document_assigned':
        return <FileText className="h-4 w-4 text-primary flex-shrink-0" />;
      case 'group_create':
      case 'group_updated':
      case 'group_member_added':
        return <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
    }
  };

  const handleNotificationClick = (notification: any) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
  };

  return (
    <>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="relative h-8 w-8 rounded-full p-0">
            <Bell className="h-4 w-4" />
            {!isDropdownOpen && unreadCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
              >
                {unreadCount}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-96" align="end" forceMount>
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 text-xs text-primary hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    markAllAsRead();
                  }}
                >
                  Mark all read
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              You have {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </p>

            {hasNoxMedical && (
              <>
                <DropdownMenuItem 
                  className="flex-col items-start p-3 cursor-pointer bg-orange-50 dark:bg-orange-950/20"
                  onClick={() => setShowUrgentModal(true)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                    <div className="font-medium text-sm flex-1">URGENT: Product Name Issue Detected</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Now</div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No notifications yet
                </div>
              ) : (
                notifications.map((notification) => (
                  <DropdownMenuItem 
                    key={notification.id} 
                    className={`flex-col items-start p-3 cursor-pointer ${!notification.is_read ? 'bg-primary/5' : ''}`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      {getNotificationIcon(notification.type)}
                      <div className="flex-1">
                        <div className="font-medium text-sm">{notification.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{notification.message}</div>
                      </div>
                      {!notification.is_read && (
                        <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showUrgentModal} onOpenChange={setShowUrgentModal}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-800">
              <AlertTriangle className="h-5 w-5" />
              URGENT: Product Name Issue Detected
            </DialogTitle>
            <DialogDescription className="text-orange-700">
              Products are using trade names instead of EUDAMED device names. This needs immediate correction.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <DirectNameFix 
              companyId={noxMedicalCompanyId}
              companyName="Nox Medical"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}