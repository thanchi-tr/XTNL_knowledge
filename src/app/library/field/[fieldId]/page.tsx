import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { loadFieldPage } from "@/lib/field-insight";
import { getCurrentUserId } from "@/lib/user";
import { Button } from "@/components/ui/Button";
import { PageActions } from "@/components/ui/Tabs";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { FieldView } from "@/components/library/FieldView";
import "@/components/library/study.css";

// Due and fading turn on the clock: never statically cache it.
export const dynamic = "force-dynamic";

/**
 * One read per request, shared by the metadata and the page, with the request
 * time read here (outside render) and passed down, so the server render and
 * the browser agree on what is due and what is fading.
 */
const loadPage = cache(async (fieldId: string) => {
  const now = new Date();
  const page = await loadFieldPage(getCurrentUserId(), fieldId, now);
  return { page, now: now.getTime() };
});

export async function generateMetadata({ params }: { params: Promise<{ fieldId: string }> }): Promise<Metadata> {
  const { fieldId } = await params;
  const { page } = await loadPage(fieldId);
  return { title: page ? page.summary.name : "Field" };
}

/**
 * Study › Library › a Field: its summary (level, memory, attributes, record:
 * the Library's Field pop-up, as a header), then one section per Domain with
 * its ideas, most urgent first, behind All · Due · Fading · Mastered (?show=).
 * The top bar reads "Ideas · Field" from the path (nav.titleFor) and the
 * Field's name once it is known (ShellTitle). An unknown Field is a 404.
 */
export default async function FieldPage({ params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;
  const { page, now } = await loadPage(fieldId);
  if (!page) notFound();

  return (
    <div className="page cq-main">
      <ShellTitle eyebrow="Ideas" title={page.summary.name} />
      <PageActions>
        <Button variant="quiet" href="/library" icon="back">
          Library
        </Button>
      </PageActions>
      <FieldView summary={page.summary} domains={page.domains} now={now} />
    </div>
  );
}
