// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PredicGuardAudit
 * @notice On-chain audit trail for prediction market agents
 * @dev Stores cryptographic proofs of agent decisions for verification
 */
contract PredicGuardAudit {
    
    struct AuditEntry {
        bytes32 hash;
        uint256 timestamp;
        string entryType;
        address submitter;
        bool verified;
    }

    struct AgentReputation {
        uint256 totalTrades;
        uint256 successfulTrades;
        uint256 totalVolume;
        uint256 reputationScore; // 0-10000 (100.00%)
        uint256 lastActivity;
        bool isBlacklisted;
    }

    // State variables
    mapping(bytes32 => AuditEntry) public entries;
    mapping(address => AgentReputation) public agentReputations;
    mapping(address => bool) public authorizedSubmitters;
    mapping(address => bytes32[]) public agentEntryHashes;
    
    address public owner;
    uint256 public totalEntries;
    bytes32 public merkleRoot;
    
    // Events
    event EntryLogged(
        bytes32 indexed hash,
        uint256 timestamp,
        address indexed submitter,
        string entryType
    );
    
    event AgentRegistered(address indexed agent, uint256 timestamp);
    event ReputationUpdated(address indexed agent, uint256 newScore);
    event BlacklistUpdated(address indexed agent, bool blacklisted);
    event MerkleRootUpdated(bytes32 newRoot);
    
    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyAuthorized() {
        require(
            authorizedSubmitters[msg.sender] || msg.sender == owner,
            "Not authorized"
        );
        _;
    }
    
    constructor() {
        owner = msg.sender;
        authorizedSubmitters[msg.sender] = true;
    }
    
    /**
     * @notice Log an audit entry
     * @param _hash Cryptographic hash of the entry data
     * @param _timestamp Unix timestamp of the entry
     * @param _entryType Type of entry (TRADE, PREDICTION, etc.)
     */
    function logEntry(
        bytes32 _hash,
        uint256 _timestamp,
        string calldata _entryType
    ) external onlyAuthorized returns (bool) {
        require(entries[_hash].timestamp == 0, "Entry exists");
        require(_timestamp <= block.timestamp, "Future timestamp");
        
        entries[_hash] = AuditEntry({
            hash: _hash,
            timestamp: _timestamp,
            entryType: _entryType,
            submitter: msg.sender,
            verified: true
        });
        
        agentEntryHashes[msg.sender].push(_hash);
        totalEntries++;
        
        // Update agent reputation
        _updateAgentActivity(msg.sender);
        
        emit EntryLogged(_hash, _timestamp, msg.sender, _entryType);
        return true;
    }
    
    /**
     * @notice Batch log multiple entries
     */
    function logEntryBatch(
        bytes32[] calldata _hashes,
        uint256[] calldata _timestamps,
        string[] calldata _entryTypes
    ) external onlyAuthorized returns (bool) {
        require(
            _hashes.length == _timestamps.length && 
            _timestamps.length == _entryTypes.length,
            "Array length mismatch"
        );
        
        for (uint i = 0; i < _hashes.length; i++) {
            logEntry(_hashes[i], _timestamps[i], _entryTypes[i]);
        }
        
        return true;
    }
    
    /**
     * @notice Verify an entry exists and matches expected data
     */
    function verifyEntry(
        bytes32 _hash,
        uint256 _expectedTimestamp,
        address _expectedSubmitter
    ) external view returns (bool) {
        AuditEntry memory entry = entries[_hash];
        
        if (entry.timestamp == 0) return false;
        if (entry.timestamp != _expectedTimestamp) return false;
        if (entry.submitter != _expectedSubmitter) return false;
        
        return true;
    }
    
    /**
     * @notice Get entry details
     */
    function getEntry(bytes32 _hash) 
        external 
        view 
        returns (
            uint256 timestamp,
            string memory entryType,
            address submitter,
            bool verified
        ) 
    {
        AuditEntry memory entry = entries[_hash];
        return (
            entry.timestamp,
            entry.entryType,
            entry.submitter,
            entry.verified
        );
    }
    
    /**
     * @notice Get all entries for an agent
     */
    function getAgentEntries(address _agent) 
        external 
        view 
        returns (bytes32[] memory) 
    {
        return agentEntryHashes[_agent];
    }
    
    /**
     * @notice Update agent reputation based on trade outcome
     */
    function updateTradeOutcome(
        address _agent,
        bool _successful,
        uint256 _volume
    ) external onlyAuthorized {
        AgentReputation storage rep = agentReputations[_agent];
        
        rep.totalTrades++;
        rep.totalVolume += _volume;
        
        if (_successful) {
            rep.successfulTrades++;
        }
        
        // Calculate reputation score
        if (rep.totalTrades > 0) {
            uint256 successRate = (rep.successfulTrades * 10000) / rep.totalTrades;
            uint256 volumeScore = rep.totalVolume > 1000000 ? 1000 : 0;
            rep.reputationScore = successRate + volumeScore;
            if (rep.reputationScore > 10000) rep.reputationScore = 10000;
        }
        
        rep.lastActivity = block.timestamp;
        
        emit ReputationUpdated(_agent, rep.reputationScore);
    }
    
    /**
     * @notice Get agent reputation score
     */
    function getAgentReputation(address _agent) 
        external 
        view 
        returns (
            uint256 score,
            uint256 totalTrades,
            uint256 successRate,
            bool isBlacklisted
        ) 
    {
        AgentReputation memory rep = agentReputations[_agent];
        
        uint256 rate = rep.totalTrades > 0 
            ? (rep.successfulTrades * 100) / rep.totalTrades 
            : 0;
            
        return (
            rep.reputationScore,
            rep.totalTrades,
            rate,
            rep.isBlacklisted
        );
    }
    
    /**
     * @notice Authorize a new submitter
     */
    function authorizeSubmitter(address _submitter) external onlyOwner {
        authorizedSubmitters[_submitter] = true;
    }
    
    /**
     * @notice Revoke submitter authorization
     */
    function revokeSubmitter(address _submitter) external onlyOwner {
        authorizedSubmitters[_submitter] = false;
    }
    
    /**
     * @notice Blacklist/unblacklist an agent
     */
    function setBlacklist(address _agent, bool _blacklisted) external onlyOwner {
        agentReputations[_agent].isBlacklisted = _blacklisted;
        emit BlacklistUpdated(_agent, _blacklisted);
    }
    
    /**
     * @notice Update Merkle root for batch verification
     */
    function updateMerkleRoot(bytes32 _newRoot) external onlyOwner {
        merkleRoot = _newRoot;
        emit MerkleRootUpdated(_newRoot);
    }
    
    /**
     * @notice Check if agent is trusted (high reputation)
     */
    function isTrustedAgent(address _agent) external view returns (bool) {
        AgentReputation memory rep = agentReputations[_agent];
        return 
            rep.reputationScore >= 7000 && // 70%+
            rep.totalTrades >= 10 &&
            !rep.isBlacklisted;
    }
    
    /**
     * @notice Internal function to update agent activity
     */
    function _updateAgentActivity(address _agent) internal {
        AgentReputation storage rep = agentReputations[_agent];
        
        if (rep.totalTrades == 0) {
            emit AgentRegistered(_agent, block.timestamp);
        }
        
        rep.lastActivity = block.timestamp;
    }
}