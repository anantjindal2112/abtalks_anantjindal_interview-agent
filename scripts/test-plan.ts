import { sampleCandidates } from "../src/lib/data";
import { buildInterviewPlan } from "../src/lib/plan";

let failures = 0;
for (const c of sampleCandidates) {
  const plan = buildInterviewPlan(c);
  const days = new Set(plan.map((p) => p.day));
  console.log(
    `${c.member.id} ${c.member.name} (${c.missions.length} missions) -> anchors=${plan.length} distinctDays=${days.size}`
  );
  for (const p of plan) {
    console.log(`   day ${p.day} [${p.bucket}] ${p.title}`);
  }
  if (days.size < 4) {
    console.log("   !!! BELOW MINIMUM DAYS");
    failures++;
  }
}
console.log(failures === 0 ? "\nAll candidates clear >=4 distinct days." : `\n${failures} candidates FAILED the minimum.`);
