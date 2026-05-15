import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { AuditLogTable } from '@/components/audit-log/AuditLogTable';
import { AuditLogFilters } from '@/components/audit-log/AuditLogFilters';
import { useCompanyRole } from '@/context/CompanyRoleContext';
import { useProductDocumentAuditTrail } from '@/hooks/useProductDocumentAuditTrail';
import { AuditTrailService } from '@/services/auditTrailService';
import { FileText } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AuditTrailFilters as AuditTrailFiltersType } from '@/types/auditTrail';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function ProductAuditLogPage() {
  const { productId } = useParams<{ productId: string }>();
  const { activeCompanyId } = useCompanyRole();

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('All');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Don't pass selectedUser as userId — the dropdown uses userName (display name),
  // not UUID. User filtering is applied client-side below.
  const filters: AuditTrailFiltersType = useMemo(() => ({
    category: 'document_record',
    startDate,
    endDate,
    searchTerm: searchTerm || undefined,
  }), [startDate, endDate, searchTerm]);

  const { entries: rawEntries, isLoading, error } = useProductDocumentAuditTrail({
    productId: productId || '',
    companyId: activeCompanyId || '',
    filters,
    limit: 200,
  });

  // Client-side user filter by userName
  const entries = useMemo(() => {
    if (selectedUser === 'All') return rawEntries;
    return rawEntries.filter(e => e.userName === selectedUser);
  }, [rawEntries, selectedUser]);

  // Pagination state
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));

  // Reset to page 1 whenever the filtered result set or page size changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedUser, startDate, endDate, pageSize]);

  // Clamp current page if it falls past the new total.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return entries.slice(start, start + pageSize);
  }, [entries, currentPage, pageSize]);

  const handleExportCSV = () => {
    const csvContent = AuditTrailService.exportCSV(entries);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `device-audit-trail-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!productId || !activeCompanyId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-muted-foreground">Missing product or company information.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-2 pt-4">
      <PageHeader
        heading="Audit Trail"
        text="21 CFR Part 11 compliant audit trail — Who, What, When, Why"
      />

      <div className="space-y-6">

        {/* Filters section */}
        <AuditLogFilters
          entries={rawEntries}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          selectedUser={selectedUser}
          onUserChange={setSelectedUser}
          startDate={startDate}
          onStartDateChange={setStartDate}
          endDate={endDate}
          onEndDateChange={setEndDate}
          onExportCSV={handleExportCSV}
        />

        {/* Audit trail table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Activity Log</h3>
            <div className="text-sm text-muted-foreground">
              {entries.length === 0
                ? 'Showing 0 entries'
                : `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, entries.length)} of ${entries.length} entries`}
            </div>
          </div>
          <AuditLogTable
            entries={paginatedEntries}
            isLoading={isLoading}
          />
          {error && (
            <div className="text-sm text-red-500 mt-2">
              Error loading audit trail: {error}
            </div>
          )}

          {/* Pagination controls */}
          {entries.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Rows per page</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="w-20 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map(n => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
