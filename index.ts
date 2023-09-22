import { HDNodeWallet } from "ethers";
import Web3 from "web3";

interface CreatedWallet {
  privateKey: string;
  address: string;
}

const SEED_PHRASE = process.env.SEED_PHRASE as string;
const DEX_ABI = await Bun.file("./abi/dex.json").json();
const ERC20_ABI = await Bun.file("./abi/erc20.json").json();
const DEX_ROUTER_ADDR = process.env.DEX_ROUTER_ADDR as string;
const PROVIDER_URI = process.env.PROVIDER_URI as string;

const w3 = new Web3(PROVIDER_URI);

const DEX_CONTRACT = new w3.eth.Contract(DEX_ABI, DEX_ROUTER_ADDR);

function status(oldBalance: number, newBalance: number): -1 | 0 | 1 {
  if (newBalance > oldBalance) return 1;
  if (newBalance < oldBalance) return -1;
  return 0;
}

async function generateTradeData(
  wallet: string,
  baseToken: string,
  receiveToken: string,
  amount: number
): Promise<string> {
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

async function trade(
  privateKey: string,
  baseToken: string,
  receiveToken: string,
  amount: number
) {
  const wallet = w3.eth.accounts.privateKeyToAccount(privateKey);

  const data = await generateTradeData(
    wallet.address,
    baseToken,
    receiveToken,
    amount
  );

  const contract = new w3.eth.Contract(ERC20_ABI, baseToken);
  const allowance = await (contract.methods.allowance as any)(
    wallet.address,
    DEX_ROUTER_ADDR
  ).call();

  // if amount to trade is greater the the allowance, approve totalSupply to
  // the DEX contract (this will save us gas in the long run since these are just
  // dummy accounts that we will not be using to hold for long)
  if (allowance < w3.utils.toWei(amount.toString(), "ether")) {
    const totalSupply = await (contract.methods.totalSupply as any)().call();
    const approveData = (contract.methods.approve as any)(
      DEX_ROUTER_ADDR,
      totalSupply
    ).encodeABI();
    const approveTransaction = await executeTransaction(
      approveData,
      baseToken,
      privateKey
    );
    console.log(approveTransaction);
  }

  const transaction = await executeTransaction(
    data,
    DEX_ROUTER_ADDR,
    privateKey
  );
  console.log(transaction);
}

async function sendCoin(privateKey: string, to: string, amount: number) {}

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
}

async function generateWallet(
  seed: string,
  index: number = 0
): Promise<CreatedWallet> {
  const oracle = HDNodeWallet.fromPhrase(seed) as HDNodeWallet;
  const wallet = oracle.deriveChild(index);
  return {
    privateKey: wallet.privateKey,
    address: wallet.address,
  };
}

const w = await generateWallet(SEED_PHRASE);
// console.log(w)

sendToken(
  "0xe9e7cea3dedca5984780bafc599bd69add087d56",
  w.privateKey,
  "0x5A568d8280d499083F6b1BF1D4B546ac24486948",
  0
);

// for (let i = 0; i < 10; i++) {
//   const w = await generateWallet(SEED_PHRASE, i);
//   console.log(w);
// }
