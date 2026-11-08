// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title DocumentHashRegistry
/// @notice Minimal append-only registry that proves a document's SHA-256 digest
///         existed on a public chain at a point in time.
///
/// @dev PRIVACY / SCOPE (read before deploying):
///      * Only a 32-byte digest, a short free-form metadata string and a
///        timestamp are ever written on-chain.
///      * NO document content, NO file name, NO owner name, NO document URL and
///        NO personal data may be passed as `metadata`. The relayer is
///        responsible for that; the contract cannot enforce it.
///      * A digest proves *file integrity*, not *document authenticity*: it says
///        "these bytes were submitted by the relayer", not "this registration
///        certificate is genuine". TrustDrive states this everywhere.
///
///      NOT COMPILED IN THIS REPOSITORY: there is no `solc` available in this
///      environment, so this source has never been compiled, audited or
///      deployed. It is written to be plain, dependency-free Solidity >=0.8.20.
///      Compile and deploy it yourself before pointing TD_CHAIN_CONTRACT at it:
///
///        solc --optimize --bin --abi \
///             -o build/ contracts/DocumentHashRegistry.sol
///        # then deploy `build/DocumentHashRegistry.json` with the constructor
///        # arguments (owner, relayer) and set the deployed address as
///        # TD_CHAIN_CONTRACT.
contract DocumentHashRegistry {
    // ---- Storage ------------------------------------------------------------

    /// @notice Owner of the registry. May rotate the relayer and renounce.
    address public immutable owner;

    /// @notice The only address allowed to write anchors (the backend relayer).
    address public immutable relayer;

    struct DocRecord {
        bytes32 docHash; // SHA-256 digest of the document bytes.
        string metadata; // Minimal, non-sensitive label only.
        uint64 timestamp; // block.timestamp of the anchoring transaction.
    }

    DocRecord[] private _records;

    /// @dev digest => 1-based index into `_records`. 0 means "not anchored".
    mapping(bytes32 => uint256) private _indexByHash;

    // ---- Events --------------------------------------------------------------

    /// @notice Emitted for every accepted anchor.
    /// @param docHash The anchored SHA-256 digest.
    /// @param index 1-based index of the record in the registry.
    /// @param metadata The (minimal) metadata string stored with the record.
    /// @param timestamp block.timestamp of the anchoring transaction.
    event Anchored(bytes32 indexed docHash, uint256 indexed index, string metadata, uint64 timestamp);

    // ---- Errors --------------------------------------------------------------

    error NotOwner();
    error NotRelayer();
    error EmptyHash();
    error AlreadyAnchored();
    error UnknownHash();
    error IndexOutOfRange();
    error InvalidAddress();

    // ---- Modifiers -----------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    // ---- Construction --------------------------------------------------------

    /// @param initialOwner Address allowed to administer the registry.
    /// @param initialRelayer Address allowed to submit anchors (the backend signer).
    constructor(address initialOwner, address initialRelayer) {
        if (initialOwner == address(0) || initialRelayer == address(0)) revert InvalidAddress();
        owner = initialOwner;
        relayer = initialRelayer;
    }

    // ---- Writes --------------------------------------------------------------

    /// @notice Record a document digest on-chain. Relayer-only, no duplicates.
    /// @param docHash The document's SHA-256 digest (bytes32).
    /// @param metadata Minimal, non-sensitive label (e.g. "doc:<id>|v:1").
    /// @return index The 1-based index of the new record.
    function anchor(bytes32 docHash, string calldata metadata) external onlyRelayer returns (uint256 index) {
        if (docHash == bytes32(0)) revert EmptyHash();
        if (_indexByHash[docHash] != 0) revert AlreadyAnchored();

        _records.push(DocRecord({docHash: docHash, metadata: metadata, timestamp: uint64(block.timestamp)}));
        index = _records.length;
        _indexByHash[docHash] = index;

        emit Anchored(docHash, index, metadata, uint64(block.timestamp));
    }

    /// @notice Rotate the relayer. Owner-only.
    function setRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert InvalidAddress();
        relayer = newRelayer;
    }

    // ---- Reads ---------------------------------------------------------------

    /// @notice Total number of anchored documents.
    function count() external view returns (uint256) {
        return _records.length;
    }

    /// @notice The digest stored at `index` (1-based).
    function getHash(uint256 index) external view returns (bytes32) {
        if (index == 0 || index > _records.length) revert IndexOutOfRange();
        return _records[index - 1].docHash;
    }

    /// @notice Full record for a digest. Reverts when the digest is unknown.
    function getDocHash(bytes32 docHash) external view returns (bytes32 hash, string memory metadata, uint64 timestamp) {
        uint256 idx = _indexByHash[docHash];
        if (idx == 0) revert UnknownHash();
        DocRecord storage rec = _records[idx - 1];
        return (rec.docHash, rec.metadata, rec.timestamp);
    }

    /// @notice 1-based index of a digest, or 0 when it is not anchored.
    function indexOf(bytes32 docHash) external view returns (uint256) {
        return _indexByHash[docHash];
    }
}
