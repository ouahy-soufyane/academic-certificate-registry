// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CertificateRegistry {
    struct Certificate {
        string studentName;
        string studentId;
        string diplomaTitle;
        string issueDate;
        string grade;
        address recipient;
        bool revoked;
    }

    address public owner;
    uint256 public nextCertificateId = 1;

    mapping(uint256 => Certificate) private certificates;
    mapping(string => bool) public studentIdExists;

    event CertificateMinted(uint256 indexed certId, string studentId, address indexed recipient);
    event CertificateRevoked(uint256 indexed certId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can do this");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function mintCertificate(
        address recipient,
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        string calldata issueDate,
        string calldata grade
    ) external onlyOwner returns (uint256 certId) {
        require(bytes(studentName).length > 0, "Student name is required");
        require(bytes(studentId).length > 0, "Student ID is required");
        require(!studentIdExists[studentId], "Student ID already has a certificate");

        certId = nextCertificateId;
        nextCertificateId++;
        certificates[certId] = Certificate({
            studentName: studentName,
            studentId: studentId,
            diplomaTitle: diplomaTitle,
            issueDate: issueDate,
            grade: grade,
            recipient: recipient,
            revoked: false
        });
        studentIdExists[studentId] = true;

        emit CertificateMinted(certId, studentId, recipient);
    }

    function batchMint(
        address[] calldata recipients,
        string[] calldata studentNames,
        string[] calldata studentIds,
        string[] calldata diplomaTitles,
        string[] calldata issueDates,
        string[] calldata grades
    ) external onlyOwner {
        uint256 count = recipients.length;
        require(count > 0, "Batch is empty");
        require(
            studentNames.length == count && studentIds.length == count &&
                diplomaTitles.length == count && issueDates.length == count && grades.length == count,
            "All lists must have the same length"
        );

        for (uint256 i = 0; i < count; i++) {
            _mint(recipients[i], studentNames[i], studentIds[i], diplomaTitles[i], issueDates[i], grades[i]);
        }
    }

    function _mint(
        address recipient,
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        string calldata issueDate,
        string calldata grade
    ) private {
        require(bytes(studentName).length > 0, "Student name is required");
        require(bytes(studentId).length > 0, "Student ID is required");
        require(!studentIdExists[studentId], "Student ID already has a certificate");

        uint256 certId = nextCertificateId;
        nextCertificateId++;
        certificates[certId] = Certificate(studentName, studentId, diplomaTitle, issueDate, grade, recipient, false);
        studentIdExists[studentId] = true;
        emit CertificateMinted(certId, studentId, recipient);
    }

    function getCertificate(uint256 certId) external view returns (Certificate memory) {
        require(certId > 0 && certId < nextCertificateId, "Certificate not found");
        return certificates[certId];
    }

    function revoke(uint256 certId) external onlyOwner {
        require(certId > 0 && certId < nextCertificateId, "Certificate not found");
        require(!certificates[certId].revoked, "Certificate is already revoked");
        certificates[certId].revoked = true;
        emit CertificateRevoked(certId);
    }
}
