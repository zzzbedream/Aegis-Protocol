/**
 * Demo market configuration for the aegis_lending guest (constructor params of the deploy
 * request; field names match vela-app/lending/types.go). AML is omitted, so it is disabled.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function addr(value, name) {
  if (!ADDRESS.test(value || '')) throw new Error(`invalid ${name} address`);
  return value.toLowerCase();
}

export function marketParams(deployment, treasury) {
  return {
    debt: { address: addr(deployment.usdc, 'usdc'), decimals: 6 },
    collaterals: [
      { address: addr(deployment.zen, 'zen'), decimals: 18, ltvBps: 7500, liqThresholdBps: 8000, liqBonusBps: 500 },
    ],
    rateModel: { baseAprBps: 200, slope1Bps: 800, slope2Bps: 6000, kinkBps: 8000 },
    closeFactorBps: 5000,
    reserveFactorBps: 1000,
    treasury: addr(treasury, 'treasury'),
  };
}

/** aUSDC (6 decimals) worth `ratioBps` of `collateralWei` tZEN (18 decimals) at `zenE18` USD. */
export function borrowForCollateral(collateralWei, zenE18, ratioBps) {
  if (collateralWei <= 0n || zenE18 <= 0n || ratioBps <= 0n) throw new Error('invalid borrow inputs');
  const valueE18 = (collateralWei * zenE18) / 10n ** 18n;
  return (valueE18 * ratioBps) / 10_000n / 10n ** 12n;
}

/** ProcessorEndpoint derives the application id as uint64(bytes8(requestId)). */
export function applicationIdFromRequestId(requestId) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(requestId || '')) throw new Error(`invalid requestId: ${requestId}`);
  return BigInt('0x' + requestId.slice(2, 18));
}
