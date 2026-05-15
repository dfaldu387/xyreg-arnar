/**
 * Snapshots of previous versions of static SOP template content, used by
 * `resyncStaleSopSections` to detect "unedited" drafts that can be safely
 * re-seeded with the latest version.
 *
 * Keyed by SOP number → section id → previous template version → un-
 * personalised content string (matches the `content` field of
 * `SOPSectionContent` at that version).
 *
 * When adding a new entry, copy the EXACT pre-bump string verbatim.
 */
export const LEGACY_SOP_SECTION_CONTENT: Record<
  string,
  Record<string, Record<number, string>>
> = {
  'SOP-001': {
    procedure: {
      1: '6.1 Quality Policy and Objectives\nTop Management defines the Quality Policy within the Xyreg Company Settings module. Quality objectives are established annually and tracked using the Xyreg Dashboard, which provides real-time metrics on document compliance, CAPA status, audit findings, and training completion.\n\n6.2 QMS Documentation Structure\nThe QMS documentation hierarchy is maintained in Xyreg\'s Document Studio:what\n• Level 1: Quality Manual and Quality Policy\n• Level 2: Standard Operating Procedures (SOPs)\n• Level 3: Work Instructions, Forms, and Templates\n• Level 4: Records and Evidence\nAll documents follow the document control process defined in SOP-002, with version control, review cycles, and electronic approvals managed through Xyreg.\n\n6.3 Process Approach\n[Company Name] uses a process-based approach. Each QMS process is mapped in the Xyreg QMS Blueprint, showing process interactions, inputs/outputs, and responsible parties. The Blueprint provides a visual representation of the quality system aligned to ISO 13485 clause structure.\n\n6.4 Resource Management\nRequired resources are identified during management review and tracked through Xyreg\'s resource planning features. Personnel competency requirements are defined per role and managed via the Training Module (see SOP-004).\n\n6.5 Planning\nQuality planning for new products is initiated through the Xyreg Product Lifecycle module. Each product has a defined lifecycle with phases, required documents, and deliverables. Risk-based planning per ISO 14971 is integrated into the design process.\n\n6.6 Monitoring and Measurement\nQMS performance is monitored through:\n- Internal audits (SOP-050) scheduled and tracked in Xyreg\n- CAPA metrics and trend analysis via the Xyreg CAPA Module\n- Customer feedback and complaint data via the Complaints Module\n- Supplier performance metrics via the Supplier Management Module\n- KPIs displayed on the Xyreg Company Dashboard\n\n6.7 Continuous Improvement\nImprovement opportunities identified through audits, CAPAs, management reviews, and post-market surveillance are logged in Xyreg and tracked to closure. The platform provides trend analysis to identify systemic issues requiring preventive action.',
    },
  },
};

/**
 * Per SOP, list the section ids that changed between successive template
 * versions. `staleSectionsBetween('SOP-001', fromVersion, toVersion)` returns
 * the union of every section id that changed in any version step in (from, to].
 */
export const SOP_SECTION_DIFFS: Record<
  string,
  Record<number, string[]>
> = {
  // Sections changed when bumping SOP-001 from v1 → v2
  'SOP-001': {
    2: ['procedure'],
  },
};

export function staleSectionsBetween(
  sopKey: string,
  fromVersion: number,
  toVersion: number,
): string[] {
  const diffs = SOP_SECTION_DIFFS[sopKey];
  if (!diffs) return [];
  const ids = new Set<string>();
  for (let v = fromVersion + 1; v <= toVersion; v++) {
    for (const id of diffs[v] ?? []) ids.add(id);
  }
  return Array.from(ids);
}
