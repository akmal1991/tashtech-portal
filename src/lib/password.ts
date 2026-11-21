export function passwordProblems(pw: string, minLength = 10): string[] {
  const p: string[] = [];
  if (pw.length < minLength) p.push(`Password must be at least ${minLength} characters.`);
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) p.push("Use both upper- and lower-case letters.");
  if (!/[0-9]/.test(pw)) p.push("Include at least one digit.");
  if (!/[^A-Za-z0-9]/.test(pw)) p.push("Include at least one symbol.");
  return p;
}
