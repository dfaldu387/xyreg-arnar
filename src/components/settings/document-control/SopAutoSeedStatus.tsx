import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, ListTree, Circle, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  countTierASopsPresent,
  countTierBSopsPresent,
  seedTierASopsForCompany,
  seedAllTierBSopsForCompany,
} from '@/services/sopAutoSeedService';
import { TIER_A_AUTO_SEED, TIER_B_CONDITIONAL } from '@/constants/sopAutoSeedTiers';
import { SopBreakdownDialog } from './SopBreakdownDialog';

type Variant = 'complete' | 'partial' | 'empty';

function variantFor(count: number, total: number): Variant {
  if (total === 0 || count >= total) return 'complete';
  if (count === 0) return 'empty';
  return 'partial';
}

const VARIANT_STYLES: Record<Variant, { row: string; dot: string; badge: string }> = {
  complete: {
    row: 'border-l-4 border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20',
    dot: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900',
  },
  partial: {
    row: 'border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20',
    dot: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900',
  },
  empty: {
    row: 'border-l-4 border-l-muted-foreground/40 bg-muted/30',
    dot: 'text-muted-foreground',
    badge: 'bg-muted text-muted-foreground border-border',
  },
};

interface SopAutoSeedStatusProps {
  companyId: string;
  companyName?: string;
  /** Called after a successful seed to let parents refresh their lists. */
  onSeeded?: () => void;
  /**
   * `inline` (default) renders the full two-row card.
   * `compact` renders a single button row that opens the full card in a popover.
   */
  variant?: 'inline' | 'compact';
}

/**
 * Compact status strip shown in DocumentControl that:
 *  - Reports how many Tier A SOPs are already present.
 *  - Offers a one-click re-seed for any missing Tier A SOPs.
 *  - Offers a "Seed Tier B" button (all conditional SOPs at once).
 *
 * Lives at the top of Document Control because foundation SOPs are the
 * primary thing a new admin sees there.
 */
