/**
 * Re-sync seeded SOP draft content from the static `SOP_FULL_CONTENT`
 * library into existing company drafts.
 *
 * Why this exists
 * ----------------
 * The Tier-A / Tier-B seed pipeline (`sopAutoSeedService`) reads the static
 * SOP content **once** at company-creation time and writes the section
 * bodies into `document_studio_templates`. After that, edits to the static
 * source files (e.g. adding the missing `WI`, `DCO`, `ECO` definitions and
 * "Related Work Instructions" lines) never reach existing company drafts.
 *
 * This service performs a one-time, idempotent backfill of just the two
 * sections that the recent patch touched:
 *
 *   - 3.0 References  (id: `references`)
 *   - 4.0 Definitions & Abbreviations  (id: `definitions`)
 *
 * All other sections (Procedure, Responsibilities, Records, Revision
 * History, …) are deliberately left alone so user edits are preserved.
 *
 * Idempotent: skips any draft whose two sections already match the
 * (personalized) source content.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { SOP_FULL_CONTENT, sopContentToSections } from '@/data/sopFullContent';
import { rewriteAllSopTokens } from '@/constants/sopAutoSeedTiers';
import {
  LEGACY_SOP_SECTION_CONTENT,
  staleSectionsBetween,
} from '@/data/sopContent/legacyTemplateBaselines';

const COMPANY_NAME_PLACEHOLDER = /\[Company Name\]/g;
const SECTIONS_TO_RESYNC = new Set(['references', 'definitions']);

/**
 * Map a section's display title (e.g. "6.0 Procedure") to the canonical
 * source id used by SOP_FULL_CONTENT (e.g. "procedure"). When a draft has
 * been re-saved through TipTap, section ids are regenerated as random
 * strings (`section-<ts>-<n>`), so id-based matching alone fails. The
 * leading "N.0 " number is stable across all seeded SOPs.
 */
const SOP_SECTION_NUMBER_TO_ID: Record<string, string> = {
  '1.0': 'purpose',
  '2.0': 'scope',
  '3.0': 'references',
  '4.0': 'definitions',
  '5.0': 'responsibilities',
  '6.0': 'procedure',
  '7.0': 'records',
  '8.0': 'revision-history',
};

/** Resolve the canonical SOP section id for a stored draft section. */
function canonicalSectionId(section: StudioSection): string | null {
  if (section?.id && Object.values(SOP_SECTION_NUMBER_TO_ID).includes(section.id)) {
    return section.id;
  }
  const t = (section?.title ?? '').trim();
  const m = t.match(/^(\d+\.0)\b/);
  if (m && SOP_SECTION_NUMBER_TO_ID[m[1]]) return SOP_SECTION_NUMBER_TO_ID[m[1]];
  return null;
}

/**
 * Strip HTML and normalise whitespace / bullet glyphs so plain-text
 * baselines can be compared against TipTap-rendered HTML stored in the
 * draft. We compare on a tolerant text signature, not byte-equality.
 */
