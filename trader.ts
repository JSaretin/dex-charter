import Web3 from "web3";
import type { Contract } from "web3";

import {
  generateNumber,
  generateWallet,
  toEther,
  toWei,
  writeData,
} from "./utils";
import { CreatedWallet, WalletHistory } from "./structure";
import { BunFile } from "bun";

const DEX_ABI = await Bun.file("./abi/dex.json").json();
const ERC20_ABI = await Bun.file("./abi/erc20.json").json();

const DEX_ROUTER_CONTRACT_ADDRESS = process.env
  .DEX_ROUTER_CONTRACT_ADDRESS as string;
const WEB3_PROVIDER_URI = process.env.WEB3_PROVIDER_URI as string;
const PRIMARY_TOKEN_CONTRACT_ADDRESS = process.env
  .PRIMARY_TOKEN_CONTRACT_ADDRESS as string;
const SECONDARY_TOKEN_CONTRACT_ADDRESS = process.env
  .SECONDARY_TOKEN_CONTRACT_ADDRESS as string;
const PAIR_POOL_ADDRESS = process.env.PAIR_POOL_ADDRESS as string;
const MIN_INVESTMENT = Number(process.env.MIN_INVESTMENT || 0.0001);
const MAX_INVESTMENT = Number(process.env.MAX_INVESTMENT || 0.01);
const MIN_COIN_BALANCE = Number(process.env.MIN_COIN_BALANCE || 0.0005);

class Dex {
  router: Contract<any[]>;

  constructor(web3: Web3, dexRouterAddress: string) {
    this.router = new web3.eth.Contract(DEX_ABI, dexRouterAddress);
  }

  async getAmountsOut(amount: number, fromToken: string, toToken: string) {
    return await (<any>this.router.methods.getAmountsOut)(toWei(amount), [
      fromToken,
      toToken,
    ]).call();
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
    amountOut: number,
    fromToken: string,
    toToken: string,
    receiverAddress: string
  ): string {
    return (<any>this.router.methods.swapExactTokensForETH)(
      toWei(amount),
      toWei(amountOut), // probably edit here 'amountInMax'
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
      toWei(amount),
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
    const result = await (this.token.methods.allowance as any)(
      owner,
      spender
    ).call();
    return result;
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
    to: string,
    privateKey: string,
    tx: object = {}
  ) {
    const utils = new Utils(this.web3);
    const wallet = this.web3.eth.accounts.privateKeyToAccount(privateKey);
    const from = wallet.address

    const etherBalance = toEther(await utils.getCoinBalance(from));
    const gasPrice = await this.web3.eth.getGasPrice();
    const nonce = await this.web3.eth.getTransactionCount(from)

    const txSetting: { [key: string]: any } = {
      from,
      to,
      nonce,
      data,
      gasPrice,
      ...tx,
    };

    try {
      const gas = await this.web3.eth.estimateGas(txSetting);
      const gasCost = gas * gasPrice;

      const leftBalance = etherBalance - toEther(gasCost);
      if (leftBalance <= 0) return;

      // check if value is provided and calculate the balance - value

      const sig = await wallet.signTransaction(txSetting);
      const transaction = await this.web3.eth.sendSignedTransaction(
        sig.rawTransaction
      );
      return transaction;
    }
    catch (e) {
      console.log(e)
    }
  }
}

export class Charter {
  walletsData: WalletHistory[];
  dataFile: BunFile;
  seed: string;
  web3: Web3;
  dexRouter: Dex;
  primaryTokenContract: Erc20;
  secondaryTokenContract: Erc20;
  utils: Utils;
  blockchainWriter: BlockchainWriter;

  constructor(seed: string, walletsData: WalletHistory[], dataFile: BunFile) {
    this.seed = seed;
    this.walletsData = walletsData;
    this.dataFile = dataFile;
    this.web3 = new Web3(WEB3_PROVIDER_URI);
    this.web3.eth.handleRevert = true;
    this.utils = new Utils(this.web3);
    this.dexRouter = new Dex(this.web3, DEX_ROUTER_CONTRACT_ADDRESS);
    this.primaryTokenContract = new Erc20(
      this.web3,
      PRIMARY_TOKEN_CONTRACT_ADDRESS
    );
    this.secondaryTokenContract = new Erc20(
      this.web3,
      SECONDARY_TOKEN_CONTRACT_ADDRESS
    );
    this.blockchainWriter = new BlockchainWriter(this.web3);
  }

