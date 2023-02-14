"use strict";
var args = process.argv;
const commands = ['-a','-buy','-persist','-track', '-s', '-fs','-h']
const usage = function() {
  const usageText = `usage:
    node app.js <command>
    commands can be:

    -a:      used to approve the token
    -persist:   used to start TxPersist_SC
    -track:  used to track dev wallet
    -buy   used to buy liquidty add
    -s:      used to start sell function
    -fs:     used to force sell the token
    -h:      used to print the usage guide
end`
  console.log(usageText)
  process.exit();
}
if (commands.indexOf(args[2]) == -1) {
  usage()
}


const env = require("./env.json");
Object.assign(process.env, env);

const ethers = require("ethers");
const tokens = require("./tokens.js");

const purchaseAmount = ethers.utils.parseUnits(tokens.purchaseAmount, "ether");
const pcsAbi = new ethers.utils.Interface(require("./abi.json"));
const EXPECTED_PONG_BACK = 30000;
const KEEP_ALIVE_CHECK_INTERVAL = 15000;

const provider = new ethers.providers.WebSocketProvider(
  process.env.BSC_NODE_WSS
);

const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
const account = wallet.connect(provider);
const router = new ethers.Contract(tokens.router, pcsAbi, account);
const contract_SC = new ethers.Contract(tokens.contract_SC, pcsAbi, account);


var tpPrice = purchaseAmount.add((purchaseAmount.mul(tokens.tpPercentage)).div(100));
var gotcha = false;
var cmd = process.argv[2]; 

process.on("uncaughtException", (err) => {
});
const startConnection = () => {
  let pingTimeout = null;
  let keepAliveInterval = null;
  provider._websocket.on("open", async() => {
    keepAliveInterval = setInterval(() => {
      provider._websocket.ping();
      pingTimeout = setTimeout(() => {
        provider._websocket.terminate();
      }, EXPECTED_PONG_BACK);
    }, KEEP_ALIVE_CHECK_INTERVAL);
    console.log("THIS WILL BE FUN...\n");
    switch (cmd) {
      case '-fs':
        var tokenBalance = await CheckTokenBalance(tokens.pair[1]);
        if(tokenBalance > 0)  await SellToken(tokenBalance,true);
        break;
      case '-s':
        var tokenBalance = await CheckTokenBalance(tokens.pair[1]);
        if(tokenBalance > 0)  await SellToken(tokenBalance,false);
      case '-persist':
        console.log("Checking WBNB amount...");
        var checkWBNBAmount = await CheckWBNBAmount();
        var persist = await TxPersist();
        break;
      case '-track':
        console.log("Tracking wallet")
        await FireTx(true);
        break;
      case '-buy':
        console.log("Awaiting Liquidity")
        await FireTx(false);
      break;
      case '-a':
        if(cmd=='-a') await ApproveContract();  
      case '-h':
        usage();
        break;
      default:
        usage();
        break;
    }
  });

  provider._websocket.on("close", () => {
    console.log("WebSocket Closed...Reconnecting...");
    clearInterval(keepAliveInterval);
    clearTimeout(pingTimeout);
    startConnection();
  });

  provider._websocket.on("error", () => {
    console.log("Error. Attempting to Reconnect...");
    clearInterval(keepAliveInterval);
    clearTimeout(pingTimeout);
    startConnection();
  });

  provider._websocket.on("pong", () => {
    clearInterval(pingTimeout);
  });
};
 

const TxPersist = async ()=>{
  while(!gotcha){
    BuyToken();
    await new Promise(r => setTimeout(r, 100));
  }
}

const FireTx = async(trackWallet)=>{
  provider.on("pending", async (txHash) => {
    if(gotcha) provider.off('pending');
    provider.getTransaction(txHash).then(async (tx) => {  
      if (tx && tx.to) {
        if (tx.to === ethers.utils.getAddress(tokens.router) && !trackWallet) {
          const re1 = new RegExp("^0xf305d719");
          const re2 = new RegExp("^0xe8e33700");
          if (re1.test(tx.data) || re2.test(tx.data)) {
            const decodedInput = pcsAbi.parseTransaction({
              data: tx.data,
              value: tx.value,
            });
            if (ethers.utils.getAddress(tokens.pair[1]) === decodedInput.args[0]) {
              await SplitTransactionBuy(tx)
            }
          }
        }
        else{
          if(tx.from == ethers.utils.getAddress(tokens.devWallet)  && trackWallet){
            tokens.pair[1] = tx.to;
            await SplitTransactionBuy(tx)
          }
        }
      }
    });
  });
}

