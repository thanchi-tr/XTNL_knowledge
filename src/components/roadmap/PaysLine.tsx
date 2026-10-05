/**
 * A stated-pay line from statedPayoutCopy ('pays ⬡ 6 × progress from 70%'):
 * the ⬡ becomes the MP glyph and its figure, kept together. MP appears on a
 * roadmap surface only through this line (Names); a milestone that states 0
 * reads "pays nothing · <reason>", with no glyph.
 *
 * UI motion (ui-motion.md §3.3 screens 5, 7, 9; §8; D22): the line is an
 * honesty mark ("pays … × progress «from 70%»", the stated rate, never money
 * earned), so it is marked data-wc="honest" and its words never count against
 * a budget. The ⬡ is the kit's c-mp symbol drawn in ink (D22: no gold, no
 * --mp hue on a roadmap glyph), with " MP" sr-only beside its figure. The
 * words are statedLine's, unchanged; "from 70%" sits in its own span so a
 * surface can set it apart («from 70%»).
 */
import { Mark } from "@/components/glyph/Glyph";

export function PaysLine({ text }: { text: string }) {
  const at = text.indexOf("⬡ ");
  if (at < 0) return <span className="rm-pays" data-wc="honest">{text}</span>;
  const rest = text.slice(at + 2);
  const end = rest.search(/\s|$/);
  const tail = rest.slice(end);
  const floor = /\sfrom \d+%$/.exec(tail);
  return (
    <span className="rm-pays" data-wc="honest">
      {text.slice(0, at)}
      <span className="cur">
        <Mark glyph="c-mp" size={14} />
        <span className="num">{rest.slice(0, end)}</span>
        <span className="sr-only"> MP</span>
      </span>
      {floor ? (
        <>
          {tail.slice(0, floor.index)} <span className="rm-pays-floor">{floor[0].trim()}</span>
        </>
      ) : (
        tail
      )}
    </span>
  );
}