  // buy token from dex exchange
  async buyToken(amount: number, privateKey: string) {
    const wallet = this.web3.eth.accounts.privateKeyToAccount(privateKey);
    const walletAddress = wallet.address;

    // sign trade signature
    const data = this.dexRouter.swapExactETHForTokens(
      PRIMARY_TOKEN_CONTRACT_ADDRESS,
      SECONDARY_TOKEN_CONTRACT_ADDRESS,
      walletAddress
    );

    // send the transaction to the blockchain
    const transaction = await this.blockchainWriter.executeTransaction(
      data,
      DEX_ROUTER_CONTRACT_ADDRESS,
      privateKey,
      { value: toWei(amount) }
    );

    if (!transaction) {
      console.log('unable to execute buy trade')
      return;
    }

    console.log("bought to from dex");
    console.log(transaction);

    // update the transaction history incase the script need gas
    this.walletsData = await Promise.all(
      this.walletsData.map(async (w) => {
        if (w.address == wallet.address) {
          w.tokenBalance = toEther(
            await this.secondaryTokenContract.balanceOf(walletAddress)
          );
        }
        return w;
      })
    );

    // write history to disk incase of obstacle
    await writeData(this.dataFile, this.walletsData);
  }

  async sellToken(currentWallet: CreatedWallet, seller: WalletHistory) {
    // get the token balance of the address that is about
    // to make the trade (we can't rely on the hard coded value)
    const tokenBalance = toEther(await this.secondaryTokenContract.balanceOf(seller.address)) - 1;

    // check if the wallet has given allowance to the dex router
    // else approve totalSupply (to save gas cost on the long run)
    const allowance = toEther(
      await this.secondaryTokenContract.allowance(
        seller.address,
        DEX_ROUTER_CONTRACT_ADDRESS
      )
    );

    if (allowance < tokenBalance) {
      const approveData = this.secondaryTokenContract.approve(
        DEX_ROUTER_CONTRACT_ADDRESS,
        await this.secondaryTokenContract.totalSupply()
      );
      const approveTransaction = await this.blockchainWriter.executeTransaction(
        approveData,
        SECONDARY_TOKEN_CONTRACT_ADDRESS,
        seller.privateKey
      );
      if (!approveTransaction) {
        console.log('unable to approve')
        return;
      }
      console.log(approveTransaction);
    }

    const coinToReceive = toEther(
      (
        (await this.dexRouter.getAmountsOut(
          tokenBalance,
          SECONDARY_TOKEN_CONTRACT_ADDRESS,
          PRIMARY_TOKEN_CONTRACT_ADDRESS
        )) as number[]
      )[1]
    );

    console.log("bnb expected", coinToReceive);

    const data = this.dexRouter.swapExactTokensForTokens(
      tokenBalance,
      // coinToReceive,
      SECONDARY_TOKEN_CONTRACT_ADDRESS,
      PRIMARY_TOKEN_CONTRACT_ADDRESS,
      currentWallet.address
    );

    // excute the trade sell order
    const transaction = await this.blockchainWriter.executeTransaction(
      data,
      DEX_ROUTER_CONTRACT_ADDRESS,
      seller.privateKey
    );

    if (!transaction) {
      console.log('no transaction')
      return;
    }

    console.log("sold tokens");
    console.log(transaction);

    // transfer current balance to the current wallet
    const etherBalance = toEther(
      await this.utils.getCoinBalance(seller.address)
    );
    if (etherBalance > 0) {
      await this.sendCoinBalance(seller.privateKey, currentWallet.address);
      console.log(
        `sent ${etherBalance} from: ${seller.address} to: ${currentWallet.address}`
      );
    }

    // update the wallet balance and write to disk
    this.walletsData = this.walletsData.map((w) => {
      if (w.address == seller.address) {
        w.tokenBalance = 0;
      }
      return w;
    });
    await writeData(this.dataFile, this.walletsData);
  }


