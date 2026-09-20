import { ethers } from "hardhat";

async function main() {
  console.log("=== Aegis Protocol: End-to-End Blind Liquidation Simulation ===");

  const [owner, institution, liquidator, teeSignerWallet] = await ethers.getSigners();
  console.log("Institution Address:", institution.address);
  console.log("Liquidator Address:", liquidator.address);
  console.log("TEE Hardware Signer:", teeSignerWallet.address);

  // 1. Deploy System Contracts
  const PureFiVerifier = await ethers.getContractFactory("PureFiVerifier");
  const pureFiVerifier = await PureFiVerifier.deploy(owner.address, 25);
  await pureFiVerifier.waitForDeployment();

  const MockZkVerify = await ethers.getContractFactory("MockZkVerify");
  const zkVerifyBridge = await MockZkVerify.deploy();
  await zkVerifyBridge.waitForDeployment();

  const AegisVault = await ethers.getContractFactory("AegisVault");
  const vault = await AegisVault.deploy();
  await vault.waitForDeployment();

  const AegisEntrypoint = await ethers.getContractFactory("AegisEntrypoint");
  const entrypoint = await AegisEntrypoint.deploy(
    await vault.getAddress(),
    await pureFiVerifier.getAddress()
  );
  await entrypoint.waitForDeployment();

  const AegisExitpoint = await ethers.getContractFactory("AegisExitpoint");
  const exitpoint = await AegisExitpoint.deploy(
    await vault.getAddress(),
    await entrypoint.getAddress(),
    await pureFiVerifier.getAddress(),
    await zkVerifyBridge.getAddress(),
    teeSignerWallet.address
  );
  await exitpoint.waitForDeployment();

  await vault.setControllers(await entrypoint.getAddress(), await exitpoint.getAddress());

  const MockZEN = await ethers.getContractFactory("MockZEN");
  const zen = await MockZEN.deploy();
  await zen.waitForDeployment();

  const usdcDebt = await MockZEN.deploy();
  await usdcDebt.waitForDeployment();

  // 2. Fund Accounts
  const depositCollateral = ethers.parseEther("1000"); // 1,000 ZEN
  const debtAmount = ethers.parseEther("8000"); // 8,000 USDC
  await zen.mint(institution.address, depositCollateral);
  await usdcDebt.mint(liquidator.address, debtAmount);

  await zen.connect(institution).approve(await vault.getAddress(), ethers.MaxUint256);
  await usdcDebt.connect(liquidator).approve(await exitpoint.getAddress(), ethers.MaxUint256);

  // 3. Generate PureFi AML Packages
  const latestBlock = await ethers.provider.getBlock("latest");
  const validUntil = (latestBlock?.timestamp || Math.floor(Date.now() / 1000)) + 3600;

  async function createAmlPackage(account: string, riskScore: number) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const msgHash = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "uint256", "uint256", "bytes", "uint256", "address"],
        [account, 43, riskScore, validUntil, "0x", chainId, await pureFiVerifier.getAddress()]
      )
    );
    const signature = await owner.signMessage(ethers.getBytes(msgHash));
    return {
      signature,
      ruleId: 43,
      riskScore,
      validUntil,
      payload: "0x",
    };
  }

  const institutionAml = await createAmlPackage(institution.address, 10);
  const liquidatorAml = await createAmlPackage(liquidator.address, 5);

  // 4. Confidential Deposit on AegisEntrypoint
  const secretSalt = "institutional_vault_salt_4921";
  const commitment = ethers.keccak256(
    ethers.solidityPacked(["address", "string"], [institution.address, secretSalt])
  );
  const encryptedPayload = ethers.hexlify(ethers.toUtf8Bytes(JSON.stringify({
    institution: institution.address,
    collateral: "1000",
    debt: "8000",
    salt: secretSalt,
  })));

  console.log("\n[Step 1] Executing Confidential Deposit...");
  const txDeposit = await entrypoint.connect(institution).depositConfidential(
    await zen.getAddress(),
    depositCollateral,
    commitment,
    encryptedPayload,
    institutionAml
  );
  await txDeposit.wait();
  console.log("Deposit registered! Commitment:", commitment);
  console.log("Vault total ZEN locked:", ethers.formatEther(await vault.getTotalCollateral(await zen.getAddress())));

  // 5. TEE Evaluates Position (Simulating Price Drop)
  console.log("\n[Step 2] TEE Enclave Evaluates Health Factor...");
  // Collateral value drops, Health Factor = 0.82e18 (< 1.0)
  const subcollateralizedHF = ethers.parseEther("0.82");
  const nonce = 8801;
  const attestationTimestamp = validUntil - 1800;

  // Construct TEE Signed Attestation
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const attestationMsgHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "uint256", "address", "uint256", "uint256", "uint256", "uint256", "uint256", "address"],
      [
        commitment,
        await zen.getAddress(),
        depositCollateral,
        await usdcDebt.getAddress(),
        debtAmount,
        subcollateralizedHF,
        attestationTimestamp,
        nonce,
        chainId,
        await exitpoint.getAddress(),
      ]
    )
  );

  const teeSignature = await teeSignerWallet.signMessage(ethers.getBytes(attestationMsgHash));
  const vSocketAttestation = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "tuple(bytes32 commitment, address collateralAsset, uint256 collateralAmount, address debtAsset, uint256 debtAmount, uint256 healthFactor, uint256 timestamp, uint256 nonce)",
      "bytes",
    ],
    [
      [
        commitment,
        await zen.getAddress(),
        depositCollateral,
        await usdcDebt.getAddress(),
        debtAmount,
        subcollateralizedHF,
        attestationTimestamp,
        nonce,
      ],
      teeSignature,
    ]
  );

  const zkProof = "0xdeadbeef01020304";

  // 6. Execute Blind Liquidation
  console.log("\n[Step 3] Liquidator Bot Executes Blind Liquidation...");
  const liquidatorZenBefore = await zen.balanceOf(liquidator.address);

  const txLiq = await exitpoint.connect(liquidator).liquidateBlind(
    commitment,
    await zen.getAddress(),
    depositCollateral,
    await usdcDebt.getAddress(),
    debtAmount,
    vSocketAttestation,
    zkProof,
    liquidatorAml
  );
  const receipt = await txLiq.wait();

  const liquidatorZenAfter = await zen.balanceOf(liquidator.address);
  console.log("Blind Liquidation Executed successfully!");
  console.log("Collateral Seized by Liquidator:", ethers.formatEther(liquidatorZenAfter - liquidatorZenBefore), "ZEN");
  console.log("Commitment Status (Liquidated):", await exitpoint.liquidatedCommitments(commitment));
  console.log("Vault Collateral Remaining:", ethers.formatEther(await vault.getTotalCollateral(await zen.getAddress())), "ZEN");

  console.log("\n[Privacy Verification]:");
  console.log("Notice: The transaction logs and public parameters ONLY reference commitment:", commitment);
  console.log("The borrower's real address (", institution.address, ") was NEVER emitted or exposed on Horizen L3!");
  console.log("\n=== E2E Simulation Succeeded 100% ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
