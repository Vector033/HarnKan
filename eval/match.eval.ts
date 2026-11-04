// Slip → debt matching eval: npm run eval:match [-- --provider gemini]
//
// For each synthetic slip (fictional names, see fixtures/synthetic) it reads
// the image with the real slip reader, then asks matchSlip four questions:
//
//   right+name   the receiver set their payee name; should auto-tick them
//   right+nick   the receiver only has a nickname;  should still auto-tick
//   wrong amount right person, amount off by 50 baht; must NOT auto-tick
//   wrong person someone else is owed the same amount; must NOT auto-tick
//
// A false tick is the costly mistake (a debt shows as paid when it is not),
// so the eval fails if any happen. Missed ticks only cost the user one tap.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSlip, type SlipReadResult } from "@harnkan/slip-reader";
import { terminateOcr } from "@harnkan/slip-reader/image";
import { expect, test } from "vitest";
import { matchSlip, type MatchCandidate } from "@/lib/core/slip-match";

const provider = (process.env.EVAL_PROVIDER ?? "ocr") as "ocr" | "gemini";
const dir = fileURLToPath(new URL("./fixtures/synthetic/", import.meta.url));
const now = new Date("2026-11-04T12:00:00+07:00"); // the synthetic slips are dated in the 60 days before

interface Label {
  file: string;
  amount: number;
  dateTime: string;
  receiver: { name: string; last4: string };
}

const DECOYS = ["วรวุฒิ ทองคำ", "ปรียาภรณ์ ศักดิ์ดี"];
const stripTitle = (n: string) => n.replace(/^(นางสาว|นาง|นาย|น\.ส\.|MR\.?|MS\.?|MRS\.?)\s*/i, "");

test(`slip matching (${provider})`, { timeout: 30 * 60_000 }, async () => {
  const labels: Label[] = JSON.parse(await readFile(join(dir, "labels.json"), "utf8"));
  const tally = { rightName: 0, rightNick: 0, falseAmount: 0, falsePerson: 0, wrongTarget: 0, n: 0 };

  for (const label of labels) {
    const image = new Uint8Array(await readFile(join(dir, label.file)));
    const mime = extname(label.file) === ".png" ? "image/png" : "image/jpeg";
    let slip: SlipReadResult;
    try {
      slip = await readSlip(image, mime, { provider, now });
    } catch (e) {
      console.error(`✗ ${label.file}: ${(e as Error).message}`);
      continue;
    }
    tally.n++;
    const satang = Math.round(label.amount * 100);
    const ctx = { tripCreatedAt: new Date(Date.parse(label.dateTime) - 3600_000).toISOString(), now };
    const decoys: MatchCandidate[] = DECOYS.map((name, i) => ({
      toMemberId: `decoy${i}`,
      amount: satang + (i + 1) * 3_700,
      names: [name, `เพื่อน${i}`],
    }));
    const right: MatchCandidate = { toMemberId: "right", amount: satang, names: [stripTitle(label.receiver.name), "เจ้าของ"] };

    const a = matchSlip(slip, [right, ...decoys], ctx);
    if (a.auto && a.candidate?.toMemberId === "right") tally.rightName++;
    if (a.auto && a.candidate?.toMemberId !== "right") tally.wrongTarget++;

    const b = matchSlip(slip, [{ ...right, names: ["เจ้าของ"] }, ...decoys], ctx);
    if (b.auto && b.candidate?.toMemberId === "right") tally.rightNick++;
    if (b.auto && b.candidate?.toMemberId !== "right") tally.wrongTarget++;

    if (matchSlip(slip, [{ ...right, amount: satang + 5_000 }, ...decoys], ctx).auto) tally.falseAmount++;
    const other = { ...decoys[0], amount: satang };
    if (matchSlip(slip, [other, decoys[1]], ctx).auto) tally.falsePerson++;

    if (!a.auto) console.log(`${label.file}: not auto-ticked (${a.reasons.join("; ") || "no reason"})`);
  }
  if (provider === "ocr") await terminateOcr();

  const pct = (x: number) => `${Math.round((100 * x) / Math.max(tally.n, 1))}%`;
  const table = [
    "| scenario | result |",
    "|---|---|",
    `| right person, payee name set: auto-ticked | ${pct(tally.rightName)} |`,
    `| right person, nickname only: auto-ticked | ${pct(tally.rightNick)} |`,
    `| wrong amount: falsely ticked | ${pct(tally.falseAmount)} |`,
    `| wrong person, same amount: falsely ticked | ${pct(tally.falsePerson)} |`,
    `| ticked the wrong member | ${tally.wrongTarget} |`,
  ].join("\n");
  console.log(`\nprovider=${provider} slips=${tally.n}\n\n${table}`);

  const out = fileURLToPath(new URL("./results/", import.meta.url));
  await mkdir(out, { recursive: true });
  await writeFile(join(out, `match-${provider}.md`), `provider: ${provider}, synthetic slips: ${tally.n}\n\n${table}\n`);
  await writeFile(join(out, `match-${provider}.json`), JSON.stringify({ provider, ranAt: new Date().toISOString(), ...tally }, null, 2) + "\n");

  expect(tally.n).toBeGreaterThan(0);
  expect(tally.falseAmount + tally.falsePerson + tally.wrongTarget).toBe(0);
});
