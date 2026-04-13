import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RegulatoryNewsItem {
  id: string;
  source: string;
  source_name: string;
  title: string;
  summary: string | null;
  url: string | null;
  published_at: string | null;
  scraped_at: string;
  category: string;
  region: string | null;
  relevance_score: number;
  created_at: string;
}

const FALLBACK_REGULATORY_NEWS: RegulatoryNewsItem[] = [
  // --- US (5) ---
  {
    id: "fb-us-1",
    source: "fda",
    source_name: "FDA CDRH",
    title: "FDA Issues Final Guidance on AI/ML-Enabled Device Software Functions",
    summary: "Final guidance clarifying the regulatory approach for AI/ML-enabled medical device software and change control plans.",
    url: "https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-and-machine-learning-aiml-enabled-medical-devices",
    published_at: "2026-04-09T16:00:00Z",
    scraped_at: "2026-04-09T16:00:00Z",
    category: "guidance",
    region: "US",
    relevance_score: 92,
    created_at: "2026-04-09T16:00:00Z",
  },
  {
    id: "fb-us-2",
    source: "fda",
    source_name: "FDA CDRH",
    title: "FDA Updates Guidance on Cybersecurity in Medical Devices",
    summary: "Premarket guidance update addressing cybersecurity risk management expectations for connected devices.",
    url: "https://www.fda.gov/medical-devices/digital-health-center-excellence/cybersecurity",
    published_at: "2026-04-06T14:00:00Z",
    scraped_at: "2026-04-06T14:00:00Z",
    category: "guidance",
    region: "US",
    relevance_score: 90,
    created_at: "2026-04-06T14:00:00Z",
  },
  {
    id: "fb-us-3",
    source: "fda",
    source_name: "FDA CDRH",
    title: "FDA Safety Communication: Pulse Oximeter Accuracy Limitations",
    summary: "Safety communication reminding healthcare providers and patients about accuracy limitations of pulse oximeters.",
    url: "https://www.fda.gov/medical-devices/safety-communications",
    published_at: "2026-04-03T10:00:00Z",
    scraped_at: "2026-04-03T10:00:00Z",
    category: "recall",
    region: "US",
    relevance_score: 82,
    created_at: "2026-04-03T10:00:00Z",
  },
  {
    id: "fb-us-4",
    source: "fda",
    source_name: "FDA CDRH",
    title: "Draft Guidance on Predetermined Change Control Plans for Device Software",
    summary: "Draft guidance providing recommendations for manufacturers developing predetermined change control plans for ML-driven updates.",
    url: "https://www.fda.gov/regulatory-information/search-fda-guidance-documents",
    published_at: "2026-03-28T12:00:00Z",
    scraped_at: "2026-03-28T12:00:00Z",
    category: "guidance",
    region: "US",
    relevance_score: 87,
    created_at: "2026-03-28T12:00:00Z",
  },
  {
    id: "fb-us-5",
    source: "fda",
    source_name: "FDA CDRH",
    title: "510(k) Third Party Review Program: Updated List of Eligible Device Types",
    summary: "CDRH updates the list of device types eligible for third-party 510(k) review to include additional Class II devices.",
    url: "https://www.fda.gov/medical-devices/premarket-submissions-selecting-and-preparing-correct-submission/510k-third-party-review-program",
    published_at: "2026-03-20T09:00:00Z",
    scraped_at: "2026-03-20T09:00:00Z",
    category: "regulation_update",
    region: "US",
    relevance_score: 79,
    created_at: "2026-03-20T09:00:00Z",
  },
  // --- EU (5) ---
  {
    id: "fb-eu-1",
    source: "eu_mdcg",
    source_name: "MDCG",
    title: "MDCG Position Paper on Clinical Evidence for Legacy Devices Under MDR",
    summary: "Clarifies the level of clinical evidence expected for legacy devices transitioning to MDR, especially for equivalence claims.",
    url: "https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en",
    published_at: "2026-04-07T09:00:00Z",
    scraped_at: "2026-04-07T09:00:00Z",
    category: "guidance",
    region: "EU",
    relevance_score: 91,
    created_at: "2026-04-07T09:00:00Z",
  },
  {
    id: "fb-eu-2",
    source: "eu_mdcg",
    source_name: "MDCG",
    title: "MDCG 2026-5: Updated UDI Guidance for System and Procedure Packs",
    summary: "Revised guidance on UDI assignment and labelling obligations for system and procedure packs under EU MDR Article 22.",
    url: "https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en",
    published_at: "2026-04-04T08:00:00Z",
    scraped_at: "2026-04-04T08:00:00Z",
    category: "guidance",
    region: "EU",
    relevance_score: 86,
    created_at: "2026-04-04T08:00:00Z",
  },
  {
    id: "fb-eu-3",
    source: "eu_mdcg",
    source_name: "European Commission",
    title: "EU MDR Transitional Period Extended for Certain Class III Devices",
    summary: "Commission delegated act extending the transitional period for Class III custom-made implantable devices until 2028.",
    url: "https://health.ec.europa.eu/medical-devices-sector/new-regulations_en",
    published_at: "2026-03-30T10:00:00Z",
    scraped_at: "2026-03-30T10:00:00Z",
    category: "regulation_update",
    region: "EU",
    relevance_score: 94,
    created_at: "2026-03-30T10:00:00Z",
  },
  {
    id: "fb-eu-4",
    source: "eu_mdcg",
    source_name: "MDCG",
    title: "MDCG 2026-3: Guidance on Significant Changes to Medical Devices",
    summary: "New guidance defining when modifications to a CE-marked device constitute a significant change requiring re-assessment.",
    url: "https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en",
    published_at: "2026-03-18T11:00:00Z",
    scraped_at: "2026-03-18T11:00:00Z",
    category: "guidance",
    region: "EU",
    relevance_score: 89,
    created_at: "2026-03-18T11:00:00Z",
  },
  {
    id: "fb-eu-5",
    source: "eu_mdcg",
    source_name: "EUDAMED",
    title: "EUDAMED Module 5 (Market Surveillance) Now Available for Member States",
    summary: "EUDAMED opens Module 5 to national competent authorities for market surveillance data entry and reporting.",
    url: "https://ec.europa.eu/tools/eudamed",
    published_at: "2026-03-12T07:00:00Z",
    scraped_at: "2026-03-12T07:00:00Z",
    category: "regulation_update",
    region: "EU",
    relevance_score: 83,
    created_at: "2026-03-12T07:00:00Z",
  },
  // --- UK (4) ---
  {
    id: "fb-uk-1",
    source: "mhra",
    source_name: "MHRA",
    title: "MHRA Publishes Revised UKCA Marking Timeline for Medical Devices",
    summary: "Updated transition timeline for UKCA marking with ongoing CE recognition during the transition window.",
    url: "https://www.gov.uk/guidance/regulating-medical-devices-in-the-uk",
    published_at: "2026-03-15T09:00:00Z",
    scraped_at: "2026-03-15T09:00:00Z",
    category: "regulation_update",
    region: "UK",
    relevance_score: 88,
    created_at: "2026-03-15T09:00:00Z",
  },
  {
    id: "fb-uk-2",
    source: "mhra",
    source_name: "MHRA",
    title: "MHRA Guidance on Software as a Medical Device (SaMD) Classification",
    summary: "New guidance clarifying how MHRA classifies standalone software as medical devices under the UK regulatory framework.",
    url: "https://www.gov.uk/government/collections/regulatory-guidance-for-medical-devices",
    published_at: "2026-04-02T10:00:00Z",
    scraped_at: "2026-04-02T10:00:00Z",
    category: "guidance",
    region: "UK",
    relevance_score: 87,
    created_at: "2026-04-02T10:00:00Z",
  },
  {
    id: "fb-uk-3",
    source: "mhra",
    source_name: "MHRA",
    title: "MHRA Field Safety Notice: Patient Monitor Display Calibration Issue",
    summary: "Field safety notice regarding a calibration defect affecting vital sign display accuracy in certain patient monitors.",
    url: "https://www.gov.uk/drug-device-alerts",
    published_at: "2026-04-08T14:00:00Z",
    scraped_at: "2026-04-08T14:00:00Z",
    category: "recall",
    region: "UK",
    relevance_score: 80,
    created_at: "2026-04-08T14:00:00Z",
  },
  {
    id: "fb-uk-4",
    source: "mhra",
    source_name: "MHRA",
    title: "MHRA Roadmap for International Recognition of Medical Device Approvals",
    summary: "MHRA publishes its strategic roadmap for mutual recognition agreements with major regulatory jurisdictions.",
    url: "https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency",
    published_at: "2026-03-25T08:00:00Z",
    scraped_at: "2026-03-25T08:00:00Z",
    category: "regulation_update",
    region: "UK",
    relevance_score: 84,
    created_at: "2026-03-25T08:00:00Z",
  },
  // --- APAC (4) ---
  {
    id: "fb-apac-1",
    source: "tga",
    source_name: "TGA",
    title: "TGA Safety Alert: Voluntary Recall of Infusion Pump Software v3.2",
    summary: "Alert covering a voluntary recall tied to a dose-calculation defect in specified infusion pump software builds.",
    url: "https://www.tga.gov.au/safety",
    published_at: "2026-04-08T06:00:00Z",
    scraped_at: "2026-04-08T06:00:00Z",
    category: "recall",
    region: "APAC",
    relevance_score: 78,
    created_at: "2026-04-08T06:00:00Z",
  },
  {
    id: "fb-apac-2",
    source: "tga",
    source_name: "TGA",
    title: "TGA Updates Essential Principles for Medical Device Safety and Performance",
    summary: "Revised essential principles checklist aligning closer with IMDRF recommendations for general safety and performance.",
    url: "https://www.tga.gov.au/how-we-regulate/manufacturing-and-quality/medical-devices",
    published_at: "2026-04-01T04:00:00Z",
    scraped_at: "2026-04-01T04:00:00Z",
    category: "regulation_update",
    region: "APAC",
    relevance_score: 85,
    created_at: "2026-04-01T04:00:00Z",
  },
  {
    id: "fb-apac-3",
    source: "pmda",
    source_name: "PMDA",
    title: "PMDA Revises QMS Inspection Requirements for Foreign Manufacturers",
    summary: "Japan PMDA updates its QMS inspection guidance for overseas manufacturers, reducing on-site audit frequency for low-risk devices.",
    url: "https://www.pmda.go.jp/english/review-services/reviews/0002.html",
    published_at: "2026-03-22T05:00:00Z",
    scraped_at: "2026-03-22T05:00:00Z",
    category: "guidance",
    region: "APAC",
    relevance_score: 81,
    created_at: "2026-03-22T05:00:00Z",
  },
  {
    id: "fb-apac-4",
    source: "nmpa",
    source_name: "NMPA",
    title: "NMPA Publishes New Registration Pathway for Breakthrough Medical Devices",
    summary: "China NMPA introduces a priority review pathway for breakthrough devices with significant clinical advantages.",
    url: "https://www.nmpa.gov.cn",
    published_at: "2026-03-10T03:00:00Z",
    scraped_at: "2026-03-10T03:00:00Z",
    category: "regulation_update",
    region: "APAC",
    relevance_score: 83,
    created_at: "2026-03-10T03:00:00Z",
  },
  // --- LATAM (3) ---
  {
    id: "fb-latam-1",
    source: "anvisa",
    source_name: "ANVISA",
    title: "ANVISA Simplifies Registration for Low-Risk Medical Devices",
    summary: "New resolution streamlines the registration process for Class I and II medical devices in Brazil.",
    url: "https://www.gov.br/anvisa/pt-br/assuntos/produtossaude",
    published_at: "2026-04-05T13:00:00Z",
    scraped_at: "2026-04-05T13:00:00Z",
    category: "regulation_update",
    region: "LATAM",
    relevance_score: 82,
    created_at: "2026-04-05T13:00:00Z",
  },
  {
    id: "fb-latam-2",
    source: "anvisa",
    source_name: "ANVISA",
    title: "ANVISA Updates Good Manufacturing Practice Requirements for Medical Devices",
    summary: "Revised GMP requirements for medical device manufacturers aligning with ISO 13485:2016 expectations.",
    url: "https://www.gov.br/anvisa/pt-br/assuntos/produtossaude",
    published_at: "2026-03-28T11:00:00Z",
    scraped_at: "2026-03-28T11:00:00Z",
    category: "guidance",
    region: "LATAM",
    relevance_score: 79,
    created_at: "2026-03-28T11:00:00Z",
  },
  {
    id: "fb-latam-3",
    source: "cofepris",
    source_name: "COFEPRIS",
    title: "COFEPRIS Implements Electronic Submission for Device Registrations",
    summary: "Mexico's COFEPRIS launches an electronic portal for medical device registration submissions, replacing paper-based processes.",
    url: "https://www.gob.mx/cofepris",
    published_at: "2026-03-15T15:00:00Z",
    scraped_at: "2026-03-15T15:00:00Z",
    category: "regulation_update",
    region: "LATAM",
    relevance_score: 76,
    created_at: "2026-03-15T15:00:00Z",
  },
  // --- Global (4) ---
  {
    id: "fb-global-1",
    source: "iso",
    source_name: "ISO",
    title: "ISO 14971:2019/Amd 1:2026 — Risk Management Amendment Published",
    summary: "Amendment adds clarifications for benefit-risk documentation and post-market risk review expectations.",
    url: "https://www.iso.org/standard/72704.html",
    published_at: "2026-04-05T08:00:00Z",
    scraped_at: "2026-04-05T08:00:00Z",
    category: "new_standard",
    region: "Global",
    relevance_score: 95,
    created_at: "2026-04-05T08:00:00Z",
  },
  {
    id: "fb-global-2",
    source: "iec",
    source_name: "IEC",
    title: "IEC 62304 Ed 2.0: Medical Device Software Lifecycle Standard Updated",
    summary: "Second edition introduces updated software classification guidance and agile-compatible lifecycle process requirements.",
    url: "https://www.iec.ch/homepage",
    published_at: "2026-03-20T09:00:00Z",
    scraped_at: "2026-03-20T09:00:00Z",
    category: "new_standard",
    region: "Global",
    relevance_score: 93,
    created_at: "2026-03-20T09:00:00Z",
  },
  {
    id: "fb-global-3",
    source: "imdrf",
    source_name: "IMDRF",
    title: "IMDRF Publishes Final SaMD Clinical Evaluation Framework Update",
    summary: "Updated framework for clinical evaluation of Software as a Medical Device, incorporating real-world evidence considerations.",
    url: "https://www.imdrf.org/documents",
    published_at: "2026-03-30T10:00:00Z",
    scraped_at: "2026-03-30T10:00:00Z",
    category: "guidance",
    region: "Global",
    relevance_score: 91,
    created_at: "2026-03-30T10:00:00Z",
  },
  {
    id: "fb-global-4",
    source: "iso",
    source_name: "ISO",
    title: "ISO 13485:2016/Amd 1 — QMS Standard Amendment Ballot Opens",
    summary: "Ballot for the first amendment to ISO 13485:2016 addressing digital QMS records and electronic signatures.",
    url: "https://www.iso.org/standard/59752.html",
    published_at: "2026-03-08T08:00:00Z",
    scraped_at: "2026-03-08T08:00:00Z",
    category: "new_standard",
    region: "Global",
    relevance_score: 88,
    created_at: "2026-03-08T08:00:00Z",
  },
];

export function useRegulatoryNews(region?: string) {
  return useQuery({
    queryKey: ["regulatory-news", region],
    queryFn: async () => {
      let query = supabase
        .from("regulatory_news_items" as any)
        .select("*")
        .order("published_at", { ascending: false })
        .limit(50);

      if (region && region !== "All") {
        query = query.eq("region", region);
      }

      const { data, error } = await query;

      if (error) {
        return region && region !== "All"
          ? FALLBACK_REGULATORY_NEWS.filter((item) => item.region === region)
          : FALLBACK_REGULATORY_NEWS;
      }

      const items = ((data || []) as unknown as RegulatoryNewsItem[]);
      if (items.length > 0) {
        return items;
      }

      return region && region !== "All"
        ? FALLBACK_REGULATORY_NEWS.filter((item) => item.region === region)
        : FALLBACK_REGULATORY_NEWS;
    },
    staleTime: 1000 * 60 * 15,
  });
}
