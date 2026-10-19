export function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((p) => `${Array.from(p)[0]}****`)
    .join(" ");
}
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("id-ID")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
// Exact normalized names are a consistency signal, never proof of campaign authority.
export function namesMatch(a: string, b: string): boolean {
  const left = normalizeName(a);
  return left.length > 0 && left === normalizeName(b);
}
