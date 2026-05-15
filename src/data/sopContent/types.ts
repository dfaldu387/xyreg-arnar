export interface SOPSectionContent {
  id: string;
  title: string;
  content: string;
}

export interface SOPFullContent {
  sopNumber: string;
  title: string;
  sections: SOPSectionContent[];
  /**
   * Bump whenever the static template content changes so that
   * `resyncStaleSopSections` can detect drafts that need to be
   * re-seeded with the latest version.
   * Defaults to 1 when omitted.
   */
  templateVersion?: number;
}
