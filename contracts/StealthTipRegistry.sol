// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title StealthTipRegistry
 * @notice Stores private-tip metadata on the permissioned StealthStream L1.
 *
 * The eERC transfer is intentionally performed by the sender's wallet with the
 * official eERC SDK before `recordTip` is called. This contract never receives
 * a decryption key or a plaintext amount; it only links that private transfer
 * to a creator and preserves the sender's disclosure preference.
 *
 * Transaction admission is enforced at the network layer by Avalanche's
 * txAllowList precompile. `onlyApproved` is a second application-level gate
 * useful for local development and for defending against misconfiguration.
 */
contract StealthTipRegistry {
    struct CreatorProfile {
        string handle;
        bool active;
        address auditor;
        bool taxModeEnabled;
    }

    struct Tip {
        // Zero when the sender chose not to disclose their registry identity.
        address sender;
        address creator;
        bytes32 encryptedTransferReference;
        uint64 timestamp;
        bool senderRevealed;
    }

    address public immutable owner;
    mapping(address => bool) public approvedWallets;
    mapping(address => CreatorProfile) public creators;
    mapping(bytes32 => address) private handleOwners;
    mapping(uint256 => Tip) public tips;
    mapping(address => uint256[]) private creatorTipIds;
    uint256 public tipCount;

    event WalletApprovalChanged(address indexed wallet, bool approved);
    event CreatorRegistered(address indexed creator, string handle);
    event TipRecorded(
        uint256 indexed tipId,
        // Zero when the sender opted out of disclosure.
        address indexed sender,
        address indexed creator,
        bytes32 encryptedTransferReference,
        bool senderRevealed
    );
    event AuditorRotated(address indexed creator, address indexed auditor);

    error NotOwner();
    error WalletNotApproved();
    error HandleEmpty();
    error HandleTaken();
    error CreatorAlreadyRegistered();
    error NotCreator();
    error UnknownCreator();
    error SelfTip();
    error ReferenceUsed();
    error InvalidAdmin();
    error InvalidWallet();
    error InvalidReference();

    mapping(bytes32 => bool) public recordedTransferReferences;

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert InvalidAdmin();
        owner = initialAdmin;
        approvedWallets[initialAdmin] = true;
        emit WalletApprovalChanged(initialAdmin, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyApproved() {
        if (!approvedWallets[msg.sender]) revert WalletNotApproved();
        _;
    }

    function setApprovedWallet(address wallet, bool approved) external onlyOwner {
        if (wallet == address(0)) revert InvalidWallet();
        approvedWallets[wallet] = approved;
        emit WalletApprovalChanged(wallet, approved);
    }

    function registerCreator(string calldata handle) external onlyApproved {
        if (creators[msg.sender].active) revert CreatorAlreadyRegistered();
        bytes32 handleHash = keccak256(bytes(handle));
        if (bytes(handle).length == 0) revert HandleEmpty();
        if (handleOwners[handleHash] != address(0)) revert HandleTaken();
        creators[msg.sender] = CreatorProfile(handle, true, address(0), false);
        handleOwners[handleHash] = msg.sender;
        emit CreatorRegistered(msg.sender, handle);
    }

    /**
     * @param handle Recipient's registered handle.
     * @param encryptedTransferReference A hash/reference emitted by the eERC
     *        transfer. It is not a plaintext amount and cannot be decrypted by
     *        this registry.
     */
    function recordTip(
        string calldata handle,
        bytes32 encryptedTransferReference,
        bool senderRevealed
    ) external onlyApproved returns (uint256 tipId) {
        address creator = handleOwners[keccak256(bytes(handle))];
        if (creator == address(0) || !creators[creator].active) revert UnknownCreator();
        if (creator == msg.sender) revert SelfTip();
        if (encryptedTransferReference == bytes32(0)) revert InvalidReference();
        if (recordedTransferReferences[encryptedTransferReference]) revert ReferenceUsed();

        recordedTransferReferences[encryptedTransferReference] = true;
        tipId = ++tipCount;
        address disclosedSender = senderRevealed ? msg.sender : address(0);
        tips[tipId] = Tip(disclosedSender, creator, encryptedTransferReference, uint64(block.timestamp), senderRevealed);
        creatorTipIds[creator].push(tipId);
        emit TipRecorded(tipId, disclosedSender, creator, encryptedTransferReference, senderRevealed);
    }

    function rotateAuditor(address auditor) external onlyApproved {
        CreatorProfile storage profile = creators[msg.sender];
        if (!profile.active) revert NotCreator();
        profile.auditor = auditor;
        profile.taxModeEnabled = auditor != address(0);
        emit AuditorRotated(msg.sender, auditor);
    }

    function creatorForHandle(string calldata handle) external view returns (address) {
        return handleOwners[keccak256(bytes(handle))];
    }

    function getCreatorTipIds(address creator) external view returns (uint256[] memory) {
        return creatorTipIds[creator];
    }
}
