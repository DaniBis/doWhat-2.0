export interface ActivityCatalogEntry {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  keywords: string[];
  fsq_categories: string[];
}
