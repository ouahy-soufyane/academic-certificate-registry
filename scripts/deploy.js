const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const Registry = await hre.ethers.getContractFactory("CertificateRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log(`CertificateRegistry deployed at: ${address}`);

  const artifact = await hre.artifacts.readArtifact("CertificateRegistry");
  const config = { address, abi: artifact.abi, chainId: Number((await hre.ethers.provider.getNetwork()).chainId) };
  fs.writeFileSync(path.join(__dirname, "..", "frontend", "src", "contract.json"), JSON.stringify(config, null, 2));
  console.log("Frontend contract config updated.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
