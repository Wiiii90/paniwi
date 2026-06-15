import { parseWikipediaMatchKickoffs } from "./sources/wikipediaSource";
import type { MatchKickoff } from "./syncSchedule";

const defaultEndpoint = "https://en.wikipedia.org/w/api.php";

export const DEFAULT_2026_GROUP_PAGES = Array.from({ length: 12 }, (_, index) => `2026 FIFA World Cup Group ${String.fromCharCode(65 + index)}`);

type WikipediaQueryResponse = {
  query?: {
    pages?: Array<{
      title?: string;
      missing?: boolean;
      revisions?: Array<{
        slots?: {
          main?: {
            content?: string;
          };
        };
      }>;
    }>;
  };
  error?: {
    code?: string;
    info?: string;
  };
};

function getUserAgent(): string {
  return (
    process.env.WIKIPEDIA_USER_AGENT ??
    "wm-2026-panini-liga/0.1 (https://github.com/Wiiii90/paniwi; private hobby project; contact: wilhelmaltemeier@gmail.com)"
  );
}

export async function fetchWikipediaPagesForExport(pageTitles: string[]): Promise<Array<{ title: string; kickoffs: MatchKickoff[] }>> {
  const endpoint = process.env.WIKIPEDIA_API_ENDPOINT ?? defaultEndpoint;
  const batchSize = Number(process.env.WIKIPEDIA_BATCH_SIZE ?? 12);
  const results: Array<{ title: string; kickoffs: MatchKickoff[] }> = [];

  for (let offset = 0; offset < pageTitles.length; offset += batchSize) {
    const batch = pageTitles.slice(offset, offset + batchSize);
    const url = new URL(endpoint);
    url.searchParams.set("action", "query");
    url.searchParams.set("prop", "revisions");
    url.searchParams.set("rvslots", "main");
    url.searchParams.set("rvprop", "content");
    url.searchParams.set("titles", batch.join("|"));
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("origin", "*");

    const response = await fetch(url, {
      headers: { "user-agent": getUserAgent() }
    });

    if (response.status === 429) {
      throw new Error("Wikipedia API returned HTTP 429 while exporting kickoffs.");
    }

    if (!response.ok) {
      throw new Error(`Wikipedia API returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as WikipediaQueryResponse;
    if (body.error) {
      throw new Error(body.error.info ?? body.error.code ?? "Wikipedia API error");
    }

    for (const page of body.query?.pages ?? []) {
      const wikitext = page.revisions?.[0]?.slots?.main?.content;
      if (!page.title || !wikitext || page.missing) {
        continue;
      }

      results.push({
        title: page.title,
        kickoffs: parseWikipediaMatchKickoffs(wikitext, page.title)
      });
    }
  }

  return results;
}
