import Web3 from "web3";
import type { Contract } from "web3";
import { generateWallet, toEther, toWei, writeData } from "./utils";
import { CreatedWallet, WalletHistory } from "./structure";

const DEX_ABI = await Bun.file("./abi/dex.json").json();
const ERC20_ABI = await Bun.file("./abi/erc20.json").json();
const SEED_PHRASE = process.env.SEED_PHRASE as string;

const DEX_ROUTER_CONTRACT_ADDRESS = process.env.DEX_ROUTER_CONTRACT_ADDRESS as string;
const WEB3_PROVIDER_URI = process.env.WEB3_PROVIDER_URI as string;
const PRIMARY_TOKEN_CONTRACT_ADDRESS = process.env.PRIMARY_TOKEN_CONTRACT_ADDRESS as string;
const SECONDARY_TOKEN_CONTRACT_ADDRESS = process.env.SECONDARY_TOKEN_CONTRACT_ADDRESS as string;
const PAIR_POOL_ADDRESS = process.env.PAIR_POOL_ADDRESS as string;
const MIN_INVESTMENT = Number(process.env.MIN_INVESTMENT || 0.0001);
const MAX_INVESTMENT = Number(process.env.MAX_INVESTMENT || 0.01);
const MIN_COIN_BALANCE = Number(process.env.MIN_COIN_BALANCE || 0.0005);

let SAVE_WALLETS: WalletHistory[] = [];

const DATA_FILE = Bun.file("data.json");

if (await DATA_FILE.exists()) {
  SAVE_WALLETS = await DATA_FILE.json();
} else {
  await writeData(DATA_FILE, SAVE_WALLETS);
}

class Dex {
  router: Contract<any[]>;

  constructor(web3: Web3, dexRouterAddress: string) {
    this.router = new web3.eth.Contract(DEX_ABI, dexRouterAddress);
  }

  swapExactETHForTokens(
    fromToken: string,
    toToken: string,
    receiverAddress: string
  ): string {
    return (<any>this.router.methods.swapExactETHForTokens)(
      0,
      [fromToken, toToken],
      receiverAddress,
      new Date().getTime() + 1000 * 60 * 60 * 2
    ).encodeABI();
  }

  swapExactTokensForETH(
    amount: number,
    fromToken: string,
    toToken: string,
    receiverAddress: string
  ): string {
    return (<any>this.router.methods.swapExactTokensForETH)(
      toWei(amount),
      0, // probably edit here 'amountInMax'
      [fromToken, toToken],
      receiverAddress,
      new Date().getTime() + 1000 * 60 * 60 * 2
    ).encodeABI();
  }

  swapExactTokensForTokensSupportingFeeOnTransferTokens(
    amount: number,
    fromToken: string,
    toToken: string,
    receiverAddress: string
  ): string {
    return (<any>(
      this.router.methods.swapExactTokensForTokensSupportingFeeOnTransferTokens
    ))(
      toWei(amount),
      toWei(amount * 10),
      [fromToken, toToken],
      receiverAddress,
      new Date().getTime() + 1000 * 60 * 60 * 2
    ).encodeABI();
  }

  swapExactTokensForTokens(
    amount: number,
    fromToken: string,
    toToken: string,
    receiverAddress: string
  ): string {
    return (<any>this.router.methods.swapExactTokensForTokens)(
      amount,
      0,
      [fromToken, toToken],
      receiverAddress,
      new Date().getTime() + 1000 * 60 * 60 * 2
    ).encodeABI();
  }

  swapExactETHForTokensSupportingFeeOnTransferTokens(
    fromToken: string,
    toToken: string,
    receiverAddress: string
  ): string {
    return (<any>(
      this.router.methods.swapExactETHForTokensSupportingFeeOnTransferTokens
    ))(
      0,
      [fromToken, toToken],
      receiverAddress,
      new Date().getTime() + 1000 * 60 * 60 * 2
    ).encodeABI();
  }
}

class Utils {
  web3: Web3;
  constructor(web3: Web3) {
    this.web3 = web3;
  }

  // get an address coin balance
  async getCoinBalance(wallet: string) {
    return this.web3.eth.getBalance(wallet);
  }
}

class Erc20 {
  token: Contract<any[]>;
  constructor(web3: Web3, contractAddress: string) {
    this.token = new web3.eth.Contract(ERC20_ABI, contractAddress);
  }

  async balanceOf(owner: string) {
    return await (<any>this.token.methods.balanceOf)(owner).call();
  }

  async totalSupply() {
    return await (<any>this.token.methods.totalSupply)().call();
  }