  // tranfer coin to another address
  async sendCoinBalance(privateKey: string, to: string) {
    const wallet = this.web3.eth.accounts.privateKeyToAccount(privateKey);
    const utils = new Utils(this.web3);
    const from = wallet.address;

    const etherBalance = toEther(await utils.getCoinBalance(from));
    const gasPrice = await this.web3.eth.getGasPrice();
    const nonce = await this.web3.eth.getTransactionCount(from);
    const txSetting: { [key: string]: any } = {
      from,
      to,
      nonce,
      gasPrice,
      value: "0"
    };

    // calculate and remove the transaction cost from the user balance before sending
    try {
      const gas = await this.web3.eth.estimateGas(txSetting);
      const gasCost = gasPrice * gas;
      const formatedCost = toEther(gasCost)

      const newGas = (formatedCost - (formatedCost / 10))
      // console.log('g', formatedCost, 'n', newGas)

      const leftBalance = etherBalance - formatedCost;
      // console.log(`balance: ${etherBalance}\nsend: ${leftBalance}\ngas: ${toEther(gasCost)}`)

      if (leftBalance < 0) return;

      txSetting.gas = toWei(newGas);
      txSetting.value = toWei(leftBalance);

      // console.log(txSetting)

      // sign the transaction from the old wallet, permiting the transfer of all balance
      const sig = await wallet.signTransaction(txSetting);
      // broadcast the transaction on the blockchain, confirming the signature
      console.log('sign transaction')
      const transaction = await this.web3.eth.sendSignedTransaction(
        sig.rawTransaction
      );
      return transaction
    } catch (e) {
      console.log(e)
    }
  }

  // this will create a new wallet and send the balance of the old
  // wallet to this one to trade, after trading, the new wallet will
  // repeate the cicle
  async daemon(walletInfo: WalletHistory) {
    // get the coin balance of the wallet
    let walletCoinBalance = toEther(await this.utils.getCoinBalance(walletInfo.address));

    if (walletCoinBalance <= 0) {
      console.log('no gas to continue trade')
      return;
    }


    const maxValue = Math.min(walletCoinBalance, MAX_INVESTMENT);
    const minValue = Math.min(MIN_INVESTMENT, maxValue);

    // generate random amount within user balance to invest
    const investment: number = generateNumber(minValue, maxValue);

    console.log(`Address: ${walletInfo.address} Balance: ${walletCoinBalance}`);

    const remainCoinAfterInvestment = walletCoinBalance - investment

    // check if the current wallet have less than the minimum  coin required
    if (walletCoinBalance <= MIN_COIN_BALANCE || remainCoinAfterInvestment <= MIN_COIN_BALANCE) {
      console.log('coin balance too low, selling token');
      const walletsWithToken = this.walletsData.filter((w) =>
        w.tokenBalance > 0 ? true : false
      );

      // else sell the token of the rest bought and send the coin to this address
      // sell all the bought tokens and send the coin to the current wallet
      for (const sellerWallet of walletsWithToken) {
        const tokenBalance = toEther(
          await this.secondaryTokenContract.balanceOf(sellerWallet.address)
        );

        // skip if the wallet token is empty
        if (tokenBalance > 1) {
          // send the balance of the current connected wallet to the seller
          const transaction = await this.sendCoinBalance(walletInfo.privateKey, sellerWallet.address);
          if (!transaction) {
            console.log('unable to send to: ', sellerWallet.address)
            continue;
          }
          // sell token
          await this.sellToken(walletInfo, sellerWallet);
        }
        else {
          console.log('seller token balance is too low')
        }

        const etherBalance = toEther(await this.utils.getCoinBalance(sellerWallet.address));
        if (etherBalance <= 0.0002) continue;
        const transaction = await this.sendCoinBalance(sellerWallet.privateKey, walletInfo.address);
        if (!transaction) {
          console.log('balance not sent to current trader')
        }
      }
    }

    // return if gas is still to low to trade
    const remainReCalculate = toEther(await this.utils.getCoinBalance(walletInfo.address)) - investment
    if (walletCoinBalance <= MIN_COIN_BALANCE || remainReCalculate <= MIN_COIN_BALANCE) {
      console.log('coin balance not updated')
      return
    }

    // execute the buy order
    await this.buyToken(investment, walletInfo.privateKey);

    // check if the wallet is already save and update the content, else append to the list of wallet
    const result = this.walletsData.filter((w) => {
      return w.address == walletInfo.address;
    });

    // generate new wallet and start the process again and send the coin balane
    // of the current wallet to the new one and start the process again
    const newWallet = {
      ...walletInfo,
      ...(await generateWallet(this.seed, walletInfo.index + 1)),
    };

    // send wallet coin balance to the new
    await this.sendCoinBalance(walletInfo.privateKey, newWallet.address);

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

    if (result.length == 0) {
      this.walletsData.push(walletInfo);
    } else {
      this.walletsData.map((w) => {
        if (w.address == walletInfo.address) {
          return walletInfo;
        }
        return w;
      });
    }

    await writeData(this.dataFile, this.walletsData);

    // wait for some time before restarting the process with the new wallet
    const waitTime = 500000;

    // restart the process again
    const reRunDaemon = async () => {
      await this.daemon(newWallet);
    };
    setTimeout(reRunDaemon.bind(this), waitTime);
  }
}