export function SopAutoSeedStatus({ companyId, companyName, onSeeded, variant = 'inline' }: SopAutoSeedStatusProps) {
  const [countA, setCountA] = useState<number | null>(null);
  const [countB, setCountB] = useState<number | null>(null);
  const [isSeedingA, setIsSeedingA] = useState(false);
  const [isSeedingB, setIsSeedingB] = useState(false);
  const [dialog, setDialog] = useState<'A' | 'B' | null>(null);

  const totalA = TIER_A_AUTO_SEED.length;
  const totalB = TIER_B_CONDITIONAL.length;

  const refresh = async () => {
    if (!companyId) return;
    const [a, b] = await Promise.all([
      countTierASopsPresent(companyId),
      countTierBSopsPresent(companyId),
    ]);
    setCountA(a);
    setCountB(b);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleSeedA = async () => {
    if (!companyId || !companyName) return;
    setIsSeedingA(true);
    try {
      const r = await seedTierASopsForCompany(companyId, companyName);
      if (r.inserted > 0) {
        toast.success(`Seeded ${r.inserted} foundation SOP${r.inserted === 1 ? '' : 's'}`);
      } else if (r.skipped === totalA) {
        toast.info('All foundation SOPs already present');
      }
      if (r.failed > 0) {
        toast.error(`${r.failed} SOP${r.failed === 1 ? '' : 's'} failed to seed`);
      }
      await refresh();
      onSeeded?.();
    } catch (err) {
      toast.error('Failed to seed foundation SOPs');
      console.error(err);
    } finally {
      setIsSeedingA(false);
    }
  };

  const handleSeedB = async () => {
    if (!companyId || !companyName) return;
    setIsSeedingB(true);
    try {
      const r = await seedAllTierBSopsForCompany(companyId, companyName);
      if (r.inserted > 0) {
        toast.success(`Seeded ${r.inserted} pathway-conditional SOP${r.inserted === 1 ? '' : 's'}`);
      } else {
        toast.info('All pathway-conditional SOPs already present');
      }
      if (r.failed > 0) {
        toast.error(`${r.failed} failed to seed`);
      }
      await refresh();
      onSeeded?.();
    } catch (err) {
      toast.error('Failed to seed pathway SOPs');
      console.error(err);
    } finally {
      setIsSeedingB(false);
    }
  };

  const variantA = variantFor(countA ?? 0, totalA);
  const variantB = variantFor(countB ?? 0, totalB);
  const missingA = Math.max(0, totalA - (countA ?? 0));
  const missingB = Math.max(0, totalB - (countB ?? 0));

  // Worst-of variant for the compact trigger badge (empty > partial > complete).
  const overallVariant: Variant =
    variantA === 'empty' || variantB === 'empty'
      ? 'empty'
      : variantA === 'partial' || variantB === 'partial'
        ? 'partial'
        : 'complete';

  const renderRow = (args: {
    variant: Variant;
    title: string;
    subtitle: string;
    count: number | null;
    total: number;
    onView: () => void;
    action: React.ReactNode;
  }) => {
    const styles = VARIANT_STYLES[args.variant];
    return (
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5',
          styles.row,
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {args.variant === 'complete' ? (
            <CheckCircle2 className={cn('h-5 w-5 shrink-0', styles.dot)} aria-hidden="true" />
          ) : (
            <Circle className={cn('h-5 w-5 shrink-0 fill-current', styles.dot)} aria-hidden="true" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">{args.title}</span>
              <Badge variant="outline" className={cn('text-xs font-mono', styles.badge)}>
                {args.count ?? '…'} / {args.total}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{args.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={args.onView}
            className="text-xs h-8"
          >
            <ListTree className="h-3.5 w-3.5 mr-1.5" />
            View breakdown
          </Button>
          {args.action}
        </div>
      </div>
    );
  };

  const body = (
    <div className="space-y-2">
      {renderRow({
        variant: variantA,
        title: 'Foundation SOPs',
        subtitle: 'Auto-created at onboarding · ISO 13485 / 21 CFR 820 baseline',
        count: countA,
        total: totalA,
        onView: () => setDialog('A'),
        action:
          missingA > 0 ? (
            <Button
              size="sm"
              variant="default"
              onClick={handleSeedA}
              disabled={isSeedingA || !companyName}
              className="h-8"
            >
              {isSeedingA ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  Seeding…
                </>
              ) : (
                `Seed ${missingA} missing`
              )}
            </Button>
          ) : null,
      })}

      {renderRow({
        variant: variantB,
        title: 'Pathway-conditional SOPs',
        subtitle: 'Triggered by scope: EU MDR · Manufacturing · Clinical · Class IIa+',
        count: countB,
        total: totalB,
        onView: () => setDialog('B'),
        action:
          missingB > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSeedB}
              disabled={isSeedingB || !companyName}
              className="h-8"
            >
              {isSeedingB ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  Seeding…
                </>
              ) : (
                `Seed ${missingB} missing`
              )}
            </Button>
          ) : null,
      })}

      <SopBreakdownDialog
        open={dialog === 'A'}
        onOpenChange={(o) => setDialog(o ? 'A' : null)}
        title={`Foundation SOPs (${totalA})`}
        intro="Pure ISO 13485 / 21 CFR 820 framework documents. Identical across companies (only [Company Name] is substituted), which is why they are auto-created at onboarding."
        entries={TIER_A_AUTO_SEED}
      />
      <SopBreakdownDialog
        open={dialog === 'B'}
        onOpenChange={(o) => setDialog(o ? 'B' : null)}
        title={`Pathway-conditional SOPs (${totalB})`}
        intro="Only seeded when the matching pathway or scope applies (EU MDR, manufacturing, clinical pathway, etc.). The trigger label on each card tells you what unlocks it."
        entries={TIER_B_CONDITIONAL}
      />
    </div>
  );

  if (variant === 'inline') {
    return <div className="rounded-md border border-border bg-card p-3">{body}</div>;
  }

  // Compact: single-line trigger that opens the full body in a popover.
  const triggerStyles = VARIANT_STYLES[overallVariant];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-3 rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted/50 w-full',
            triggerStyles.row,
          )}
        >
          {overallVariant === 'complete' ? (
            <CheckCircle2 className={cn('h-4 w-4 shrink-0', triggerStyles.dot)} aria-hidden="true" />
          ) : (
            <Circle className={cn('h-4 w-4 shrink-0 fill-current', triggerStyles.dot)} aria-hidden="true" />
          )}
          <span className="text-sm font-medium text-foreground">Seed status</span>
          <Badge variant="outline" className={cn('text-xs font-mono', VARIANT_STYLES[variantA].badge)}>
            Foundation {countA ?? '…'}/{totalA}
          </Badge>
          <Badge variant="outline" className={cn('text-xs font-mono', VARIANT_STYLES[variantB].badge)}>
            Pathway {countB ?? '…'}/{totalB}
          </Badge>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            Manage seeding
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[640px] max-w-[90vw] p-3">
        {body}
      </PopoverContent>
    </Popover>
  );
}
