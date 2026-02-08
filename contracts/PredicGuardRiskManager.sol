// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./PredicGuardAudit.sol";

/**
 * @title PredicGuardRiskManager
 * @notice On-chain risk management for prediction market agents
 * @dev Enforces position limits and drawdown protection at the contract level
 */
contract PredicGuardRiskManager {
    
    struct Position {
        uint256 amount;
        uint256 entryPrice;
        uint256 entryTime;
        uint256 stopLossPrice;
        uint256 takeProfitPrice;
        bool active;
    }
    
    struct RiskProfile {
        uint256 maxPositionPercent; // Basis points (100 = 1%)
        uint256 dailyLossLimit;     // Basis points
        uint256 totalLossLimit;     // Basis points
        uint256 maxDrawdown;        // Basis points
        bool requiresApproval;
    }
    
    // State
    mapping(address => RiskProfile) public agentRiskProfiles;
    mapping(address => mapping(bytes32 => Position)) public positions;
    mapping(address => uint256) public dailyLoss;
    mapping(address => uint256) public lastResetDay;
    mapping(address => uint256) public peakValue;
    mapping(address => uint256) public currentValue;
    
    PredicGuardAudit public auditContract;
    address public owner;
    
    // Events
    event PositionOpened(
        address indexed agent,
        bytes32 indexed marketId,
        uint256 amount,
        uint256 price
    );
    
    event PositionClosed(
        address indexed agent,
        bytes32 indexed marketId,
        uint256 pnl
    );
    
    event RiskLimitHit(address indexed agent, string limitType);
    event RiskProfileUpdated(address indexed agent);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyAgent() {
        require(
            agentRiskProfiles[msg.sender].maxPositionPercent > 0,
            "Not registered agent"
        );
        _;
    }
    
    constructor(address _auditContract) {
        owner = msg.sender;
        auditContract = PredicGuardAudit(_auditContract);
    }
    
    /**
     * @notice Register an agent with risk profile
     */
    function registerAgent(
        address _agent,
        uint256 _maxPositionPercent,
        uint256 _dailyLossLimit,
        uint256 _totalLossLimit,
        uint256 _maxDrawdown,
        bool _requiresApproval
    ) external onlyOwner {
        agentRiskProfiles[_agent] = RiskProfile({
            maxPositionPercent: _maxPositionPercent,
            dailyLossLimit: _dailyLossLimit,
            totalLossLimit: _totalLossLimit,
            maxDrawdown: _maxDrawdown,
            requiresApproval: _requiresApproval
        });
        
        peakValue[_agent] = 0;
        currentValue[_agent] = 0;
        
        emit RiskProfileUpdated(_agent);
    }
    
    /**
     * @notice Check if agent can open position
     */
    function canOpenPosition(
        address _agent,
        bytes32 _marketId,
        uint256 _amount,
        uint256 _price,
        uint256 _totalValue
    ) external view returns (bool, string memory) {
        RiskProfile memory profile = agentRiskProfiles[_agent];
        
        // Check position size limit
        uint256 positionValue = _amount * _price;
        uint256 maxPosition = (_totalValue * profile.maxPositionPercent) / 10000;
        
        if (positionValue > maxPosition) {
            return (false, "Position exceeds max size");
        }
        
        // Check daily loss limit
        if (dailyLoss[_agent] >= profile.dailyLossLimit) {
            return (false, "Daily loss limit reached");
        }
        
        // Check drawdown
        if (peakValue[_agent] > 0) {
            uint256 drawdown = peakValue[_agent] - currentValue[_agent];
            uint256 drawdownPct = (drawdown * 10000) / peakValue[_agent];
            
            if (drawdownPct >= profile.maxDrawdown) {
                return (false, "Max drawdown reached");
            }
        }
        
        // Check if blacklisted
        (,,,bool isBlacklisted) = auditContract.getAgentReputation(_agent);
        if (isBlacklisted) {
            return (false, "Agent blacklisted");
        }
        
        return (true, "");
    }
    
    /**
     * @notice Open a position with risk checks
     */
    function openPosition(
        bytes32 _marketId,
        uint256 _amount,
        uint256 _price,
        uint256 _stopLossPercent,
        uint256 _takeProfitPercent
    ) external onlyAgent returns (bool) {
        _resetDailyIfNeeded(msg.sender);
        
        uint256 totalValue = currentValue[msg.sender];
        
        (bool canOpen, string memory reason) = this.canOpenPosition(
            msg.sender,
            _marketId,
            _amount,
            _price,
            totalValue
        );
        
        require(canOpen, reason);
        
        uint256 stopLossPrice = _price - ((_price * _stopLossPercent) / 10000);
        uint256 takeProfitPrice = _price + ((_price * _takeProfitPercent) / 10000);
        
        positions[msg.sender][_marketId] = Position({
            amount: _amount,
            entryPrice: _price,
            entryTime: block.timestamp,
            stopLossPrice: stopLossPrice,
            takeProfitPrice: takeProfitPrice,
            active: true
        });
        
        emit PositionOpened(msg.sender, _marketId, _amount, _price);
        return true;
    }
    
    /**
     * @notice Close position and update P&L
     */
    function closePosition(
        bytes32 _marketId,
        uint256 _exitPrice
    ) external onlyAgent returns (int256 pnl) {
        Position storage pos = positions[msg.sender][_marketId];
        require(pos.active, "No active position");
        
        uint256 entryValue = pos.amount * pos.entryPrice;
        uint256 exitValue = pos.amount * _exitPrice;
        
        pnl = int256(exitValue) - int256(entryValue);
        
        // Update daily loss if negative
        if (pnl < 0) {
            dailyLoss[msg.sender] += uint256(-pnl);
        }
        
        // Update current value
        currentValue[msg.sender] = int256(currentValue[msg.sender]) + pnl > 0 
            ? uint256(int256(currentValue[msg.sender]) + pnl)
            : 0;
        
        // Update peak
        if (currentValue[msg.sender] > peakValue[msg.sender]) {
            peakValue[msg.sender] = currentValue[msg.sender];
        }
        
        pos.active = false;
        
        emit PositionClosed(msg.sender, _marketId, pnl);
        
        // Update audit reputation
        bool successful = pnl > 0;
        auditContract.updateTradeOutcome(msg.sender, successful, pos.amount);
    }
    
    /**
     * @notice Check if position should be liquidated
     */
    function checkLiquidation(
        address _agent,
        bytes32 _marketId,
        uint256 _currentPrice
    ) external view returns (bool shouldLiquidate, string memory reason) {
        Position memory pos = positions[_agent][_marketId];
        
        if (!pos.active) {
            return (false, "");
        }
        
        if (_currentPrice <= pos.stopLossPrice) {
            return (true, "Stop loss hit");
        }
        
        if (_currentPrice >= pos.takeProfitPrice) {
            return (true, "Take profit hit");
        }
        
        return (false, "");
    }
    
    /**
     * @notice Update agent's portfolio value
     */
    function updatePortfolioValue(uint256 _newValue) external onlyAgent {
        currentValue[msg.sender] = _newValue;
        
        if (_newValue > peakValue[msg.sender]) {
            peakValue[msg.sender] = _newValue;
        }
    }
    
    /**
     * @notice Get agent's drawdown
     */
    function getDrawdown(address _agent) external view returns (uint256) {
        if (peakValue[_agent] == 0) return 0;
        
        uint256 drop = peakValue[_agent] > currentValue[_agent] 
            ? peakValue[_agent] - currentValue[_agent] 
            : 0;
            
        return (drop * 10000) / peakValue[_agent];
    }
    
    /**
     * @notice Emergency pause (set extreme limits)
     */
    function emergencyPause(address _agent) external onlyOwner {
        RiskProfile storage profile = agentRiskProfiles[_agent];
        profile.maxPositionPercent = 0;
        profile.dailyLossLimit = 0;
        
        emit RiskLimitHit(_agent, "EMERGENCY_PAUSE");
    }
    
    function _resetDailyIfNeeded(address _agent) internal {
        uint256 currentDay = block.timestamp / 86400;
        
        if (currentDay > lastResetDay[_agent]) {
            dailyLoss[_agent] = 0;
            lastResetDay[_agent] = currentDay;
        }
    }
}