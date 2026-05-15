
import React, { useState, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { AuditLogTable } from "@/components/audit-log/AuditLogTable";
import { AuditLogFilters } from "@/components/audit-log/AuditLogFilters";
import { AuditTrailCategoryTabs } from "@/components/audit-log/AuditTrailCategoryTabs";
import { useAuditTrail } from "@/hooks/useAuditTrail";
import { useAuth } from "@/context/AuthContext";
import { useCompanyRole } from "@/context/CompanyRoleContext";
import { usePlanMenuAccess } from '@/hooks/usePlanMenuAccess';
import { PORTFOLIO_MENU_ACCESS } from '@/constants/menuAccessKeys';
import { RestrictedFeatureProvider } from '@/contexts/RestrictedFeatureContext';
import { RestrictedPreviewBanner } from '@/components/subscription/RestrictedPreviewBanner';
import { useTranslation } from '@/hooks/useTranslation';
import { AuditTrailService } from '@/services/auditTrailService';
import { Shield } from 'lucide-react';
import type { AuditTrailFilters as AuditTrailFiltersType } from '@/types/auditTrail';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import {
  Select as PageSizeSelect,
  SelectContent as PageSizeSelectContent,
  SelectItem as PageSizeSelectItem,
  SelectTrigger as PageSizeSelectTrigger,
  SelectValue as PageSizeSelectValue,
} from '@/components/ui/select';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
// AL-25: fetch a large window so the displayed count reflects new actions
// (default 200 was masking AL-25 once the table reached the cap).
const AUDIT_FETCH_LIMIT = 2000;

export default function AuditLogPage() {
  const { lang } = useTranslation();
  const { activeCompanyId, activeRole } = useCompanyRole();

  // Restriction check - double security pattern
  const { isMenuAccessKeyEnabled, planName } = usePlanMenuAccess();
  const isFeatureEnabled = isMenuAccessKeyEnabled(PORTFOLIO_MENU_ACCESS.AUDIT_LOG);
  const isRestricted = !isFeatureEnabled;

  // Category tab state
  const [activeCategory, setActiveCategory] = useState<string>('All');

  // Filter state management
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('All');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const normalizedStart = useMemo(() => {
    if (!startDate) return undefined;
    const d = new Date(startDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [startDate]);
  const normalizedEnd = useMemo(() => {
    if (!endDate) return undefined;
    const d = new Date(endDate);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [endDate]);

  const filters: AuditTrailFiltersType = useMemo(() => ({
    category: activeCategory !== 'All' ? activeCategory as AuditTrailFiltersType['category'] : undefined,
    userId: selectedUser !== 'All' ? selectedUser : undefined,
    startDate: normalizedStart,
    endDate: normalizedEnd,
    searchTerm: searchTerm || undefined,
  }), [activeCategory, selectedUser, normalizedStart, normalizedEnd, searchTerm]);

  // Fetch unified audit trail. The fetched window is paginated below so the
  // table only renders one page (default 25) at a time.
  const { entries, isLoading, error } = useAuditTrail({ filters, limit: AUDIT_FETCH_LIMIT });

  // Pagination state (mirrors ProductAuditLogPage for visual consistency).
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));

  // Reset to page 1 whenever the filtered result set or page size changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, searchTerm, selectedUser, normalizedStart, normalizedEnd, pageSize]);

  // Clamp current page if it falls past the new total.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return entries.slice(start, start + pageSize);
  }, [entries, currentPage, pageSize]);

  // Handle CSV export
  const handleExportCSV = () => {
    const csvContent = AuditTrailService.exportCSV(entries);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `audit-trail-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Viewer role gets no access
  if (activeRole === 'viewer') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-semibold">{lang('auditLog.accessRestricted')}</h2>
          <p className="text-muted-foreground">{lang('auditLog.noPermission')}</p>
        </div>
      </div>
    );
  }

  return (
    <RestrictedFeatureProvider
      isRestricted={isRestricted}
      planName={planName}
      featureName={lang('auditLog.featureName')}
    >
      <div className="flex-1 space-y-4 p-2 pt-4">
        <PageHeader
          heading={lang('auditLog.pageHeading')}
          text={lang('auditLog.pageSubtitle')}
        />

        {isRestricted && <RestrictedPreviewBanner />}

        <div className="space-y-6">
          {/* Category tabs */}
          <AuditTrailCategoryTabs
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />

          {/* Filters section */}
          <AuditLogFilters
            entries={entries}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            selectedUser={selectedUser}
            onUserChange={setSelectedUser}
            startDate={startDate}
            onStartDateChange={setStartDate}
            endDate={endDate}
            onEndDateChange={setEndDate}
            onExportCSV={handleExportCSV}
            disabled={isRestricted}
          />

          {/* Audit trail table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">{lang('auditLog.activityLog')}</h3>
              <div className="text-sm text-muted-foreground">
                {entries.length === 0
                  ? 'Showing 0 entries'
                  : `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, entries.length)} of ${entries.length} entries`}
                {activeRole === 'editor' && ` ${lang('auditLog.yourActionsOnly')}`}
              </div>
            </div>
            <AuditLogTable
              entries={paginatedEntries}
              isLoading={isLoading}
            />
            {error && (
              <div className="text-sm text-red-500 mt-2">
                {lang('auditLog.errorLoading')} {error}
              </div>
            )}

            {/* Pagination controls — matches the product audit log layout */}
            {entries.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Rows per page</span>
                  <PageSizeSelect value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <PageSizeSelectTrigger className="w-20 h-8">
                      <PageSizeSelectValue />
                    </PageSizeSelectTrigger>
                    <PageSizeSelectContent>
                      {PAGE_SIZE_OPTIONS.map(n => (
                        <PageSizeSelectItem key={n} value={String(n)}>{n}</PageSizeSelectItem>
                      ))}
                    </PageSizeSelectContent>
                  </PageSizeSelect>
                </div>

                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage > 1) setCurrentPage(currentPage - 1);
                        }}
                        aria-disabled={currentPage === 1}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                      />
                    </PaginationItem>

                    {buildPageList(currentPage, totalPages).map((p, idx) =>
                      p === 'ellipsis' ? (
                        <PaginationItem key={`e-${idx}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={p}>
                          <PaginationLink
                            href="#"
                            isActive={p === currentPage}
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage(p);
                            }}
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}

                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                        }}
                        aria-disabled={currentPage === totalPages}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        </div>
      </div>
    </RestrictedFeatureProvider>
  );
}

/**
 * Build a compact page list: 1 … (current-1) current (current+1) … last
 */
function buildPageList(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'ellipsis')[] = [1];
  if (current > 3) pages.push('ellipsis');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('ellipsis');
  pages.push(total);
  return pages;
}
