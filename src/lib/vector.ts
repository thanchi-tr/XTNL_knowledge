/**
 * pgvector accepts vector literals as text in the form "[0.1,0.2,...]" and
 * parses them via its own input function — so a bound text parameter cast
 * with `::vector` in SQL is the standard, injection-safe way to pass an
 * embedding into a query. This just formats the JS array into that literal;
 * the actual query still binds it as a parameter (see domain-discovery.ts),
 * never string-interpolates it into SQL text.
 */
export function toVectorLiteral(embedding: number[]): string {
  for (const v of embedding) {
    if (!Number.isFinite(v)) {
      throw new Error("Embedding contains a non-finite value — refusing to build a vector literal");
    }
  }
  return `[${embedding.join(",")}]`;
}
