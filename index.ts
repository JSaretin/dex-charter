import { BunFile } from "bun";
import { HDNodeWallet } from "ethers";
import Web3 from "web3";

interface CreatedWallet {
  privateKey: string;
  address: string;
  index: number;
}

const SEED_PHRASE = process.env.SEED_PHRASE as string;
const DEX_ABI = await Bun.file("./abi/dex.json").json();
const ERC20_ABI = await Bun.file("./abi/erc20.json").json();
const DEX_ROUTER_ADDR = process.env.DEX_ROUTER_ADDR as string;
const PROVIDER_URI = process.env.PROVIDER_URI as string;
const QUOTE_TOKEN_ADDRESS = process.env.QUOTE_TOKEN_ADDRESS as string;
const BASE_TOKEN_ADDRESS = process.env.BASE_TOKEN_ADDRESS as string;
const PAIR_POOL_ADDRESS = process.env.PAIR_POOL_ADDRESS as string;
const MIN_INVESTMENT = Number(process.env.MIN_INVESTMENT || 0.0001);
const MAX_INVESTMENT = Number(process.env.MAX_INVESTMENT || 0.01);

// Leave this amount so the script can see the previous buy for gas
const MIN_BALANCE = Number(process.env.MIN_BALANCE || 0.0005);

const w3 = new Web3(PROVIDER_URI);

const DEX_CONTRACT = new w3.eth.Contract(DEX_ABI, DEX_ROUTER_ADDR);

let SAVE_WALLETS: CreatedWallet[] = [];

const DATA_FILE = Bun.file("data.json");
if (await DATA_FILE.exists()) {
  SAVE_WALLETS = await DATA_FILE.json();
} else {
  await writeData(DATA_FILE, SAVE_WALLETS);
}

