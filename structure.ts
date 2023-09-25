export interface CreatedWallet {
  privateKey: string;
  address: string;
  index: number;
}

export interface WalletHistory extends CreatedWallet {
  tokenBalance: number;
  poolBalance: number;
  bnbBalance: number;
  nonce: number;
}
