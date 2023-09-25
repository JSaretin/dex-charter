import { HDNodeWallet } from "ethers";
import Web3 from "web3";
import { CreatedWallet } from "./structure";
import { BunFile } from "bun";

export function toEther(amount: any) {
  const result = Web3.utils.fromWei(amount.toString(), "ether");
  return Number(result);
}

export function toWei(amount: number) {
  return Web3.utils.toWei(amount.toString(), "ether");
}

export async function generateWallet(
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

// write data to disk file
export async function writeData(path: BunFile, data: object) {
  await Bun.write(path, JSON.stringify(data));
}


export function generateNumber(minValue: number, maxValue: number){
  const cal = Math.random() * (maxValue - minValue) + minValue;
  return (cal)
 };