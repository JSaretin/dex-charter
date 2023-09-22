# dex-hyper

A script that randomly buy and sell a given token on dex exchange, creating hyper-active chart activities


Features
- [ ] Buy token
- [ ] Sell token
- [ ] Send coin to another address
- [ ] send token to another address
- [ ] Keep track of bought tokens
- [ ] Before buying token, check if someone else have invested and sell, making some profit to keep gas cost
    + Save the trading pool quote balance before and after making a trade (then decide to sell if the quote balance is higher than the balance after the last buy, else sell)
- [ ] Generate multiple address/wallet from a given seed phrase and use the generated address for the trades
- [ ] Randomly split the given balance for trade
- [ ] Buy based on random interval