  async name() {
    return await (<any>this.token.methods.name)().call();
  }

  async decimals() {
    return await (<any>this.token.methods.decimals)().call();
  }

  approve(spender: string, amount: number): string {
    return (<any>this.token.methods.approve)(spender, amount).encodeABI();
  }

  transfer(spender: string, amount: number): string {
    return (<any>this.token.methods.transfer)(
      spender,
      toWei(amount)
    ).encodeABI();
  }

  async allowance(owner: string, spender: string) {
    return await (<any>this.token.methods.approve)(owner, spender).call();
  }
}

class BlockchainWriter {
  web3: Web3;

  constructor(web3: Web3) {
    this.web3 = web3;
  }

  // deploy transaction to the blockchain
  async executeTransaction(
    data: string,
    receiverAddress: string,
    privateKey: string,
    tx: object = {}
  ) {
    const gasPrice = await this.web3.eth.getGasPrice();
    const wallet = this.web3.eth.accounts.privateKeyToAccount(privateKey);

    const txSetting: { [key: string]: any } = {
      from: wallet.address,
      nonce: await this.web3.eth.getTransactionCount(wallet.address),
      receiverAddress,
      data,
      gasPrice,
      ...tx,
    };

    txSetting.gas = await this.web3.eth.estimateGas(txSetting);
    const sig = await wallet.signTransaction(txSetting);
    const transaction = await this.web3.eth.sendSignedTransaction(
      sig.rawTransaction
    );
    return transaction;
  }
}

export class Charter {
  web3: Web3;

  dexRouter: Dex;
  primaryTokenContract: Erc20;
  secondaryTokenContract: Erc20;
  utils: Utils;
  blockchainWriter: BlockchainWriter;

  constructor(
  ) {
    this.web3 = new Web3(WEB3_PROVIDER_URI);
    this.utils = new Utils(this.web3);
    this.dexRouter = new Dex(this.web3, DEX_ROUTER_CONTRACT_ADDRESS);
    this.primaryTokenContract = new Erc20(this.web3, PRIMARY_TOKEN_CONTRACT_ADDRESS);
    this.secondaryTokenContract = new Erc20(this.web3, SECONDARY_TOKEN_CONTRACT_ADDRESS);
    this.blockchainWriter = new BlockchainWriter(this.web3);
  }

  // buy token from dex exchange
  async buyToken(amount: number, privateKey: string) {
    const wallet = this.web3.eth.accounts.privateKeyToAccount(privateKey);
    const walletAddress = wallet.address;

    // check if the wallet has given allowance to the dex router
    // else approve totalSupply (to save gas cost on the long run)
    const allowance = toEther(
      await this.primaryTokenContract.allowance(
        walletAddress,
        DEX_ROUTER_CONTRACT_ADDRESS
      )
    );
    if (allowance < amount) {
      const approveData = this.primaryTokenContract.approve(
        DEX_ROUTER_CONTRACT_ADDRESS,
        await this.primaryTokenContract.totalSupply()
      );

      const approveTransaction = await this.blockchainWriter.executeTransaction(
        approveData,
        PRIMARY_TOKEN_CONTRACT_ADDRESS,
        privateKey
      );
      console.log(approveTransaction);
    }

    // sign trade signature
    const data = this.dexRouter.swapExactETHForTokens(
      PRIMARY_TOKEN_CONTRACT_ADDRESS,
      SECONDARY_TOKEN_CONTRACT_ADDRESS,
      walletAddress
    );

    // send the transaction to the blockchain
    const transaction = await this.blockchainWriter.executeTransaction(
      data,
      walletAddress,
      privateKey,
      { value: toWei(amount) }
    );

    console.log("bought to from dex");
    console.log(transaction);

    // update the transaction history incase the script need gas
    SAVE_WALLETS = await Promise.all(
      SAVE_WALLETS.map(async (w) => {
        if (w.address == wallet.address) {
          w.tokenBalance = toEther(
            await this.secondaryTokenContract.balanceOf(walletAddress)
          );
        }
        return w;
      })
    );

    // write history to disk incase of obstacle
    await writeData(DATA_FILE, SAVE_WALLETS);
  }

