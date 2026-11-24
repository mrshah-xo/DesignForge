// One-time content cleanup: replace em dashes (and en dashes) with plain
// hyphens in every stored text column, so project content generated before
// the "no em dash" rule also renders without the banned symbol.
// Idempotent: safe to run repeatedly.
import { db } from '../src/lib/db';

const TABLES: Array<[string, string[]]> = [
  ['Project', ['name', 'description']],
  ['LogoAnalysis', ['palette', 'styleTags', 'mood', 'industry', 'audienceGuess', 'trustSignals', 'description', 'backgroundSuggestion']],
  ['AudienceProfile', ['categoryLabel', 'audienceDesc', 'notes']],
  ['ResearchReport', ['sections', 'sources']],
  ['DesignSpec', ['tokens', 'markdown', 'logoFeedback']],
  ['DesignTheme', ['name', 'reason', 'tokens']],
  ['GenerationJob', ['progress', 'error']],
];

async function main() {
  let total = 0;
  for (const [table, cols] of TABLES) {
    for (const col of cols) {
      const updated = await db.$executeRawUnsafe(
        `UPDATE "${table}" SET "${col}" = replace(replace("${col}", '\u2014', '-'), '\u2013', '-') WHERE "${col}" LIKE '%\u2014%' OR "${col}" LIKE '%\u2013%'`
      );
      if (updated > 0) {
        console.log(`${table}.${col}: ${updated} row(s) cleaned`);
        total += updated;
      }
    }
  }
  console.log(total === 0 ? 'All stored content already clean.' : `Done. ${total} row updates total.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
