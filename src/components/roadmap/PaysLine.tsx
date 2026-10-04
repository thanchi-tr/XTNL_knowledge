/**
 * A stated-pay line from statedPayoutCopy ('pays ⬡ 6 × progress from 70%'):
 * the ⬡ becomes the MP glyph and its figure, kept together. MP appears on a
 * roadmap surface only through this line (Names); a milestone that states 0
 * reads "pays nothing · <reason>", with no glyph.
 */
import { CurrencyGlyph } from "@/components/ui/Icon";

export function PaysLine({ text }: { text: string }) {
  const at = text.indexOf("⬡ ");
  if (at < 0) return <>{text}</>;
  const rest = text.slice(at + 2);
  const end = rest.search(/\s|$/);
  return (
    <>
      {text.slice(0, at)}
      <span className="cur">
        <CurrencyGlyph kind="mp" />
        <span className="num">{rest.slice(0, end)}</span>
        <span className="sr-only"> MP</span>
      </span>
      {rest.slice(end)}
    </>
  );
}
