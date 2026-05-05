import React from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { GENESIS_SECTIONS } from '@/config/genesisSections';
import { BlueprintSectionGroup } from './BlueprintSectionGroup';
import { BlueprintStepRow } from './BlueprintStepRow';

interface BlueprintLaunchViewProps {
  /** completionKey -> isComplete */
  completion: Record<string, boolean>;
  disabled?: boolean;
  headerActions?: React.ReactNode;
  /** Notify parent when a row is selected — parent opens the side drawer. */
  onSelectStep?: (stepId: string | null) => void;
}

/**
 * Mirror of GapAnnexIILaunchView for Venture Blueprint:
 * indigo info banner → overall progress → numbered section groups → step rows.
 * When `selectedStepId` is set, the detail panel is rendered in-place
 * instead of the section list — never navigating out of the module.
 */
export function BlueprintLaunchView({
  completion,
  disabled = false,
  headerActions,
  onSelectStep,
}: BlueprintLaunchViewProps) {
  const totalSteps = GENESIS_SECTIONS.reduce(
    (sum, s) => sum + s.subSteps.length,
    0,
  );
  const completedCount = GENESIS_SECTIONS.reduce(
    (sum, s) =>
      sum + s.subSteps.filter((sub) => Boolean(completion[sub.completionKey])).length,
    0,
  );
  const progress =
    totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const nextIncomplete = GENESIS_SECTIONS.flatMap((s) => s.subSteps).find(
    (sub) => !completion[sub.completionKey],
  );

  return (
    <div>
      {/* Overall Progress */}
      <div className="mb-6 p-4 rounded-lg border bg-card">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Overall Progress
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {completedCount}/{totalSteps} steps complete
              {nextIncomplete && progress < 100 &&
                ` · Next: ${nextIncomplete.title}`}
              {progress >= 100 && ' · All steps addressed'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {headerActions}
            <div
              className={cn(
                'text-2xl font-bold tabular-nums',
                progress >= 100
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : progress >= 50
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-amber-600 dark:text-amber-400',
              )}
            >
              {progress}%
            </div>
          </div>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Section Groups */}
      <div className="space-y-6">
        {GENESIS_SECTIONS.map((section, sectionIdx) => {
          const groupTotal = section.subSteps.length;
          const groupCompleted = section.subSteps.filter((sub) =>
            Boolean(completion[sub.completionKey]),
          ).length;

          return (
            <BlueprintSectionGroup
              key={section.id}
              groupNumber={sectionIdx + 1}
              groupName={section.title}
              tagline={section.tagline}
              completedCount={groupCompleted}
              totalCount={groupTotal}
            >
              {section.subSteps.map((sub, subIdx) => (
                <BlueprintStepRow
                  key={sub.id}
                  badge={`${sectionIdx + 1}.${subIdx + 1}`}
                  title={sub.title}
                  subtitle={sub.requirement}
                  isComplete={Boolean(completion[sub.completionKey])}
                  onSelect={() => onSelectStep?.(sub.id)}
                  disabled={disabled}
                />
              ))}
            </BlueprintSectionGroup>
          );
        })}
      </div>
    </div>
  );
}