import React, { useState } from 'react';
import Navbar from './components/Navbar';
import InstitutionalAMLBadge from './components/InstitutionalAMLBadge';
import ConfidentialDepositModal from './components/ConfidentialDepositModal';
import HealthFactorWidget from './components/HealthFactorWidget';
import BlindLiquidationConsole from './components/BlindLiquidationConsole';
import EnclaveAttestationViewer from './components/EnclaveAttestationViewer';

export default function App() {
  const [account, setAccount] = useState('0x10014B7593c6E479A9573887201b15174092b772');
  const [role, setRole] = useState('borrower'); // 'borrower' | 'liquidator'

  const [amlStatus, setAmlStatus] = useState({
    isVerified: true,
    riskScore: 8,
    ruleId: 43,
    issuer: '0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7 (PureFi Tier 1)',
    validUntil: Date.now() + 3600 * 1000,
  });

  const [userPosition, setUserPosition] = useState({
    collateralAmount: '1,000.00',
    debtAmount: '6,500.00',
    healthFactor: 1.48,
  });

  // Active blind liquidation tickets for demonstration
  const [blindTickets, setBlindTickets] = useState([
    {
      commitment: '0x47e785e971d826f12081695ec5c2882329d916c0c1a4726a051fb634cd3fc832',
      collateralAsset: 'ZEN',
      collateralAmount: '1,000.00',
      debtAsset: 'USDC',
      debtAmount: '8,000.00',
      healthFactor: '0.85',
      signature: '0x50d8a54f1e73b139a23b3e14cd37d68e69f2b99c8604db55c588fc9317bbcc97',
      zkAggregationId: '0x82ea6215ca8f863432869a91ad63995883b8f75745815a2be7f8ec8c336388ab',
    },
    {
      commitment: '0x9b32fa998a12dc740192eef8172901ab92408c1a938210398410293481029348',
      collateralAsset: 'iTNOTE (RWA)',
      collateralAmount: '2,500.00',
      debtAsset: 'USDC',
      debtAmount: '225,000.00',
      healthFactor: '0.92',
      signature: '0x2bae7d1a24fd4d3a3caa643b4c8e7529aadcb6f2cbe0f2f889e223b7a35a6593',
      zkAggregationId: '0x59c8fc4b3e67af0b1e32f0e839dd5daf0fb86d1d49500dcfc7e2514d237c0d85',
    }
  ]);

  const handleDepositSuccess = (newDeposit) => {
    setUserPosition({
      collateralAmount: (parseFloat(userPosition.collateralAmount.replace(',', '')) + parseFloat(newDeposit.amount)).toLocaleString('en-US', { minimumFractionDigits: 2 }),
      debtAmount: (parseFloat(userPosition.debtAmount.replace(',', '')) + parseFloat(newDeposit.debt)).toLocaleString('en-US', { minimumFractionDigits: 2 }),
      healthFactor: 1.52,
    });
  };

  const handleLiquidate = (commitment) => {
    setBlindTickets((prev) => prev.filter((t) => t.commitment !== commitment));
  };

  return (
    <div className="app-container">
      {/* Navigation Header */}
      <Navbar
        account={account}
        role={role}
        setRole={setRole}
        onConnectWallet={() => setAccount('0x10014B7593c6E479A9573887201b15174092b772')}
      />

      {/* PureFi AML Compliance Status */}
      <InstitutionalAMLBadge amlStatus={amlStatus} />

      {/* Main Role-Based Dashboard */}
      {role === 'borrower' ? (
        <div className="dashboard-grid">
          <div>
            <ConfidentialDepositModal
              account={account}
              onDepositSuccess={handleDepositSuccess}
            />
          </div>
          <div>
            <HealthFactorWidget position={userPosition} />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '24px' }}>
          <BlindLiquidationConsole
            tickets={blindTickets}
            onLiquidate={handleLiquidate}
          />
        </div>
      )}

      {/* Cryptographic Inspector (Vela TEE Enclave + zkVerify) */}
      <EnclaveAttestationViewer />
    </div>
  );
}
