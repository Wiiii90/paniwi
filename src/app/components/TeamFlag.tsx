import { getTeamFlagUrl } from "../../config/teamCatalog";

type TeamFlagProps = {
  teamName: string;
  className?: string;
};

export function TeamFlag({ teamName, className = "" }: TeamFlagProps) {
  const flagUrl = getTeamFlagUrl(teamName);
  if (!flagUrl) {
    return null;
  }

  return <img alt="" aria-hidden="true" className={`match-team-flag ${className}`.trim()} loading="lazy" src={flagUrl} />;
}
