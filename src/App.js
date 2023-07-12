import "./App.css";
import React, { useEffect, useState } from "react";
import Typography from "@mui/material/Typography";
import { Grid, TextField, Button, Container, Box } from "@mui/material";
import { ethers } from "ethers";
import { isAddress } from "ethers/lib/utils";

import { ERC20 } from "./abi/erc20";
import { vaultABI } from "./abi/BalVault";
import { ERC4626LinearPool } from "./abi/erc4626";

function App() {
  const BigNumber = require("bignumber.js");
  const vaultAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";

  const [poolId, setPoolId] = useState("");
  const [joinKind, setjoinKind] = useState(0);
  const [slippageSetting, setslippageSetting] = useState("0.01");
  const [walletAddress, setWalletAddress] = useState("");
  const [buttonText, setButtonText] = useState("Connect Wallet");
  const [network, setNetwork] = useState("");
  const rows = new Array(3).fill(null);
  const [tokenAddresses, setTokenAddresses] = useState(new Array(3).fill(""));
  const [tokenAmounts, setTokenAmounts] = useState(new Array(3).fill(""));
  const [approvedTokens, setApprovedTokens] = useState(new Array(3).fill(false));

  const handleInputChange = (event, rowIndex, setter) => {
    const newValue = event.target.value;
    setter((prevState) => {
      const newState = [...prevState];
      newState[rowIndex] = newValue;
      return newState;
    });
  };

  useEffect(() => {
    if (window.ethereum) {
      async function checkWalletonLoad() {
        const accounts = await window.ethereum.request({
          method: "eth_accounts",
        });
        if (accounts.length) {
          const networkId = await window.ethereum.request({
            method: "net_version",
          });
          setNetwork(getNetworkName(networkId));
          console.log("Your wallet is connected");
          const ethaddress = accounts[0];
          setWalletAddress(ethaddress);
          setButtonText("Wallet Connected");
        } else {
          console.log("Metamask is not connected");
        }
      }
      async function updateNetwork() {
        const networkId = await window.ethereum.request({
          method: "net_version",
        });
        setNetwork(getNetworkName(networkId));
      }

      const onChainChanged = () => {
        updateNetwork();
      };

      const onAccountsChanged = () => {
        checkWalletonLoad();
      };

      window.ethereum.on("chainChanged", onChainChanged);
      window.ethereum.on("accountsChanged", onAccountsChanged);

      checkWalletonLoad();

      return () => {
        window.ethereum.removeListener("chainChanged", onChainChanged);
        window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      };
    } else {
      console.log("Metamask not detected");
    }
  }, []);

  function getNetworkName(networkId) {
    switch (networkId) {
      case "1":
        return "Mainnet";
      case "5":
        return "Goerli";
      case "137":
        return "Polygon";
      case "42161":
        return "Arbitrum";
      case "1101":
        return "zkEVM";
      case "43114":
        return "Avalanche";
      default:
        return "Unknown network";
    }
  }

  async function requestAccount() {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        const ethaddress = accounts[0];
        setWalletAddress(ethaddress);
        setButtonText("Wallet Connected");
      } catch (error) {
        console.log("Error connecting...");
      }
    } else {
      console.log("Metamask not detected");
    }
  }

  async function checkApprovedTokens(updatedTokenAddresses) {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const newApprovedTokens = [...approvedTokens];
    const amountToApprove = ethers.constants.MaxUint256;
    for (let i = 0; i < updatedTokenAddresses.length; i++) {
      const tokenAddress = updatedTokenAddresses[i];
      if (!tokenAddress) {
        newApprovedTokens[i] = false;
        continue;
      }
      const tokenContract = new ethers.Contract(tokenAddress, ERC20, provider);
      const approvedAmount = await tokenContract.allowance(walletAddress, vaultAddress);
      newApprovedTokens[i] = approvedAmount.gte(amountToApprove);
    }
    setApprovedTokens(newApprovedTokens);
  }

  async function checkLinearContract(contractAddress) {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const ethcontract = new ethers.Contract(contractAddress, ERC4626LinearPool, signer);

      const mainToken = await ethcontract.getMainToken();
      const wrappedToken = await ethcontract.getWrappedToken();
      const poolIds = await ethcontract.getPoolId();

      setTokenAddresses(() => [contractAddress, mainToken.toString(), wrappedToken.toString()]);
      setPoolId(poolIds);
      checkApprovedTokens([contractAddress, mainToken.toString(), wrappedToken.toString()]);
    } catch (error) {
      console.error("Not a valid linear contract:", error);
    }
  }

  const handleTokenAddressChange = (event, index) => {
    const newTokenAddresses = [...tokenAddresses];
    newTokenAddresses[index] = event.target.value;
    setTokenAddresses(newTokenAddresses);

    const newApprovedTokens = [...approvedTokens];
    if (!isAddress(event.target.value)) {
      newApprovedTokens[index] = false;
    }
    setApprovedTokens(newApprovedTokens);

    if (isAddress(event.target.value)) {
      checkApprovedTokens(newTokenAddresses);
    }

    checkLinearContract(newTokenAddresses[0]);
  };

  async function batchSwap() {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const ethcontract = new ethers.Contract(vaultAddress, vaultABI, signer);

    const userData = "0x0000000000000000000000000000000000000000000000000000000000000000";

    const BatchSwapStep = {
      poolId: poolId,
      assetInIndex: "1",
      assetOutIndex: "0",
      amount: tokenAmounts[1],
      userData: userData,
    };

    const funds = {
      sender: walletAddress,
      fromInternalBalance: false,
      recipient: walletAddress,
      toInternalBalance: false,
    };

    const deadline = "999999999999999999";

    const limitIn = new BigNumber(tokenAmounts[1]).multipliedBy(-(1 - slippageSetting));
    const limitOut = new BigNumber(tokenAmounts[1]).multipliedBy(1 + slippageSetting);

    await ethcontract.batchSwap(joinKind, [BatchSwapStep], tokenAddresses, funds, [limitIn.toString(), limitOut.toString(), "0"], deadline);
  }

  const handleApprovalClick = async (tokenAddress, vaultAddress, index) => {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = await provider.getSigner();
    const tokenContract = new ethers.Contract(tokenAddress, ERC20, signer);
    const amountToApprove = ethers.constants.MaxUint256;
    const tx = await tokenContract.approve(vaultAddress, amountToApprove);
    await tx.wait();
    setApprovedTokens((prevState) => {
      const newState = [...prevState];
      newState[index] = true;
      return newState;
    });
  };

  const additionalTextFields = [
    {
      label: "Join Kind (default: 0)\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0",
      id: "joinKind",
      value: joinKind,
      onChange: setjoinKind,
    },
    {
      label: "Slippage (default: 0.01)\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0",
      id: "slippageSetting",
      value: slippageSetting,
      onChange: setslippageSetting,
    },
    {
      label: "Pool ID\u00A0\u00A0\u00A0\u00A0",
      id: "poolId",
      value: poolId,
      onChange: setPoolId,
    },
  ]
    .filter(Boolean)
    .map(({ label, id, value, onChange }, index) => (
      <Grid item xs={8} key={index} sx={{ padding: "6px" }}>
        <TextField
          label={label}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          InputLabelProps={{ sx: { color: "white" } }}
          InputProps={{
            sx: { color: "yellow", width: id === "poolId" ? "500px" : "200px", fontSize: "12px" },
          }}
        />
      </Grid>
    ));

  return (
    <>
      <header className="headerContent">
        <br />
        <p align="right">
          <Button variant="contained" onClick={requestAccount}>
            {buttonText}
          </Button>
        </p>
        <p align="right">Wallet Address: {walletAddress && `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 6)}`}</p>

        <p align="right">Network: {network}</p>
      </header>
      <br />
      <span style={{ color: "#c0c0c0", display: "block", paddingLeft: "50px" }}>
        Usage:
        <li>Paste the linear pool contract address in the text box below and the Pool ID, Main Token, and Wrapped Token fields should fill automatically</li>
        <li>Token Amount values should be in e18 format, i.e. 10000000000000000000 for 10 ETH, 10000000 for 10 USDC</li>
      </span>
      <br />
      <br />
      <div className="mainContent">
        <Button variant="contained" onClick={batchSwap}>
          Join Linear Pool
        </Button>
      </div>
      <br />
      <Grid container spacing={1} direction="column" alignItems="center" justifyContent="center">
        {additionalTextFields}
      </Grid>
      <br />
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={1}>
            <Grid item xs={5}>
              <Typography variant="h6" sx={{ color: "pink", mb: 1 }}>
                Token Addresses
              </Typography>
            </Grid>
            <Grid item xs={3} container alignItems="center" justifyContent="center">
              <Typography variant="h6" sx={{ color: "pink", mb: 1 }}>
                Token Approvals
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="h6" sx={{ color: "pink", mb: 1 }}>
                Token Amounts
              </Typography>
            </Grid>
            {rows.map((_, rowIndex) => (
              <React.Fragment key={rowIndex}>
                <Grid item xs={5}>
                  <TextField
                    label={
                      rowIndex === 0
                        ? "ERC4626 Contract Address \u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0"
                        : rowIndex === 1
                        ? "Main Token \u00A0\u00A0\u00A0\u00A0\u00A0"
                        : rowIndex === 2
                        ? "Wrapped Token \u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0"
                        : `Token Address ${rowIndex + 1}\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0`
                    }
                    value={tokenAddresses[rowIndex]}
                    onChange={(event) => handleTokenAddressChange(event, rowIndex)}
                    fullWidth
                    InputProps={{
                      sx: {
                        color: "yellow",
                        fontSize: "12px",
                      },
                    }}
                    InputLabelProps={{
                      sx: {
                        color: "white",
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={3} container alignItems="center" justifyContent="center">
                  <Button
                    variant="contained"
                    color="primary"
                    disabled={approvedTokens[rowIndex] || rowIndex === 0 || rowIndex === tokenAddresses.length - 1}
                    onClick={() => handleApprovalClick(tokenAddresses[rowIndex], vaultAddress, rowIndex)}
                  >
                    {approvedTokens[rowIndex] ? "Token Approved" : `Approve Token ${rowIndex + 1}`}
                  </Button>
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    label={rowIndex === 0 ? "" : rowIndex === 1 ? "Main Token Amount \u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0" : ""}
                    value={tokenAmounts[rowIndex]}
                    onChange={(event) => handleInputChange(event, rowIndex, setTokenAmounts)}
                    fullWidth
                    InputProps={{
                      sx: {
                        color: "yellow",
                        fontSize: "12px",
                      },
                      readOnly: rowIndex === 0 || rowIndex === 2,
                    }}
                    InputLabelProps={{
                      sx: {
                        color: "white",
                      },
                    }}
                  />
                </Grid>
              </React.Fragment>
            ))}
          </Grid>
        </Container>
      </Box>
      <br />
      <br />
      <br />
      <footer className="footer">
        open source project created by&nbsp;
        <a href="https://twitter.com/The_Krake" target="_blank" rel="noopener noreferrer">
          @ZeKraken
        </a>
        &nbsp;:&nbsp;
        <a href="https://github.com/zekraken-bot/batchSwaper" target="_blank" rel="noopener noreferrer">
          github link
        </a>
      </footer>
      <br />
    </>
  );
}

export default App;
