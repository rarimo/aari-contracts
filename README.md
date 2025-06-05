# PoC: Universal Account Recovery Standard (UARS)

The proof of concept implementation of the [Account Abstraction Recovery Interface (AARI)](https://ethereum-magicians.org/t/eip-7947-account-abstraction-recovery-interface-aari/24080).

#### Compilation

To compile the contracts, use the next script:

```bash
npm run compile
```

#### Test

To run the tests, execute the following command:

```bash
npm run test
```

Or to see the coverage, run:

```bash
npm run coverage
```

#### Local deployment

To deploy the contracts locally, run the following commands (in the different terminals):

```bash
npm run private-network
npm run deploy-localhost
```

#### Bindings

The command to generate the bindings is as follows:

```bash
npm run generate-types
```

> See the full list of available commands in the `package.json` file.

### Integrated plugins

- Hardhat official `ethers` + `ethers-v6`
- [`Typechain`](https://www.npmjs.com/package/@typechain/hardhat)
- [`hardhat-migrate`](https://www.npmjs.com/package/@solarity/hardhat-migrate), [`hardhat-markup`](https://www.npmjs.com/package/@solarity/hardhat-markup), [`hardhat-gobind`](https://www.npmjs.com/package/@solarity/hardhat-gobind)
- [`hardhat-zkit`](https://www.npmjs.com/package/@solarity/hardhat-zkit), [`chai-zkit`](https://www.npmjs.com/package/@solarity/chai-zkit)
- [`hardhat-contract-sizer`](https://www.npmjs.com/package/hardhat-contract-sizer)
- [`hardhat-gas-reporter`](https://www.npmjs.com/package/hardhat-gas-reporter)
- [`solidity-coverage`](https://www.npmjs.com/package/solidity-coverage)