function generateInvestment(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function getStatus(oldBalance: number, newBalance: number): -1 | 0 | 1 {
  if (newBalance > oldBalance) return 1;
  if (newBalance < oldBalance) return -1;
  return 0;
}

// write data to disk file
async function writeData(path: BunFile, data: object) {
  await Bun.write(path, JSON.stringify(data));
}

// generate trade data to sign transaction
function generateTradeData(
  wallet: string,
  baseToken: string,
  receiveToken: string,
  amount: number
): string {
  const data = (
    DEX_CONTRACT.methods
      .swapExactTokensForTokensSupportingFeeOnTransferTokens as any
  )(
    w3.utils.toWei(amount.toString(), "ether"),
    0,
    [baseToken, receiveToken],
    wallet,
    new Date().getTime() + 1000 * 60 * 60 * 2
  ).encodeABI();

  return data;
}

// deploy transaction to the blockchain
async function executeTransaction(
  data: string,
  to: string,
  privateKey: string
) {
  const gasPrice = await w3.eth.getGasPrice();
  const wallet = w3.eth.accounts.privateKeyToAccount(privateKey);

  const txSetting: { [key: string]: any } = {
    from: wallet.address,
    nonce: await w3.eth.getTransactionCount(wallet.address),
    to,
    data,
    gasPrice,
  };

  txSetting.gas = await w3.eth.estimateGas(txSetting);
  const sig = await wallet.signTransaction(txSetting);
  const transaction = await w3.eth.sendSignedTransaction(sig.rawTransaction);
  return transaction;
}

async function getTokenBalance(
  contractAddr: string,
  owner: string
): Promise<number> {
  const contract = new w3.eth.Contract(ERC20_ABI, contractAddr);
  const balance = await (contract.methods.balanceOf as any)(owner).call();
  return balance;
}

async function trade(
  privateKey: string,
  quoteTokenAddress: string,
  baseTokenAddress: string,
  amount: number
) {
  const wallet = w3.eth.accounts.privateKeyToAccount(privateKey);

  const contract = new w3.eth.Contract(ERC20_ABI, quoteTokenAddress);
  const baseBalance = await getTokenBalance(quoteTokenAddress, wallet.address);
  if (Number(w3.utils.fromWei(baseBalance, "ether")) < amount) {
    console.log(
      `Not enough balance to trade\nBalance: ${w3.utils.fromWei(
        baseBalance,
        "ether"
      )} BNB\nRequired: ${amount} BNB`
    );
    return;
  }

  const allowance = await (contract.methods.allowance as any)(
    wallet.address,
    DEX_ROUTER_ADDR
  ).call();

  // if amount to trade is greater the the allowance, approve totalSupply to
  // the DEX contract (this will save us gas in the long run since these are just
  // dummy accounts that we will not be using to hold for long)
  if (Number(w3.utils.fromWei(allowance, "ether")) < amount) {
    const totalSupply = await (contract.methods.totalSupply as any)().call();
    const approveData = (contract.methods.approve as any)(
      DEX_ROUTER_ADDR,
      totalSupply
    ).encodeABI();

    const approveTransaction = await executeTransaction(
      approveData,
      quoteTokenAddress,
      privateKey
    );
    console.log(approveTransaction);
  }

  const data = generateTradeData(
    wallet.address,
    quoteTokenAddress,
    baseTokenAddress,
    amount
  );

  const transaction = await executeTransaction(
    data,
    DEX_ROUTER_ADDR,
    privateKey
  );
  console.log(transaction);
}

async function sendCoin(privateKey: string, to: string, amount: number) {
  const wallet = w3.eth.accounts.privateKeyToAccount(privateKey);

  const gasPrice = await w3.eth.getGasPrice();

  const txSetting: { [key: string]: any } = {
    from: wallet.address,
    nonce: await w3.eth.getTransactionCount(wallet.address),
    to,
    gasPrice,
    value: "0",
  };

  // calculate and remove the transaction cost from the user balance before sending
  txSetting.gas = await w3.eth.estimateGas(txSetting);
  const gasCost = gasPrice * txSetting.gas;

  txSetting.value = w3.utils.toWei(
    (amount - Number(w3.utils.fromWei(gasCost, "ether"))).toString(),
    "ether"
  );
  // sign the transaction from the old wallet, permiting the transfer of all balance
  const sig = await wallet.signTransaction(txSetting);

  // broadcast the transaction on the blockchain, confirming the signature
  await w3.eth.sendSignedTransaction(sig.rawTransaction);
}

async function sendToken(
  contractAddr: string,
  privateKey: string,
  to: string,
  amount: number
) {
  const contract = new w3.eth.Contract(ERC20_ABI, contractAddr);
  const data = (contract.methods.transfer as any)(
    to,
    w3.utils.toWei(amount.toString(), "ether")
  ).encodeABI();

  const transaction = await executeTransaction(data, contractAddr, privateKey);
  return transaction;
}

async function generateWallet(
  seed: string,
  index: number = 0
): Promise<CreatedWallet> {
  const oracle = HDNodeWallet.fromPhrase(seed) as HDNodeWallet;
  const wallet = oracle.deriveChild(index);

  const newWallet = {
    privateKey: wallet.privateKey,
    address: wallet.address,
    index: wallet.index,
  };
  return newWallet;
}

async function executeTrade(
  poolBalance: number,
  poolAddress: string,
  privateKey: string,
  quoteToken: string,
  baseToken: string,
  amount: number
) {
  // save base quote balance
  const newBalance = Number(
    w3.utils.fromWei(await getTokenBalance(quoteToken, poolAddress), "ether")
  );

  // check if the new balance is different from the old balance

  const status = getStatus(poolBalance, newBalance);

  switch (status) {
    case -1: // someone sold their token
      break;
    case 1: // someone invested
      break;

    default: // balance is the same
      await trade(privateKey, quoteToken, baseToken, amount);
      break;
  }

  return await getTokenBalance(quoteToken, poolAddress);
}

// this will create a new wallet and send the balance of the old
// wallet to this one to trade, after trading, the new wallet will
// repeate the cicle
async function startDexCharter(
  walletInfo: CreatedWallet & { poolBalance: number }
) {
  const toInvest = 0.01;
  const etherBalance = await w3.eth.getBalance(walletInfo.address);
  const formatedBalance = Number(w3.utils.fromWei(etherBalance, "ether"));

  console.log(`Balance: ${formatedBalance} BNB\nTo Invest: ${toInvest}`);

  if (
    formatedBalance <= MIN_BALANCE ||
    formatedBalance - toInvest < MIN_BALANCE
  ) {
    // Sell some of the invested token to get gas for trading
    console.log("balance is too load, selling some to get gas");
    return;
  }

  const newPoolQuoteBalance = Number(
    w3.utils.fromWei(
      await getTokenBalance(QUOTE_TOKEN_ADDRESS, PAIR_POOL_ADDRESS),
      "ether"
    )
  );

  if (newPoolQuoteBalance < walletInfo.poolBalance) {
    // some one sold, and the maket is down
    console.log("market is down");
  } else if (newPoolQuoteBalance > walletInfo.poolBalance) {
    // someone bought, and the market is up, we will sell to increase our gas
    console.log("market is up");
  } else {
    // market is the same, nothing changed
    console.log("market unchanged");
  }

  // execute trade here, this is were we call our charter to do the buying or selling
  // before turning the balance of the current trader to a new trader

  console.log("initializing new trade");
  await trade(
    walletInfo.privateKey,
    QUOTE_TOKEN_ADDRESS,
    BASE_TOKEN_ADDRESS,
    toInvest
  );

  // save the new balance to compare before making the next trade
  walletInfo.poolBalance = Number(
    w3.utils.fromWei(
      await getTokenBalance(QUOTE_TOKEN_ADDRESS, PAIR_POOL_ADDRESS),
      "ether"
    )
  );

  // create a new wallet and tranfer the old wallet balance
  const newWallet = await generateWallet(SEED_PHRASE, walletInfo.index + 1);

  const tokenBalance = Number(
    w3.utils.fromWei(
      await getTokenBalance(QUOTE_TOKEN_ADDRESS, walletInfo.address),
      "ether"
    )
  );

  if (tokenBalance > 0) {
    console.log("tranfer all quote token to new address");

    await sendToken(
      QUOTE_TOKEN_ADDRESS,
      walletInfo.privateKey,
      newWallet.address,
      tokenBalance
    );
  }

  const coinBalance = Number(
    w3.utils.fromWei(await w3.eth.getBalance(walletInfo.address), "ether")
  );

  if (coinBalance < MIN_BALANCE) {
    console.log("remaining balance is less then the minimum required balance");
    // sell so token to keep up
  }

  // transfer all balance to new address
  console.log(
    `sending \nAmount: ${coinBalance} BNB \nFrom: ${walletInfo.address}\nTo: ${newWallet.address}`
  );
  await sendCoin(walletInfo.privateKey, newWallet.address, coinBalance);

  // save the old wallet to file
  SAVE_WALLETS.push(walletInfo);
  await writeData(DATA_FILE, SAVE_WALLETS);

  // start the cicle again for the new wallet
  setTimeout(async () => {
    startDexCharter({ ...walletInfo, ...newWallet });
  }, 5000);
}

const lastWalletIndex = SAVE_WALLETS.at(-1)?.index ?? 0;

// generate new wallet with the given seed and start the trading process
let genesisWallet = await generateWallet(SEED_PHRASE, lastWalletIndex + 1);

await startDexCharter({
  ...genesisWallet,
  poolBalance: Number(
    w3.utils.fromWei(
      await getTokenBalance(QUOTE_TOKEN_ADDRESS, PAIR_POOL_ADDRESS),
      "ether"
    )
  ),
});