function normalizedTextSignature(input: unknown): string {
  if (input == null) return '';
  let text: string;
  if (typeof input === 'string') {
    text = input;
  } else if (Array.isArray(input)) {
    text = input
      .map((b: any) => (typeof b?.content === 'string' ? b.content : ''))
      .join('\n');
  } else {
    text = '';
  }
  return text
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    // Treat list bullets the same way the drawer stale-detector does so
    // HTML <li> content and legacy plain-text bullets compare equal.
    .replace(/^[\t ]*[•·\-]\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export interface ResyncResult {
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface StaleResyncResult extends ResyncResult {
  conflicts: Array<{ draftId: string; draftName: string; sectionId: string }>;
}

interface StudioBlock {
  id?: string;
  type?: 'paragraph' | 'heading';
  content?: unknown;
  isAIGenerated?: boolean;
  metadata?: Record<string, unknown>;
}

interface StudioSection {
  id: string;
  title?: string;
  order?: number;
  content: StudioBlock[];
}

function personalizeBlockText(text: string, companyName: string): string {
  return rewriteAllSopTokens(text.replace(COMPANY_NAME_PLACEHOLDER, companyName));
}

function blocksTextSignature(blocks: StudioBlock[] | undefined): string {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((b) => `${b.type ?? 'paragraph'}::${typeof b.content === 'string' ? b.content : JSON.stringify(b.content)}`)
    .join('\n');
}

/**
 * Re-sync the References + Definitions sections on every existing seeded
 * SOP draft for the given company. Safe to call repeatedly.
 */
export async function resyncSeededSopContent(
  companyId: string,
  companyName: string,
): Promise<ResyncResult> {
  const result: ResyncResult = { updated: 0, skipped: 0, failed: 0, errors: [] };
  if (!companyId || !companyName) return result;

  // 1. Pull every Studio draft for this company that looks like a seeded SOP.
  const { data: drafts, error } = await supabase
    .from('document_studio_templates')
    .select('id, name, sections, metadata')
    .eq('company_id', companyId)
    .eq('type', 'SOP');

  if (error) {
    result.errors.push(`Failed to load SOP drafts: ${error.message}`);
    return result;
  }
  if (!drafts || drafts.length === 0) return result;

  for (const draft of drafts) {
    try {
      // Resolve the canonical SOP key from the draft metadata or name.
      const meta = (draft.metadata ?? {}) as { sopNumber?: string; document_number?: string };
      const docNum = (meta.sopNumber ?? meta.document_number ?? '').toUpperCase();
      // Source library is keyed as "SOP-001", strip any sub-prefix.
      const numMatch = docNum.match(/SOP-(?:[A-Z]+-)?(\d{3})/) ?? draft.name?.match(/SOP-(?:[A-Z]+-)?(\d{3})/);
      if (!numMatch) {
        result.skipped++;
        continue;
      }
      const sourceKey = `SOP-${numMatch[1]}`;
      const source = SOP_FULL_CONTENT[sourceKey];
      if (!source) {
        result.skipped++;
        continue;
      }

      const sourceSections = sopContentToSections(source);
      const sourceById = new Map(sourceSections.map((s) => [s.id, s]));

      const existingSections = (draft.sections as unknown as StudioSection[]) ?? [];
      if (!Array.isArray(existingSections) || existingSections.length === 0) {
        result.skipped++;
        continue;
      }

      let mutated = false;
      const next = existingSections.map((section) => {
        if (!SECTIONS_TO_RESYNC.has(section.id)) return section;
        const fresh = sourceById.get(section.id);
        if (!fresh) return section;
        // Personalize each block's text using the same pipeline as the seeder.
        const personalizedBlocks: StudioBlock[] = fresh.content.map((b) => ({
          ...b,
          content:
            typeof b.content === 'string' ? personalizeBlockText(b.content, companyName) : b.content,
        }));
        const beforeSig = blocksTextSignature(section.content);
        const afterSig = blocksTextSignature(personalizedBlocks);
        if (beforeSig === afterSig) return section;
        mutated = true;
        return { ...section, content: personalizedBlocks };
      });

      if (!mutated) {
        result.skipped++;
        continue;
      }

      const { error: upErr } = await supabase
        .from('document_studio_templates')
        .update({ sections: next as unknown as Json })
        .eq('id', draft.id);
      if (upErr) {
        result.failed++;
        result.errors.push(`${draft.name}: ${upErr.message}`);
        continue;
      }
      result.updated++;
    } catch (err) {
      result.failed++;
      result.errors.push(`${draft.name}: ${(err as Error).message}`);
    }
  }

  return result;
}

/**
 * Re-seed SOP draft sections whose static template content has been
 * updated since the draft was first created (templateVersion bump).
 *
 * Safe mode (default): only overwrite a section when its current content
 * matches the un-edited baseline of the previous template version. If the
 * user has edited the section it is reported as a conflict and skipped.
 *
 * Force mode: overwrite regardless. The previous content is preserved on
 * the draft's `metadata.reseedHistory[]` for audit / undo.
 */
export async function resyncStaleSopSections(
  companyId: string,
  companyName: string,
  opts: {
    mode?: 'safe' | 'force';
    sopKeys?: string[];
    /**
     * Restrict resync to specific studio template ids and pre-supply the
     * SOP key so we don't depend on `metadata.document_number` or the
     * draft name (which may not contain `SOP-NNN`).
     */
    draftScope?: Array<{ draftId: string; sopKey: string }>;
  } = {},
): Promise<StaleResyncResult> {
  const mode = opts.mode ?? 'safe';
  const result: StaleResyncResult = {
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    conflicts: [],
  };
  if (!companyId || !companyName) return result;

  // `draftScope.draftId` is the studio `template_id` (NOT the row PK), which
  // matches how the drawer addresses drafts everywhere else.
  const sopKeyByTemplateId = new Map<string, string>();
  for (const s of opts.draftScope ?? []) sopKeyByTemplateId.set(s.draftId, s.sopKey);

  let query = supabase
    .from('document_studio_templates')
    .select('id, template_id, name, sections, metadata')
    .eq('company_id', companyId);
  if (opts.draftScope && opts.draftScope.length > 0) {
    query = query.in('template_id', opts.draftScope.map((s) => s.draftId));
  } else {
    query = query.eq('type', 'SOP');
  }
  const { data: drafts, error } = await query;

  if (error) {
    result.errors.push(`Failed to load SOP drafts: ${error.message}`);
    return result;
  }
  if (!drafts || drafts.length === 0) return result;

  for (const draft of drafts) {
    try {
      const meta = (draft.metadata ?? {}) as {
        sopNumber?: string;
        document_number?: string;
        sourceTemplateVersion?: number;
        reseedHistory?: Array<{ at: string; sectionId: string; previous: unknown }>;
      };
      const scopedKey = sopKeyByTemplateId.get((draft as any).template_id);
      let sourceKey = scopedKey ?? '';
      if (!sourceKey) {
        const docNum = (meta.sopNumber ?? meta.document_number ?? '').toUpperCase();
        const numMatch =
          docNum.match(/SOP-(?:[A-Z]+-)?(\d{3})/) ??
          draft.name?.match(/SOP-(?:[A-Z]+-)?(\d{3})/);
        if (!numMatch) {
          result.skipped++;
          continue;
        }
        sourceKey = `SOP-${numMatch[1]}`;
      }
      if (opts.sopKeys && !opts.sopKeys.includes(sourceKey)) {
        result.skipped++;
        continue;
      }
      const source = SOP_FULL_CONTENT[sourceKey];
      if (!source) {
        result.skipped++;
        continue;
      }
      const targetVersion = source.templateVersion ?? 1;
      let currentVersion = meta.sourceTemplateVersion ?? 1;
      const existingForRecovery = (draft.sections as unknown as StudioSection[]) ?? [];
      // Build a canonical-id index over the (possibly-randomised) section ids.
      const sectionByCanonical = new Map<string, StudioSection>();
      for (const s of existingForRecovery) {
        const cid = canonicalSectionId(s);
        if (cid && !sectionByCanonical.has(cid)) sectionByCanonical.set(cid, s);
      }
      if (currentVersion >= targetVersion) {
        // Recovery path: a previous bug stamped sourceTemplateVersion
        // forward without actually replacing section content. If any
        // section recorded as changed at v(target) still matches its
        // v(target-1) baseline (text-signature), rewind so replacement runs.
        const candidateIds = staleSectionsBetween(sourceKey, targetVersion - 1, targetVersion);
        const baselines = LEGACY_SOP_SECTION_CONTENT[sourceKey] ?? {};
        let matchesBaseline = false;
        for (const id of candidateIds) {
          const baseline = baselines[id]?.[targetVersion - 1];
          if (typeof baseline !== 'string') continue;
          const section = sectionByCanonical.get(id);
          if (!section) continue;
          const baselineSig = normalizedTextSignature(
            personalizeBlockText(baseline, companyName),
          );
          const currentSig = normalizedTextSignature(section.content);
          if (baselineSig && currentSig && baselineSig === currentSig) {
            matchesBaseline = true;
            break;
          }
        }
        if (!matchesBaseline) {
          result.skipped++;
          continue;
        }
        currentVersion = targetVersion - 1;
      }

      const changedIds = staleSectionsBetween(sourceKey, currentVersion, targetVersion);
      if (changedIds.length === 0) {
        // Nothing to replace — just stamp the version forward.
        await supabase
          .from('document_studio_templates')
          .update({
            metadata: {
              ...meta,
              sourceTemplateVersion: targetVersion,
            } as unknown as Json,
          })
          .eq('id', draft.id);
        result.skipped++;
        continue;
      }

      const sourceSections = sopContentToSections(source);
      const sourceById = new Map(sourceSections.map((s) => [s.id, s]));
      const existingSections = (draft.sections as unknown as StudioSection[]) ?? [];
      if (!Array.isArray(existingSections) || existingSections.length === 0) {
        result.skipped++;
        continue;
      }

      let mutated = false;
      const reseedHistory = Array.isArray(meta.reseedHistory) ? [...meta.reseedHistory] : [];
      const next = existingSections.map((section) => {
        const cid = canonicalSectionId(section);
        if (!cid || !changedIds.includes(cid)) return section;
        const fresh = sourceById.get(cid);
        if (!fresh) return section;

        // Personalise the new template content the same way the seeder does.
        const personalizedFreshBlocks: StudioBlock[] = fresh.content.map((b) => ({
          ...b,
          content:
            typeof b.content === 'string'
              ? personalizeBlockText(b.content, companyName)
              : b.content,
        }));

        // Safe mode — only replace if the current section is byte-identical
        // to the personalised previous-version baseline. Otherwise the user
        // has edited it and we surface a conflict.
        if (mode === 'safe') {
          const baseline = LEGACY_SOP_SECTION_CONTENT[sourceKey]?.[cid]?.[currentVersion];
          if (typeof baseline !== 'string') {
            // No baseline recorded — cannot safely diff, treat as conflict.
            result.conflicts.push({
              draftId: draft.id,
              draftName: draft.name,
              sectionId: section.id,
            });
            return section;
          }
          const baselineSig = normalizedTextSignature(
            personalizeBlockText(baseline, companyName),
          );
          const currentSig = normalizedTextSignature(section.content);
          if (currentSig !== baselineSig) {
            result.conflicts.push({
              draftId: draft.id,
              draftName: draft.name,
              sectionId: section.id,
            });
            return section;
          }
        } else {
          // Force mode — archive the current content for undo.
          reseedHistory.push({
            at: new Date().toISOString(),
            sectionId: section.id,
            previous: section.content,
          });
        }

        mutated = true;
        // Preserve the existing section's id/title/order so the editor's
        // collaboration key stays stable; only swap in the fresh blocks.
        return { ...section, content: personalizedFreshBlocks };
      });

      // Only stamp the version forward when we actually applied the
      // template changes (or in force mode, where the user explicitly
      // overrode local edits). In safe mode with unresolved conflicts we
      // must NOT advance `sourceTemplateVersion`, otherwise the draft
      // looks "up to date" on next load and the Update-from-template CTA
      // disappears even though the old content is still in place.
      const stampForward = mutated;

      if (!mutated) {
        // Nothing applied — leave version untouched so the CTA stays
        // visible. Conflicts (if any) are already in result.conflicts.
        result.skipped++;
        continue;
      }

      const updatePayload: { sections?: Json; metadata?: Json } = {};
      if (mutated) updatePayload.sections = next as unknown as Json;
      if (stampForward) {
        updatePayload.metadata = {
          ...meta,
          sourceTemplateVersion: targetVersion,
          reseedHistory,
        } as unknown as Json;
      }

      const { error: upErr } = await supabase
        .from('document_studio_templates')
        .update(updatePayload)
        .eq('id', draft.id);
      if (upErr) {
        result.failed++;
        result.errors.push(`${draft.name}: ${upErr.message}`);
        continue;
      }
      if (mutated) result.updated++;
      else result.skipped++;
    } catch (err) {
      result.failed++;
      result.errors.push(`${draft.name}: ${(err as Error).message}`);
    }
  }

  return result;
}

/**
 * Backfill the "5. Reference" section on existing seeded WI drafts so the
 * parent SOP number (e.g. `SOP-DE-005`) appears in the text. The LiveEditor's
 * reference annotator then renders it as a clickable chip that opens the
 * parent SOP draft.
 *
 * Idempotent: skips any WI whose Reference paragraph already contains the
 * parent SOP number.
 */
export async function resyncWiReferences(companyId: string): Promise<ResyncResult> {
  const result: ResyncResult = { updated: 0, skipped: 0, failed: 0, errors: [] };
  if (!companyId) return result;

  // Pull every Studio draft for the company that looks like a WI.
  const { data: drafts, error } = await supabase
    .from('document_studio_templates')
    .select('id, name, sections, metadata')
    .eq('company_id', companyId)
    .eq('type', 'WI');

  if (error) {
    result.errors.push(`Failed to load WI drafts: ${error.message}`);
    return result;
  }
  if (!drafts || drafts.length === 0) return result;

  // Build a docnum -> title lookup for the company's SOPs so we can render
  // "SOP-DE-005 Design and Development Planning" in the Reference paragraph.
  const { data: sopRows } = await supabase
    .from('documents')
    .select('document_number, title')
    .eq('company_id', companyId);
  const sopTitleByNumber = new Map<string, string>();
  for (const row of sopRows ?? []) {
    const num = (row as { document_number?: string }).document_number;
    const title = (row as { title?: string }).title;
    if (num && title) sopTitleByNumber.set(num.toUpperCase(), title);
  }

  for (const draft of drafts) {
    try {
      const meta = (draft.metadata ?? {}) as { document_number?: string };
      const docNum = (meta.document_number ?? '').toUpperCase();
      const wiMatch = docNum.match(/^WI-([A-Z]{2,4})-(\d{3})-\d+$/);
      if (!wiMatch) {
        result.skipped++;
        continue;
      }
      const parentSopNumber = `SOP-${wiMatch[1]}-${wiMatch[2]}`;
      const parentSopTitle = sopTitleByNumber.get(parentSopNumber) ?? '';

      const existingSections = (draft.sections as unknown as StudioSection[]) ?? [];
      if (!Array.isArray(existingSections) || existingSections.length === 0) {
        result.skipped++;
        continue;
      }

      let mutated = false;
      const next = existingSections.map((section) => {
        if (section.id !== 'reference') return section;
        const blocks = Array.isArray(section.content) ? section.content : [];
        const newBlocks = blocks.map((b) => {
          if (typeof b.content !== 'string') return b;
          const html = b.content;
          // Already linkified — skip.
          if (html.includes(parentSopNumber)) return b;
          // Only rewrite the seed paragraph; leave bespoke content alone.
          const seedRe = /<p>Derived from foundational SOP:\s*([^<.]+)\.<\/p>/i;
          const match = html.match(seedRe);
          if (!match) return b;
          const titleFromHtml = match[1].trim();
          const useTitle = parentSopTitle || titleFromHtml;
          mutated = true;
          return {
            ...b,
            content: `<p>Derived from foundational SOP: ${parentSopNumber} ${useTitle}.</p>`,
          };
        });
        if (!mutated) return section;
        return { ...section, content: newBlocks };
      });

      if (!mutated) {
        result.skipped++;
        continue;
      }

      const { error: upErr } = await supabase
        .from('document_studio_templates')
        .update({ sections: next as unknown as Json })
        .eq('id', draft.id);
      if (upErr) {
        result.failed++;
        result.errors.push(`${draft.name}: ${upErr.message}`);
        continue;
      }
      result.updated++;
    } catch (err) {
      result.failed++;
      result.errors.push(`${draft.name}: ${(err as Error).message}`);
    }
  }

  return result;
}