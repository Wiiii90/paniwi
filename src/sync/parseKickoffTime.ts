function parseClock(value: string): { hours: number; minutes: number } | null {
  const match = value.match(/(\d{1,2}):(\d{2})(?:\s*(a\.m\.|p\.m\.))?/i);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();

  if (meridiem === "p.m." && hours < 12) {
    hours += 12;
  }
  if (meridiem === "a.m." && hours === 12) {
    hours = 0;
  }

  return { hours, minutes };
}

function parseUtcOffsetHours(timeLine: string): number {
  const match = timeLine.match(/UTC(?:\+|−|-)(\d{1,2})(?::00)?/i);
  if (!match) {
    return 0;
  }

  const hours = Number(match[1]);
  return /UTC\+/i.test(timeLine) ? hours : -hours;
}

export function parseKickoffUtc(block: string): string | undefined {
  const dateMatch = block.match(/\|date=\{\{Start date\|(\d+)\|(\d+)\|(\d+)\}\}/i);
  if (!dateMatch) {
    return undefined;
  }

  const [, year, month, day] = dateMatch;
  const timeLine = (block.match(/\|time=([^\n|]+)/i)?.[1] ?? "").replace(/&nbsp;/g, " ");
  const clock = parseClock(timeLine);
  if (!clock) {
    return undefined;
  }

  const offsetHours = parseUtcOffsetHours(timeLine);
  const utcHours = clock.hours - offsetHours;
  const kickoff = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), utcHours, clock.minutes, 0));

  return kickoff.toISOString();
}
