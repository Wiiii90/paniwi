import type { ParticipantTeam, PlayerPick } from "../domain/types";

const unknown = "unknown" satisfies PlayerPick["rosterStatus"];

export const teams: ParticipantTeam[] = [
  {
    owner: "Nina",
    color: "#0f766e",
    players: [
      { name: "Morgan Rogers", nationalTeam: "England", rosterStatus: unknown },
      { name: "Felix Nmecha", nationalTeam: "Germany", rosterStatus: unknown },
      { name: "Habib Diarra", nationalTeam: "Senegal", rosterStatus: unknown },
      { name: "Bradley Barcola", nationalTeam: "France", rosterStatus: unknown },
      { name: "Cristian Romero", nationalTeam: "Argentina", rosterStatus: unknown },
      { name: "Rodri", nationalTeam: "Spain", rosterStatus: unknown },
      { name: "Fabian Ruiz", nationalTeam: "Spain", aliases: ["Fabián Ruiz"], rosterStatus: unknown },
      { name: "Aaron Hickey", nationalTeam: "Scotland", rosterStatus: unknown },
      { name: "Richie Laryea", nationalTeam: "Canada", rosterStatus: unknown },
      { name: "Marc Guehi", nationalTeam: "England", aliases: ["Marc Guéhi"], rosterStatus: unknown },
      { name: "Orlando Mosquera", nationalTeam: "Panama", position: "goalkeeper", rosterStatus: unknown }
    ]
  },
  {
    owner: "Willi",
    color: "#b45309",
    players: [
      { name: "Alisson", nationalTeam: "Brazil", position: "goalkeeper", aliases: ["Alisson Becker"], rosterStatus: unknown },
      { name: "Davinson Sanchez", nationalTeam: "Colombia", aliases: ["Dávinson Sánchez"], rosterStatus: unknown },
      { name: "Stefan Posch", nationalTeam: "Austria", rosterStatus: unknown },
      { name: "Gabriel Magalhaes", nationalTeam: "Brazil", aliases: ["Gabriel Magalhães"], rosterStatus: unknown },
      { name: "Thomas Meunier", nationalTeam: "Belgium", rosterStatus: unknown },
      { name: "Diego Gomez", nationalTeam: "Paraguay", aliases: ["Diego Gómez"], rosterStatus: unknown },
      { name: "Ruben Dias", nationalTeam: "Portugal", aliases: ["Rúben Dias"], rosterStatus: unknown },
      { name: "Garry Rodrigues", nationalTeam: "Cape Verde", rosterStatus: unknown },
      { name: "Cho Gue-sung", nationalTeam: "South Korea", aliases: ["Guesung Cho", "Cho Gue Sung"], rosterStatus: unknown },
      { name: "Felix Nmecha", nationalTeam: "Germany", rosterStatus: unknown },
      { name: "Ayoub El Kaabi", nationalTeam: "Morocco", rosterStatus: unknown }
    ]
  },
  {
    owner: "Rafael",
    color: "#7c3aed",
    players: [
      { name: "Alexis Guendouz", nationalTeam: "Algeria", position: "goalkeeper", rosterStatus: unknown },
      { name: "Trent Alexander-Arnold", nationalTeam: "England", rosterStatus: unknown },
      { name: "Richard Rios", nationalTeam: "Colombia", aliases: ["Richard Ríos"], rosterStatus: unknown },
      { name: "Seko Fofana", nationalTeam: "Ivory Coast", rosterStatus: unknown },
      { name: "Josip Stanisic", nationalTeam: "Croatia", aliases: ["Josip Stanišić"], rosterStatus: unknown },
      { name: "Youssef En-Nesyri", nationalTeam: "Morocco", rosterStatus: unknown },
      { name: "Fabian Ruiz", nationalTeam: "Spain", aliases: ["Fabián Ruiz"], rosterStatus: unknown },
      { name: "Julio Enciso", nationalTeam: "Paraguay", rosterStatus: unknown },
      { name: "Lamine Yamal", nationalTeam: "Spain", rosterStatus: unknown },
      { name: "Federico Vinas", nationalTeam: "Uruguay", aliases: ["Federico Viñas"], rosterStatus: unknown },
      { name: "Matheus Cunha", nationalTeam: "Brazil", rosterStatus: unknown }
    ]
  },
  {
    owner: "Anne",
    color: "#d72638",
    players: [
      { name: "Johny Placide", nationalTeam: "Haiti", position: "goalkeeper", rosterStatus: unknown },
      { name: "Pedri", nationalTeam: "Spain", rosterStatus: unknown },
      { name: "Bruno Fernandes", nationalTeam: "Portugal", rosterStatus: unknown },
      { name: "Ryan Gravenberch", nationalTeam: "Netherlands", rosterStatus: unknown },
      { name: "Cedric Bakambu", nationalTeam: "DR Congo", aliases: ["Cédric Bakambu"], rosterStatus: unknown },
      { name: "Richard Rios", nationalTeam: "Colombia", aliases: ["Richard Ríos"], rosterStatus: unknown },
      { name: "Giuliano Simeone", nationalTeam: "Argentina", rosterStatus: unknown },
      { name: "Dailon Livramento", nationalTeam: "Cape Verde", rosterStatus: unknown },
      { name: "Seko Fofana", nationalTeam: "Ivory Coast", rosterStatus: unknown, rosterNote: "Tausch fuer Erick Sanchez" },
      { name: "Emil Holm", nationalTeam: "Sweden", rosterStatus: unknown },
      { name: "Israel Reyes", nationalTeam: "Mexico", rosterStatus: unknown }
    ]
  },
  {
    owner: "Caro",
    color: "#2563eb",
    players: [
      { name: "Nicolas Jackson", nationalTeam: "Senegal", aliases: ["Nicolas Jackson"], rosterStatus: unknown },
      { name: "Erling Haaland", nationalTeam: "Norway", rosterStatus: unknown },
      { name: "Lyle Foster", nationalTeam: "South Africa", rosterStatus: unknown },
      { name: "Tyler Adams", nationalTeam: "United States", rosterStatus: unknown },
      { name: "Tijjani Reijnders", nationalTeam: "Netherlands", rosterStatus: unknown },
      { name: "Derrick Etienne Jr", nationalTeam: "Haiti", aliases: ["Derrick Etienne"], rosterStatus: unknown },
      { name: "Edo Kayembe", nationalTeam: "DR Congo", rosterStatus: unknown },
      { name: "Josip Stanisic", nationalTeam: "Croatia", aliases: ["Josip Stanišić"], rosterStatus: unknown },
      { name: "Manuel Akanji", nationalTeam: "Switzerland", rosterStatus: unknown },
      { name: "Piero Hincapie", nationalTeam: "Ecuador", aliases: ["Piero Hincapié"], rosterStatus: unknown },
      { name: "Jordan Pickford", nationalTeam: "England", position: "goalkeeper", rosterStatus: unknown }
    ]
  },
  {
    owner: "Felix",
    color: "#059669",
    players: [
      { name: "Vinicius Junior", nationalTeam: "Brazil", aliases: ["Vinícius Júnior", "Vini Jr."], rosterStatus: unknown },
      { name: "Andrej Kramaric", nationalTeam: "Croatia", aliases: ["Andrej Kramarić"], rosterStatus: unknown },
      { name: "Angelo Preciado", nationalTeam: "Ecuador", aliases: ["Ángelo Preciado"], rosterStatus: unknown },
      { name: "Simon Adingra", nationalTeam: "Ivory Coast", rosterStatus: unknown },
      { name: "Mohammad Mohebi", nationalTeam: "Iran", rosterStatus: unknown },
      { name: "Ramin Rezaeian", nationalTeam: "Iran", rosterStatus: unknown },
      { name: "Sander Berge", nationalTeam: "Norway", rosterStatus: unknown },
      { name: "Thomas Meunier", nationalTeam: "Belgium", rosterStatus: unknown },
      { name: "Billy Gilmour", nationalTeam: "Scotland", rosterStatus: unknown },
      { name: "Youcef Atal", nationalTeam: "Algeria", rosterStatus: unknown },
      { name: "Angus Gunn", nationalTeam: "Scotland", position: "goalkeeper", rosterStatus: unknown }
    ]
  },
  {
    owner: "Jonas",
    color: "#9333ea",
    players: [
      { name: "Luis Mejia", nationalTeam: "Panama", position: "goalkeeper", aliases: ["Luis Mejía"], rosterStatus: unknown },
      { name: "Joao Cancelo", nationalTeam: "Portugal", aliases: ["João Cancelo"], rosterStatus: unknown },
      { name: "Aymeric Laporte", nationalTeam: "Spain", rosterStatus: unknown },
      { name: "Achraf Hakimi", nationalTeam: "Morocco", rosterStatus: unknown },
      { name: "Pavel Sulc", nationalTeam: "Czech Republic", aliases: ["Pavel Šulc"], rosterStatus: unknown },
      { name: "Jude Bellingham", nationalTeam: "England", rosterStatus: unknown },
      { name: "Edson Alvarez", nationalTeam: "Mexico", aliases: ["Edson Álvarez"], rosterStatus: unknown },
      { name: "Tyler Adams", nationalTeam: "United States", rosterStatus: unknown },
      { name: "Alexander Isak", nationalTeam: "Sweden", rosterStatus: unknown },
      { name: "Oumar Diakite", nationalTeam: "Ivory Coast", aliases: ["Oumar Diakité"], rosterStatus: unknown },
      { name: "Jonathan David", nationalTeam: "Canada", rosterStatus: unknown }
    ]
  },
  {
    owner: "Kim",
    color: "#0891b2",
    players: [
      { name: "Edmilson Junior", nationalTeam: "Qatar", rosterStatus: unknown },
      { name: "Marcus Rashford", nationalTeam: "England", rosterStatus: unknown },
      { name: "Cedric Bakambu", nationalTeam: "DR Congo", aliases: ["Cédric Bakambu"], rosterStatus: unknown },
      { name: "Pavel Sulc", nationalTeam: "Czech Republic", aliases: ["Pavel Šulc"], rosterStatus: unknown },
      { name: "Lukas Provod", nationalTeam: "Czech Republic", aliases: ["Lukáš Provod"], rosterStatus: unknown },
      { name: "Timothy Weah", nationalTeam: "United States", rosterStatus: unknown },
      { name: "Damian Bobadilla", nationalTeam: "Paraguay", aliases: ["Damián Bobadilla"], rosterStatus: unknown },
      { name: "David Raum", nationalTeam: "Germany", rosterStatus: unknown },
      { name: "Mathieu Choiniere", nationalTeam: "Canada", aliases: ["Mathieu Choinière"], rosterStatus: unknown },
      { name: "Aaron Wan-Bissaka", nationalTeam: "DR Congo", rosterStatus: unknown }
    ]
  },
  {
    owner: "Melli",
    color: "#db2777",
    players: [
      { name: "Youri Tielemans", nationalTeam: "Belgium", rosterStatus: unknown },
      { name: "Alexis Mac Allister", nationalTeam: "Argentina", rosterStatus: unknown },
      { name: "Jeremy Doku", nationalTeam: "Belgium", aliases: ["Jérémy Doku"], rosterStatus: unknown },
      { name: "Mario Pasalic", nationalTeam: "Croatia", aliases: ["Mario Pašalić"], rosterStatus: unknown },
      { name: "Mohamed El Shenawy", nationalTeam: "Egypt", position: "goalkeeper", rosterStatus: unknown },
      { name: "Micky van de Ven", nationalTeam: "Netherlands", rosterStatus: unknown },
      { name: "Adrien Rabiot", nationalTeam: "France", rosterStatus: unknown },
      { name: "Daniel Svensson", nationalTeam: "Sweden", rosterStatus: unknown },
      { name: "Lyle Foster", nationalTeam: "South Africa", rosterStatus: unknown },
      { name: "Krepin Diatta", nationalTeam: "Senegal", aliases: ["Krépin Diatta"], rosterStatus: unknown },
      { name: "Elias Saad", nationalTeam: "Tunisia", rosterStatus: unknown }
    ]
  },
  {
    owner: "Peer",
    color: "#ea580c",
    players: [
      { name: "Goncalo Ramos", nationalTeam: "Portugal", aliases: ["Gonçalo Ramos"], rosterStatus: unknown },
      { name: "Jhon Arias", nationalTeam: "Colombia", rosterStatus: unknown },
      { name: "Mohanad Ali", nationalTeam: "Iraq", rosterStatus: unknown },
      { name: "Alejandro Garnacho", nationalTeam: "Argentina", rosterStatus: unknown },
      { name: "Lucas Paqueta", nationalTeam: "Brazil", aliases: ["Lucas Paquetá"], rosterStatus: unknown },
      { name: "Ruben Vargas", nationalTeam: "Switzerland", rosterStatus: unknown },
      { name: "Antonio Nusa", nationalTeam: "Norway", rosterStatus: unknown },
      { name: "Desire Doue", nationalTeam: "France", aliases: ["Désiré Doué", "Desiré Doué"], rosterStatus: unknown },
      { name: "Ben Doak", nationalTeam: "Scotland", aliases: ["Ben Gannon-Doak"], rosterStatus: unknown },
      { name: "Sayfallah Ltaief", nationalTeam: "Tunisia", rosterStatus: unknown }
    ]
  },
  {
    owner: "Marco",
    color: "#64748b",
    players: [
      { name: "Goncalo Ramos", nationalTeam: "Portugal", aliases: ["Gonçalo Ramos"], rosterStatus: unknown },
      { name: "Jhon Arias", nationalTeam: "Colombia", rosterStatus: unknown },
      { name: "Mohanad Ali", nationalTeam: "Iraq", rosterStatus: unknown },
      { name: "Alejandro Garnacho", nationalTeam: "Argentina", rosterStatus: unknown },
      { name: "Lucas Paqueta", nationalTeam: "Brazil", aliases: ["Lucas Paquetá"], rosterStatus: unknown },
      { name: "Ruben Vargas", nationalTeam: "Switzerland", rosterStatus: unknown },
      { name: "Antonio Nusa", nationalTeam: "Norway", rosterStatus: unknown },
      { name: "Desire Doue", nationalTeam: "France", aliases: ["Désiré Doué", "Desiré Doué"], rosterStatus: unknown },
      { name: "Ben Doak", nationalTeam: "Scotland", aliases: ["Ben Gannon-Doak"], rosterStatus: unknown },
      { name: "Sayfallah Ltaief", nationalTeam: "Tunisia", rosterStatus: unknown }
    ]
  }
];
