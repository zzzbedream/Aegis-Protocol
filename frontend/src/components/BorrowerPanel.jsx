import React, { useState } from 'react';
import { Panel, Field, Notice, inputStyle, runAction } from './ui';
import { toBaseUnits } from '../vela/instructions';

/**
 * Every action is one encrypted PROCESS request. Deposits attach the ERC-20 amount to the same
 * request (public: sender, token, amount); the instruction itself (supply / collateral / repay)
 * stays confidential inside the enclave.
 */
export default function BorrowerPanel({ cfg, aegis, onDone }) {
  const debt = cfg.assets.debt;
  const coll = cfg.assets.collateral[0];
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState('add_collateral');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const actions = {
    add_collateral: { label: `Deposit ${coll.symbol} as collateral`, asset: coll, deposit: true, params: (u) => ({ token: coll.address, amount: u }) },
    supply: { label: `Supply ${debt.symbol} to the pool`, asset: debt, deposit: true, params: (u) => ({ amount: u }) },
    borrow: { label: `Borrow ${debt.symbol}`, asset: debt, deposit: false, params: (u) => ({ amount: u }) },
    repay: { label: `Repay ${debt.symbol}`, asset: debt, deposit: true, params: (u) => ({ amount: u }) },
    remove_collateral: { label: `Release ${coll.symbol} collateral`, asset: coll, deposit: false, params: (u) => ({ token: coll.address, amount: u }) },
    withdraw_debt: { label: `Withdraw idle ${debt.symbol}`, asset: debt, deposit: false, type: 'withdraw', params: (u) => ({ token: debt.address, amount: u, to: to || aegis?.account }) },
    withdraw_coll: { label: `Withdraw idle ${coll.symbol}`, asset: coll, deposit: false, type: 'withdraw', params: (u) => ({ token: coll.address, amount: u, to: to || aegis?.account }) },
  };
  const a = actions[action];

  const submit = async () => {
    let units;
    try {
      units = toBaseUnits(amount, a.asset.decimals);
    } catch (e) {
      setStatus({ type: 'error', message: `Invalid amount: ${e.message}` });
      return;
    }
    setBusy(true);
    await runAction(setStatus, a.label, () =>
      aegis.process(a.type || action, a.params(units), a.deposit ? { token: a.asset.address, amount: units } : undefined),
    );
    setBusy(false);
    onDone?.();
  };

  const isWithdraw = action.startsWith('withdraw');
  return (
    <Panel
      testId="borrower-panel"
      title="Position"
      subtitle="Instructions are encrypted to the enclave. Deposits and withdrawals are public by design (Vela custody); everything else is private."
      badge={<span className="badge badge-info">Encrypted</span>}
    >
      <Field label="ACTION">
        <select value={action} onChange={(e) => setAction(e.target.value)} style={inputStyle}>
          {Object.entries(actions).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </Field>
      <Field label={`AMOUNT (${a.asset.symbol})`}>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" style={inputStyle} />
      </Field>
      {isWithdraw && (
        <Field label="DESTINATION (defaults to your wallet; then use Claim)">
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={aegis?.account || '0x…'} style={inputStyle} />
        </Field>
      )}
      <Notice status={status} />
      <button className="btn btn-primary" onClick={submit} disabled={!aegis || busy || !amount} style={{ width: '100%', padding: '12px' }}>
        {busy ? 'Waiting for the enclave…' : a.label}
      </button>
    </Panel>
  );
}
