import type { ParticipantTeam, PlayerPick } from "../domain/types";

const nominated = "nominated" satisfies PlayerPick["rosterStatus"];
const notNominated = "not-nominated" satisfies PlayerPick["rosterStatus"];

export const teams: ParticipantTeam[] = [
  {
    owner: "Nina",
    color: "#0f766e",
    players: [
      { name: "Morgan Rogers", nationalTeam: "England", rosterStatus: nominated },
      { name: "Felix Nmecha", nationalTeam: "Germany", rosterStatus: nominated },
      { name: "Habib Diarra", nationalTeam: "Senegal", rosterStatus: nominated },
      { name: "Bradley Barcola", nationalTeam: "France", rosterStatus: nominated },
      { name: "Cristian Romero", nationalTeam: "Argentina", rosterStatus: nominated },
      { name: "Rodri", nationalTeam: "Spain", rosterStatus: nominated },
      { name: "Fabian Ruiz", nationalTeam: "Spain", aliases: ["Fabián Ruiz"], rosterStatus: nominated },
      { name: "Aaron Hickey", nationalTeam: "Scotland", rosterStatus: nominated },
      { name: "Richie Laryea", nationalTeam: "Canada", rosterStatus: nominated },
      { name: "Marc Guehi", nationalTeam: "England", aliases: ["Marc Guéhi"], rosterStatus: nominated },
      { name: "Orlando Mosquera", nationalTeam: "Panama", position: "goalkeeper", rosterStatus: nominated }
    ]
  },
  {
    owner: "Willi",
    color: "#b45309",
    players: [
      { name: "Alisson", nationalTeam: "Brazil", position: "goalkeeper", aliases: ["Alisson Becker"], rosterStatus: nominated },
      { name: "Davinson Sanchez", nationalTeam: "Colombia", aliases: ["Dávinson Sánchez"], rosterStatus: nominated },
      { name: "Stefan Posch", nationalTeam: "Austria", rosterStatus: nominated },
      { name: "Gabriel Magalhaes", nationalTeam: "Brazil", aliases: ["Gabriel Magalhães"], rosterStatus: nominated },
      { name: "Thomas Meunier", nationalTeam: "Belgium", rosterStatus: nominated },
      { name: "Diego Gomez", nationalTeam: "Paraguay", aliases: ["Diego Gómez"], rosterStatus: nominated },
      { name: "Ruben Dias", nationalTeam: "Portugal", aliases: ["Rúben Dias"], rosterStatus: nominated },
      { name: "Garry Rodrigues", nationalTeam: "Cape Verde", rosterStatus: nominated },
      { name: "Cho Gue-sung", nationalTeam: "South Korea", aliases: ["Guesung Cho", "Cho Gue Sung"], rosterStatus: nominated },
      { name: "Felix Nmecha", nationalTeam: "Germany", rosterStatus: nominated },
      { name: "Ayoub El Kaabi", nationalTeam: "Morocco", rosterStatus: nominated }
    ]
  },
  {
    owner: "Rafael",
    color: "#7c3aed",
    players: [
      { name: "Alexis Guendouz", nationalTeam: "Algeria", position: "goalkeeper", rosterStatus: notNominated },
      { name: "Trent Alexander-Arnold", nationalTeam: "England", rosterStatus: notNominated },
      { name: "Richard Rios", nationalTeam: "Colombia", aliases: ["Richard Ríos"], rosterStatus: nominated },
      { name: "Seko Fofana", nationalTeam: "Ivory Coast", rosterStatus: nominated },
      { name: "Josip Stanisic", nationalTeam: "Croatia", aliases: ["Josip Stanišić"], rosterStatus: nominated },
      { name: "Youssef En-Nesyri", nationalTeam: "Morocco", rosterStatus: notNominated },
      { name: "Fabian Ruiz", nationalTeam: "Spain", aliases: ["Fabián Ruiz"], rosterStatus: nominated },
      { name: "Julio Enciso", nationalTeam: "Paraguay", rosterStatus: nominated },
      { name: "Lamine Yamal", nationalTeam: "Spain", rosterStatus: nominated },
      { name: "Federico Vinas", nationalTeam: "Uruguay", aliases: ["Federico Viñas"], rosterStatus: nominated },
      { name: "Matheus Cunha", nationalTeam: "Brazil", rosterStatus: nominated }
    ]
  },
  {
    owner: "Anne",
    color: "#d72638",
    players: [
      { name: "Johny Placide", nationalTeam: "Haiti", position: "goalkeeper", rosterStatus: nominated },
      { name: "Pedri", nationalTeam: "Spain", rosterStatus: nominated },
      { name: "Bruno Fernandes", nationalTeam: "Portugal", rosterStatus: nominated },
      { name: "Ryan Gravenberch", nationalTeam: "Netherlands", rosterStatus: nominated },
      { name: "Cedric Bakambu", nationalTeam: "DR Congo", aliases: ["Cédric Bakambu"], rosterStatus: nominated },
      { name: "Richard Rios", nationalTeam: "Colombia", aliases: ["Richard Ríos"], rosterStatus: nominated },
      { name: "Giuliano Simeone", nationalTeam: "Argentina", rosterStatus: nominated },
      { name: "Dailon Livramento", nationalTeam: "Cape Verde", rosterStatus: nominated },
      { name: "Seko Fofana", nationalTeam: "Ivory Coast", rosterStatus: nominated, rosterNote: "Tausch fuer Erick Sanchez" },
      { name: "Emil Holm", nationalTeam: "Sweden", rosterStatus: nominated },
      { name: "Israel Reyes", nationalTeam: "Mexico", rosterStatus: nominated }
    ]
  },
  {
    owner: "Caro",
    color: "#2563eb",
    players: [
      { name: "Nicolas Jackson", nationalTeam: "Senegal", aliases: ["Nicolas Jackson"], rosterStatus: nominated },
      { name: "Erling Haaland", nationalTeam: "Norway", rosterStatus: nominated },
      { name: "Lyle Foster", nationalTeam: "South Africa", rosterStatus: nominated },
      { name: "Tyler Adams", nationalTeam: "United States", rosterStatus: nominated },
      { name: "Tijjani Reijnders", nationalTeam: "Netherlands", rosterStatus: nominated },
      { name: "Derrick Etienne Jr", nationalTeam: "Haiti", aliases: ["Derrick Etienne"], rosterStatus: nominated },
      { name: "Edo Kayembe", nationalTeam: "DR Congo", rosterStatus: nominated },
      { name: "Josip Stanisic", nationalTeam: "Croatia", aliases: ["Josip Stanišić"], rosterStatus: nominated },
      { name: "Manuel Akanji", nationalTeam: "Switzerland", rosterStatus: nominated },
      { name: "Piero Hincapie", nationalTeam: "Ecuador", aliases: ["Piero Hincapié"], rosterStatus: nominated },
      { name: "Jordan Pickford", nationalTeam: "England", position: "goalkeeper", rosterStatus: nominated }
    ]
  },
  {
    owner: "Felix",
    color: "#059669",
    players: [
      { name: "Vinicius Junior", nationalTeam: "Brazil", aliases: ["Vinícius Júnior", "Vini Jr."], rosterStatus: nominated },
      { name: "Andrej Kramaric", nationalTeam: "Croatia", aliases: ["Andrej Kramarić"], rosterStatus: nominated },
      { name: "Angelo Preciado", nationalTeam: "Ecuador", aliases: ["Ángelo Preciado"], rosterStatus: nominated },
      { name: "Simon Adingra", nationalTeam: "Ivory Coast", rosterStatus: nominated },
      { name: "Mohammad Mohebi", nationalTeam: "Iran", rosterStatus: nominated },
      { name: "Ramin Rezaeian", nationalTeam: "Iran", rosterStatus: nominated },
      { name: "Sander Berge", nationalTeam: "Norway", rosterStatus: nominated },
      { name: "Thomas Meunier", nationalTeam: "Belgium", rosterStatus: nominated },
      { name: "Billy Gilmour", nationalTeam: "Scotland", rosterStatus: nominated },
      { name: "Youcef Atal", nationalTeam: "Algeria", rosterStatus: notNominated },
      { name: "Angus Gunn", nationalTeam: "Scotland", position: "goalkeeper", rosterStatus: nominated }
    ]
  },
  {
    owner: "Jonas",
    color: "#9333ea",
    players: [
      { name: "Luis Mejia", nationalTeam: "Panama", position: "goalkeeper", aliases: ["Luis Mejía"], rosterStatus: nominated },
      { name: "Joao Cancelo", nationalTeam: "Portugal", aliases: ["João Cancelo"], rosterStatus: nominated },
      { name: "Aymeric Laporte", nationalTeam: "Spain", rosterStatus: nominated },
      { name: "Achraf Hakimi", nationalTeam: "Morocco", rosterStatus: nominated },
      { name: "Pavel Sulc", nationalTeam: "Czech Republic", aliases: ["Pavel Šulc"], rosterStatus: nominated },
      { name: "Jude Bellingham", nationalTeam: "England", rosterStatus: nominated },
      { name: "Edson Alvarez", nationalTeam: "Mexico", aliases: ["Edson Álvarez"], rosterStatus: nominated },
      { name: "Tyler Adams", nationalTeam: "United States", rosterStatus: nominated },
      { name: "Alexander Isak", nationalTeam: "Sweden", rosterStatus: nominated },
      { name: "Oumar Diakite", nationalTeam: "Ivory Coast", aliases: ["Oumar Diakité"], rosterStatus: nominated },
      { name: "Jonathan David", nationalTeam: "Canada", rosterStatus: nominated }
    ]
  },
  {
    owner: "Kim",
    color: "#0891b2",
    players: [
      { name: "Edmilson Junior", nationalTeam: "Qatar", rosterStatus: nominated },
      { name: "Marcus Rashford", nationalTeam: "England", rosterStatus: nominated },
      { name: "Cedric Bakambu", nationalTeam: "DR Congo", aliases: ["Cédric Bakambu"], rosterStatus: nominated },
      { name: "Pavel Sulc", nationalTeam: "Czech Republic", aliases: ["Pavel Šulc"], rosterStatus: nominated },
      { name: "Lukas Provod", nationalTeam: "Czech Republic", aliases: ["Lukáš Provod"], rosterStatus: nominated },
      { name: "Timothy Weah", nationalTeam: "United States", rosterStatus: nominated },
      { name: "Damian Bobadilla", nationalTeam: "Paraguay", aliases: ["Damián Bobadilla"], rosterStatus: nominated },
      { name: "David Raum", nationalTeam: "Germany", rosterStatus: nominated },
      { name: "Mathieu Choiniere", nationalTeam: "Canada", aliases: ["Mathieu Choinière"], rosterStatus: nominated },
      { name: "Aaron Wan-Bissaka", nationalTeam: "DR Congo", rosterStatus: nominated }
    ]
  },
  {
    owner: "Melli",
    color: "#db2777",
    players: [
      { name: "Youri Tielemans", nationalTeam: "Belgium", rosterStatus: nominated },
      { name: "Alexis Mac Allister", nationalTeam: "Argentina", rosterStatus: nominated },
      { name: "Jeremy Doku", nationalTeam: "Belgium", aliases: ["Jérémy Doku"], rosterStatus: nominated },
      { name: "Mario Pasalic", nationalTeam: "Croatia", aliases: ["Mario Pašalić"], rosterStatus: nominated },
      { name: "Mohamed El Shenawy", nationalTeam: "Egypt", position: "goalkeeper", rosterStatus: nominated },
      { name: "Micky van de Ven", nationalTeam: "Netherlands", rosterStatus: nominated },
      { name: "Adrien Rabiot", nationalTeam: "France", rosterStatus: nominated },
      { name: "Daniel Svensson", nationalTeam: "Sweden", rosterStatus: nominated },
      { name: "Lyle Foster", nationalTeam: "South Africa", rosterStatus: nominated },
      { name: "Krepin Diatta", nationalTeam: "Senegal", aliases: ["Krépin Diatta"], rosterStatus: nominated },
      { name: "Elias Saad", nationalTeam: "Tunisia", rosterStatus: nominated }
    ]
  },
  {
    owner: "Peer",
    color: "#ea580c",
    players: [
      { name: "Goncalo Ramos", nationalTeam: "Portugal", aliases: ["Gonçalo Ramos"], rosterStatus: nominated },
      { name: "Jhon Arias", nationalTeam: "Colombia", rosterStatus: nominated },
      { name: "Mohanad Ali", nationalTeam: "Iraq", rosterStatus: nominated },
      { name: "Alejandro Garnacho", nationalTeam: "Argentina", rosterStatus: notNominated },
      { name: "Lucas Paqueta", nationalTeam: "Brazil", aliases: ["Lucas Paquetá"], rosterStatus: nominated },
      { name: "Ruben Vargas", nationalTeam: "Switzerland", rosterStatus: nominated },
      { name: "Antonio Nusa", nationalTeam: "Norway", rosterStatus: nominated },
      { name: "Desire Doue", nationalTeam: "France", aliases: ["Désiré Doué", "Desiré Doué"], rosterStatus: nominated },
      { name: "Ben Doak", nationalTeam: "Scotland", aliases: ["Ben Gannon-Doak"], rosterStatus: nominated },
      { name: "Sayfallah Ltaief", nationalTeam: "Tunisia", rosterStatus: notNominated }
    ]
  },
  {
    owner: "Marco",
    color: "#64748b",
    players: [
      { name: "Goncalo Ramos", nationalTeam: "Portugal", aliases: ["Gonçalo Ramos"], rosterStatus: nominated },
      { name: "Jhon Arias", nationalTeam: "Colombia", rosterStatus: nominated },
      { name: "Mohanad Ali", nationalTeam: "Iraq", rosterStatus: nominated },
      { name: "Alejandro Garnacho", nationalTeam: "Argentina", rosterStatus: notNominated },
      { name: "Lucas Paqueta", nationalTeam: "Brazil", aliases: ["Lucas Paquetá"], rosterStatus: nominated },
      { name: "Ruben Vargas", nationalTeam: "Switzerland", rosterStatus: nominated },
      { name: "Antonio Nusa", nationalTeam: "Norway", rosterStatus: nominated },
      { name: "Desire Doue", nationalTeam: "France", aliases: ["Désiré Doué", "Desiré Doué"], rosterStatus: nominated },
      { name: "Ben Doak", nationalTeam: "Scotland", aliases: ["Ben Gannon-Doak"], rosterStatus: nominated },
      { name: "Sayfallah Ltaief", nationalTeam: "Tunisia", rosterStatus: notNominated }
    ]
  }
];
