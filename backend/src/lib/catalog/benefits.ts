/**
 * "Benefits" of a pack (owner decision 2026-11-14), shown on the pack page instead of license terms.
 * The page shows only the column of the pack's own type (FREE or PREMIUM).
 *
 * - download / personal: every pack, free or paid.
 * - customize: the buyer picks colours, effects… to their needs (License.allowModification).
 * - commercial: use in games that earn money (License.allowCommercial).
 * - multiProject: use in more than one project (License.allowMultiProject).
 */
export const BENEFIT_ORDER = ["download", "customize", "personal", "commercial", "multiProject"] as const;
export type BenefitKey = (typeof BENEFIT_ORDER)[number];

export type BenefitFlags = { modification: boolean; commercial: boolean; multiProject: boolean };

export function packBenefits(flags: BenefitFlags): { key: BenefitKey; included: boolean }[] {
  const included: Record<BenefitKey, boolean> = {
    download: true,
    customize: flags.modification,
    personal: true,
    commercial: flags.commercial,
    multiProject: flags.multiProject,
  };
  return BENEFIT_ORDER.map((key) => ({ key, included: included[key] }));
}
