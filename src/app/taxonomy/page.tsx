import { listTaxonomy } from "@/lib/taxonomy";
import { TaxonomyManager } from "@/components/taxonomy/TaxonomyManager";

export const dynamic = "force-dynamic";

export default async function TaxonomyPage() {
  const tree = await listTaxonomy();

  const domainCount = tree.reduce((sum, f) => sum + f.domains.length, 0);

  return (
    <main className="site-container flex-1 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="fade-up mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="section-eyebrow">Structure</p>
            <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
              Fields &amp; Domains
            </h1>
            <p className="mt-1 max-w-xl" style={{ fontSize: 12, color: "var(--ink-2)" }}>
              Domains are normally discovered automatically — an idea matching nothing existing gets a new one,
              named for it. Create them by hand when you already know how a subject should be split.
            </p>
          </div>
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {tree.length} field{tree.length === 1 ? "" : "s"} · {domainCount} domain{domainCount === 1 ? "" : "s"}
          </p>
        </header>
        <div className="fade-up fade-up-1">
          <TaxonomyManager initialTree={tree} />
        </div>
      </div>
    </main>
  );
}
