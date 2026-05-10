// ELLA startup banner — truecolor ANSI
// Colors: orchid/plum body, mauve shadows, rose highlights, gold eyes

const R = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
const RESET = "\x1b[0m";

// Palette
const ORCHID  = R(186, 85, 211);
const PLUM    = R(142, 69, 173);
const MAUVE   = R(100, 60, 120);
const ROSE    = R(255, 130, 180);
const GOLD    = R(255, 200, 80);
const LAVEND  = R(210, 170, 240);
const DIM     = R(120, 80, 140);
const WHITE   = R(240, 240, 240);

// Each line: [color, text] segments
type Seg = [string, string];
type Line = Seg[];

const ART: Line[] = [
  [[MAUVE, "@@@@@@@@@@@@@@@@@@@@@@@@@@#+::::::=@@@@@@@@@@@@@@@"]],
  [[MAUVE, "@@@@@@@@@@@@@@@@@@@@@#++**:.:=-.::..#@@@@@@@@@@@@@"]],
  [[MAUVE, "@@@@@@@@@@@@@@@@@@@+..::....::...  ."], [ORCHID, "%*"], [MAUVE, "@@@@@@@@@@@@"]],
  [[MAUVE, "@@@@@@@@@@@@@@@@@#:---. ...:-:....-"], [PLUM, "%%"], [MAUVE, "@@@@@@@@@@@@@"]],
  [[MAUVE, "@@@@@@@@@@@@@@@@-..:---"], [ORCHID, "*%%%+"], [MAUVE, "::..:.:#@@"], [PLUM, "%%%"], [MAUVE, "@@@@@@@@@"]],
  [[MAUVE, "@@@@@@@@@@#@@@@@@..::-"], [ORCHID, "*%%+=#*+"], [MAUVE, ".....+@@"], [PLUM, "%%%"], [MAUVE, "@@@@@@@@@"]],
  [[MAUVE, "@@@@@@@@@@*%%@@+.:-.-=+"], [ORCHID, "#%#*="], [MAUVE, " ++:+#:#@"], [PLUM, "%#"], [MAUVE, "@@@@@@@@@"], [PLUM, "%*"], [MAUVE, "@@@@"]],
  [[MAUVE, "@@@@@@@@@@@@@@@#+:...=="], [ORCHID, "=%###**"], [MAUVE, "::-:"], [GOLD, "%@@"], [MAUVE, "+#@@%@+"], [PLUM, "%%"], [MAUVE, "@@@@"]],
  [[MAUVE, "@@@@@@%%@@@@@@@@@+::.-"], [ORCHID, "*##*##++*="], [MAUVE, ":+"], [GOLD, "@%**%"], [MAUVE, "@@@@@@@@@@@"]],
  [[MAUVE, "@@@@@@-::::--+@@="], [LAVEND, "%=:@@-"], [WHITE, " . -:-::"], [MAUVE, ".#@@%*##@@@@@@@@@@@"]],
  [[MAUVE, "@@@@@@@:::-::-#@@@"], [LAVEND, "%+*@-.::..::::"], [MAUVE, ".@=+:@@@@%@@%@@@@@"]],
  [[MAUVE, "@@@@@@@%-::-::="], [PLUM, "%@@@@%-::--:..:=:-:."], [MAUVE, ".*@@@@@@@@@@@@@"]],
  [[MAUVE, "@@@@@@%@*--+=-:*@@@#....:-:.........@@#@@@@@@@@@@@"]],
  [[MAUVE, "@@@@@@@@@@@%*+=-:...::..:=--."], [ROSE, "#"], [MAUVE, "....-%@++===+++%@@@@"]],
  [[MAUVE, "@@@@@@@@@@@@@@@*=...-.:.::=--:-@@@@@@=++=====#@@@@"]],
  [[MAUVE, "@@@@@@@@@@@%@@@@@@+ .....:.:::.-%@@@========*@@@@@"]],
  [[MAUVE, "@@@@@@@@##@%%+@@@@=... ..:....:-%@@@@@@@@@@@"], [PLUM, "%%%"], [MAUVE, "@@@@@"]],
  [[MAUVE, "@@@@@@@@@@@@@@@@@@@:... .:::-:"], [ORCHID, "#@@@%"], [MAUVE, "@@@@@@@@@@@@@@@"]],
  [[MAUVE, "@@@@@@@@@@@@@@@@@@@=....#:::.."], [GOLD, "#*@@@@"], [MAUVE, "@@@@@@@@@@@@@@"]],
];

export function bannerString(): string {
  let out = "\n";
  for (const line of ART) {
    for (const [color, text] of line) out += color + text;
    out += RESET + "\n";
  }
  out += "\n";
  out += ORCHID + "  ELLA" + RESET + "  " + DIM + "agentic coding assistant" + RESET + "\n";
  return out;
}

export function printBanner(): void {
  process.stdout.write(bannerString() + "\n");
}
