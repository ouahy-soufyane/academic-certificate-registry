const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateRegistry", function () {
  async function deployRegistry() {
    const [owner, recipient, other] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("CertificateRegistry");
    const registry = await Registry.deploy();
    return { registry, owner, recipient, other };
  }

  it("lets the owner issue and read a certificate", async function () {
    const { registry, recipient } = await deployRegistry();
    await expect(registry.mintCertificate(recipient.address, "Amina Benali", "2023-INF-042", "Licence Informatique", "2026-06-15", "Mention Bien"))
      .to.emit(registry, "CertificateMinted").withArgs(1, "2023-INF-042", recipient.address);
    const certificate = await registry.getCertificate(1);
    expect(certificate.studentName).to.equal("Amina Benali");
    expect(certificate.revoked).to.equal(false);
  });

  it("prevents a second certificate for the same student ID", async function () {
    const { registry, recipient } = await deployRegistry();
    await registry.mintCertificate(recipient.address, "Amina", "STU-1", "Licence", "2026-06-15", "Bien");
    await expect(registry.mintCertificate(recipient.address, "Amina", "STU-1", "Licence", "2026-06-15", "Bien"))
      .to.be.revertedWith("Student ID already has a certificate");
  });

  it("keeps minting restricted to the owner", async function () {
    const { registry, recipient, other } = await deployRegistry();
    await expect(registry.connect(other).mintCertificate(recipient.address, "Amina", "STU-1", "Licence", "2026-06-15", "Bien"))
      .to.be.revertedWith("Only the owner can do this");
  });
});
