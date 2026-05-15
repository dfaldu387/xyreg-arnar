import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

/**
 * Display helper for IP address cells in audit-trail UIs.
 *
 * Renders one of three modes based on provenance:
 * - captured: IP recorded live by the server trigger.
 * - inferred_from_login: back-filled from the user's most recent sign-in
 *   within 24 h. Marked with an info icon + tooltip so it's never confused
 *   with a captured value.
 * - unknown: no IP available. Shown as muted "Not recorded".
 */
export function FormatAuditIp({
  ip,
  source,
}: {
  ip?: string | null;
  source?: 'captured' | 'inferred_from_login' | null;
}) {
  const hasIp = !!ip && ip !== 'unknown' && ip !== 'Unknown';
  if (hasIp && source === 'inferred_from_login') {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 cursor-help">
              <span className="font-mono text-muted-foreground">{ip}</span>
              <Info className="h-3 w-3 text-muted-foreground/70" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            Inferred from this user's most recent sign-in within 24&nbsp;h.
            The original request IP was not captured at the time this entry
            was written.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (hasIp) {
    return <span className="font-mono">{ip}</span>;
  }
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="italic text-muted-foreground/70 cursor-help">
            Not recorded
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          IP capture was enabled on this audit trigger after this entry was
          written, and no nearby sign-in was found to infer it from.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