  async sellToken(currentWallet: CreatedWallet, seller: WalletHistory) {
    // get the token balance of the address that is about
    // to make the trade (we can't rely on the hard coded value)
    const tokenBalance = toEther(
      await this.utils.getCoinBalance(seller.address)
    );

    const data = this.dexRouter.swapExactTokensForETH(
      tokenBalance,
      SECONDARY_TOKEN_CONTRACT_ADDRESS,
      PRIMARY_TOKEN_CONTRACT_ADDRESS,
      currentWallet.address
    );

    // send the balance of the current connected address
    const etherBalance = toEther(
      await this.utils.getCoinBalance(currentWallet.address)
    );
    await this.sendCoin(currentWallet.privateKey, seller.address, etherBalance);

    console.log(
      `sent ${etherBalance} from: ${currentWallet.address} to: ${seller.address}`
    );

    // excute the trade after the current wallet balance has
    // been sent to the address making the trade (meaning the addrss
    // has enough coin to cover for gas fee now)
    const transaction = await this.blockchainWriter.executeTransaction(
      data,
      DEX_ROUTER_CONTRACT_ADDRESS,
      seller.privateKey
    );
    console.log("sold tokens");
    console.log(transaction);

    // update the wallet balance and write to disk
    SAVE_WALLETS = SAVE_WALLETS.map((w) => {
      if (w.address == seller.address) {
        w.tokenBalance = 0;
      }
      return w;
    });
    await writeData(DATA_FILE, SAVE_WALLETS);
  }

  // tranfer token to another address
  async sendToken(
    tokenContract: Erc20,
    receiverAddress: string,
    amount: number,
    privateKey: string
  ) {
    const data = tokenContract.transfer(receiverAddress, amount);
    const transaction = await this.blockchainWriter.executeTransaction(
      data,
      (tokenContract.token as any).address as string,
      privateKey
    );
    return transaction;
  }

  // tranfer coin to another address
  async sendCoin(privateKey: string, receiverAddress: string, amount: number) {
    const wallet = this.web3.eth.accounts.privateKeyToAccount(privateKey);

    const gasPrice = await this.web3.eth.getGasPrice();

    const txSetting: { [key: string]: any } = {
      from: wallet.address,
      nonce: await this.web3.eth.getTransactionCount(wallet.address),
      receiverAddress,
      gasPrice,
      value: "0",
    };

    // calculate and remove the transaction cost from the user balance before sending
    txSetting.gas = await this.web3.eth.estimateGas(txSetting);
    const gasCost = gasPrice * txSetting.gas;

    txSetting.value = this.web3.utils.toWei(
      (amount - Number(this.web3.utils.fromWei(gasCost, "ether"))).toString(),
      "ether"
    );
    // sign the transaction from the old wallet, permiting the transfer of all balance
    const sig = await wallet.signTransaction(txSetting);

    // broadcast the transaction on the blockchain, confirming the signature
    await this.web3.eth.sendSignedTransaction(sig.rawTransaction);
  }

  // this will create a new wallet and send the balance of the old
  // wallet to this one to trade, after trading, the new wallet will
  // repeate the cicle
  async daemon(walletInfo: WalletHistory) {
    let walletCoinBalance = toEther(
      await this.utils.getCoinBalance(walletInfo.address)
    );

    // check if the current wallet have more than the minimum  coin required
    // else sell the token of the rest bought and send the coin to this address
    if (walletCoinBalance <= MIN_COIN_BALANCE) {
      const walletsWithToken = SAVE_WALLETS.filter((w) =>
        w.tokenBalance > 0 ? w : undefined
      );

      // sell all the bought tokens and send the coin to the current wallet
      for (const sellerWallet of walletsWithToken) {
        await this.sellToken(walletInfo, sellerWallet);
      }
    }

    const investment: number = 2; // generate random amount within user balance to invest

    // execute the buy order
    await this.buyToken(investment, walletInfo.privateKey);

    // update wallet data and write to disk
    walletInfo.tokenBalance = toEther(
      await this.secondaryTokenContract.balanceOf(walletInfo.address)
    );
    walletInfo.poolBalance = toEther(
      await this.utils.getCoinBalance(PAIR_POOL_ADDRESS)
    );
    walletInfo.bnbBalance = toEther(
      await this.utils.getCoinBalance(walletInfo.address)
    );

    SAVE_WALLETS.push(walletInfo);
    await writeData(DATA_FILE, SAVE_WALLETS);

    // generate new wallet and start the process again
    walletInfo = {
      ...walletInfo,
      ...(await generateWallet(SEED_PHRASE, walletInfo.index + 1)),
    };

    // wait for some time before restarting the process with the new wallet
    const waitTime = 500000;

    // restart the process again
    const reRunDaemon = async () => {
      await this.daemon(walletInfo);
    };
    setTimeout(reRunDaemon.bind(this), waitTime);
  }
}
