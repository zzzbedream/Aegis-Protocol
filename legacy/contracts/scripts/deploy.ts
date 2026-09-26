import { ethers } from "hardhat";

async function main() {
  console.log("=== Aegis Protocol: Deployment to Horizen L3 / Base Sepolia ===");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 1. Deploy Mock / Live PureFi Verifier
  const PureFiVerifier = await ethers.getContractFactory("PureFiVerifier");
  const pureFiVerifier = await PureFiVerifier.deploy(
    deployer.address, // initial authorized issuer
    25 // max risk score 25
  );
  await pureFiVerifier.waitForDeployment();
  console.log("PureFiVerifier deployed to:", await pureFiVerifier.getAddress());

  // 2. Deploy zkVerify Bridge Mock / Live
  const MockZkVerify = await ethers.getContractFactory("MockZkVerify");
  const zkVerifyBridge = await MockZkVerify.deploy();
  await zkVerifyBridge.waitForDeployment();
  console.log("zkVerifyBridge deployed to:", await zkVerifyBridge.getAddress());

  // 3. Deploy Aegis Vault
  const AegisVault = await ethers.getContractFactory("AegisVault");
  const vault = await AegisVault.deploy();
  await vault.waitForDeployment();
  console.log("AegisVault deployed to:", await vault.getAddress());

  // 4. Deploy Aegis Entrypoint
  const AegisEntrypoint = await ethers.getContractFactory("AegisEntrypoint");
  const entrypoint = await AegisEntrypoint.deploy(
    await vault.getAddress(),
    await pureFiVerifier.getAddress()
  );
  await entrypoint.waitForDeployment();
  console.log("AegisEntrypoint deployed to:", await entrypoint.getAddress());

  // 5. Deploy Aegis Exitpoint (configured with TEE Enclave Signer)
  const teeEnclaveAddress = process.env.TEE_ENCLAVE_SIGNER || deployer.address;
  const AegisExitpoint = await ethers.getContractFactory("AegisExitpoint");
  const exitpoint = await AegisExitpoint.deploy(
    await vault.getAddress(),
    await entrypoint.getAddress(),
    await pureFiVerifier.getAddress(),
    await zkVerifyBridge.getAddress(),
    teeEnclaveAddress
  );
  await exitpoint.waitForDeployment();
  console.log("AegisExitpoint deployed to:", await exitpoint.getAddress());

  // 6. Set Vault Controllers
  await vault.setControllers(
    await entrypoint.getAddress(),
    await exitpoint.getAddress()
  );
  console.log("AegisVault controllers set to Entrypoint and Exitpoint.");

  // 7. Deploy Collateral Tokens (MockZEN as LayerZero OFT and ERC7943 RWA)
  const MockZEN = await ethers.getContractFactory("MockZEN");
  const zen = await MockZEN.deploy();
  await zen.waitForDeployment();
  console.log("MockZEN deployed to:", await zen.getAddress());

  const ERC7943Token = await ethers.getContractFactory("ERC7943Token");
  const rwaToken = await ERC7943Token.deploy("Institutional Treasury Note", "iTNOTE", 18);
  await rwaToken.waitForDeployment();
  console.log("ERC7943Token (RWA) deployed to:", await rwaToken.getAddress());

  console.log("\n=== Deployment Complete ===");
  console.log({
    pureFiVerifier: await pureFiVerifier.getAddress(),
    zkVerifyBridge: await zkVerifyBridge.getAddress(),
    vault: await vault.getAddress(),
    entrypoint: await entrypoint.getAddress(),
    exitpoint: await exitpoint.getAddress(),
    zen: await zen.getAddress(),
    rwaToken: await rwaToken.getAddress(),
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
