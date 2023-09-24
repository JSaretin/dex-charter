import { WalletHistory } from "./structure";
import { Charter } from "./trader";
import { generateWallet, toEther, writeData } from "./utils";

const SEED_PHRASE = process.env.SEED_PHRASE as string;

let SAVE_WALLETS: WalletHistory[] = [];
const DATA_FILE = Bun.file("data.json");

if (await DATA_FILE.exists()) {
  SAVE_WALLETS = await DATA_FILE.json();
} else {
  await writeData(DATA_FILE, SAVE_WALLETS);
}

const charter = new Charter(SEED_PHRASE, SAVE_WALLETS, DATA_FILE);

const genesisWallet = await generateWallet(
  SEED_PHRASE,
  SAVE_WALLETS[SAVE_WALLETS.length - 1]?.index ?? 0
);

// start deamon
await charter.daemon({
  ...genesisWallet,
  bnbBalance: 0,
  poolBalance: 0,
  tokenBalance: 0,
});