const BuyToken = async () => {
  console.log("Buying...")
  const tx = await router.swapExactTokensForTokens(
      purchaseAmount,
      0,
      tokens.pair,
      process.env.RECIPIENT,
      Date.now() + 1000 * 60 * 5, 
      {
        gasLimit: '900000',
        gasPrice: ethers.utils.parseUnits('10', 'gwei'),
      }
    );
  const receipt = await tx.wait();
  gotcha = true;
  console.log(`Transaction confirmed , BSCScan: https://www.bscscan.com/tx/${receipt.transactionHash} \n`);
  var tokenBalance = await CheckTokenBalance(tokens.pair[1]);
  const sellResult = await SellToken(tokenBalance,false);
  process.exit();
};

const SplitTransactionBuy = async(txLp)=>{
  try{
    console.log("Buying...")
    const tx = await contract_SC.swap(
        tokens.pair[0],
        tokens.pair[1],
        0,
        process.env.RECIPIENT,
        tokens.transactionSplit,
        {
          value:purchaseAmount,
          gasLimit: txLp.gasLimit,
          gasPrice: txLp.gasPrice,
        }
      );
    const receipt = await tx.wait();
    gotcha = true;
    console.log(`Transaction confirmed , BSCScan: https://www.bscscan.com/tx/${receipt.transactionHash} \n`);
    
    var tokenBalance = await CheckTokenBalance(tokens.pair[1]);
    const sellResult = await SellToken(tokenBalance,false);
    process.exit();
  }
  catch(e){
    console.log("Error with the transaction");
  }
}

const SellToken = async (tokenBalance,forceSell) => {
  const amountBNBOut = await router.getAmountsOut(tokenBalance, [tokens.pair[1], tokens.pair[0]]);
  console.log("Buy price: "+tokens.purchaseAmount+" - Current Price: "+(amountBNBOut[1]/(10**18)))
  if(amountBNBOut[1].gte(tpPrice) || forceSell){
    console.log("Target reached, going to sell...");
    const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
      tokenBalance,
      0,
      tokens.pair.reverse(),
      process.env.RECIPIENT,
      Date.now() + 1000 * 60 * 5, 
      {
        gasLimit: '900000',
        gasPrice: ethers.utils.parseUnits('6', 'gwei'),
      }
    );
    console.log("Waiting Transaction Receipt...");
    const receipt = await tx.wait();
    console.log(`Transaction approved , BSCScan: https://www.bscscan.com/tx/${receipt.logs[1].transactionHash} \n`);

  }
  else{
      await new Promise(r => setTimeout(r, 100));
      return SellToken(tokenBalance);
  }
}

let CheckTokenBalance = async(token)=>{
  var balance = 0;
  try{
      const sellContract = new ethers.Contract(
        token,
        [
          "function balanceOf(address account) external view returns (uint256)",
        ],
        account
      );
      balance = await sellContract.balanceOf(process.env.RECIPIENT);
  }
  catch(e){
      console.log("Error Checking Token Balance");
  }
  return balance;
}

const ApproveContract = async () => {
  const sellContract = new ethers.Contract(
    tokens.pair[1],
    [
      "function allowance(address owner, address spender) external view returns (uint)",
      "function approve(address _spender, uint256 _value) public returns (bool success)",
      "function name() external pure returns (string memory)",
    ],
    account
  );
  const tokenName = await sellContract.name();
  const allowance = await sellContract.allowance(process.env.RECIPIENT, tokens.router);
  if (allowance._hex === "0x00") {
    const tx = await sellContract.approve(tokens.router, ethers.constants.MaxUint256);
    const receipt = await tx.wait();
    console.log(`Contract Approved , BSCScan: https://www.bscscan.com/tx/${receipt.transactionHash} \n`);
  } else {
    console.log(tokenName + " already approved");
  }
};

let CheckWBNBAmount = async()=>{
  try{
    const erc = new ethers.Contract(
      tokens.pair[0],
      [
          {"constant": true,"inputs": [{"name": "_owner","type": "address"}],"name": "balanceOf","outputs": [{"name": "balance","type": "uint256"}],"payable": false,"type": "function"},
          {"constant":false,"inputs":[],"name":"deposit","outputs":[],"payable":true,"stateMutability":"payable","type":"function"}
      ],
      account
    );  
    var wbnbAmount = await CheckTokenBalance(tokens.pair[0]);
    if(wbnbAmount.lt(purchaseAmount)){
      console.log("WBNB amount not enough , going to deposit...")
      const deposit = await erc.deposit({value:purchaseAmount});
      console.log("WBNB successfully deposited!")
    }
    else{
      console.log("You have enough WBNB")
    }
  }
  catch(e){
    console.log("There was an error with the deposit")
  }
}

startConnection();
