import type { ParticipantTeam } from "../domain/types";

export const teams: ParticipantTeam[] = [
  {
    owner: "Anna",
    color: "#0f766e",
    players: [
      { name: "Kylian Mbappe", nationalTeam: "France", aliases: ["K. Mbappe", "Kylian Mbappé"] },
      { name: "Jude Bellingham", nationalTeam: "England", aliases: ["J. Bellingham"] },
      { name: "Jamal Musiala", nationalTeam: "Germany", aliases: ["J. Musiala"] },
      { name: "Vinicius Junior", nationalTeam: "Brazil", aliases: ["Vinícius Júnior", "Vini Jr."] },
      { name: "Christian Pulisic", nationalTeam: "United States" },
      { name: "Lautaro Martinez", nationalTeam: "Argentina", aliases: ["Lautaro Martínez"] },
      { name: "Lamine Yamal", nationalTeam: "Spain" },
      { name: "Victor Osimhen", nationalTeam: "Nigeria" },
      { name: "Heung-min Son", nationalTeam: "South Korea", aliases: ["Son Heung-min"] },
      { name: "Rafael Leao", nationalTeam: "Portugal", aliases: ["Rafael Leão"] },
      { name: "Federico Valverde", nationalTeam: "Uruguay" }
    ]
  },
  {
    owner: "Ben",
    color: "#b45309",
    players: [
      { name: "Harry Kane", nationalTeam: "England", aliases: ["H. Kane"] },
      { name: "Lionel Messi", nationalTeam: "Argentina", aliases: ["L. Messi"] },
      { name: "Florian Wirtz", nationalTeam: "Germany" },
      { name: "Bukayo Saka", nationalTeam: "England" },
      { name: "Rodrygo", nationalTeam: "Brazil" },
      { name: "Antoine Griezmann", nationalTeam: "France", aliases: ["A. Griezmann"] },
      { name: "Gio Reyna", nationalTeam: "United States", aliases: ["Giovanni Reyna"] },
      { name: "Alvaro Morata", nationalTeam: "Spain", aliases: ["Álvaro Morata"] },
      { name: "Bruno Fernandes", nationalTeam: "Portugal" },
      { name: "Darwin Nunez", nationalTeam: "Uruguay", aliases: ["Darwin Núñez"] },
      { name: "Takefusa Kubo", nationalTeam: "Japan" }
    ]
  },
  {
    owner: "Clara",
    color: "#7c3aed",
    players: [
      { name: "Erling Haaland", nationalTeam: "Norway" },
      { name: "Pedri", nationalTeam: "Spain" },
      { name: "Phil Foden", nationalTeam: "England" },
      { name: "Ousmane Dembele", nationalTeam: "France", aliases: ["Ousmane Dembélé"] },
      { name: "Julian Alvarez", nationalTeam: "Argentina", aliases: ["Julián Álvarez"] },
      { name: "Serge Gnabry", nationalTeam: "Germany" },
      { name: "Raphinha", nationalTeam: "Brazil" },
      { name: "Tim Weah", nationalTeam: "United States" },
      { name: "Joao Felix", nationalTeam: "Portugal", aliases: ["João Félix"] },
      { name: "Luis Suarez", nationalTeam: "Uruguay", aliases: ["Luis Suárez"] },
      { name: "Kim Min-jae", nationalTeam: "South Korea" }
    ]
  }
];
