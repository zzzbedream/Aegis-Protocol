import { test, expect } from '@playwright/test';

test('without Vela configuration everything is disabled and nothing is simulated', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await expect(page).toHaveTitle(/Aegis Protocol/);
  await expect(page.getByTestId('config-banner')).toContainText('Vela is not configured');
  await expect(page.getByTestId('config-banner')).toContainText('VITE_VELA_PROCESSOR_ENDPOINT');
  await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeDisabled();

  // Investors land here while Vela is not configured: point them to verifiable evidence.
  const evidence = page.getByTestId('evidence-links');
  await expect(evidence.getByRole('link', { name: /ADR-001/ })).toHaveAttribute('href', /docs\/ADR-001-vela-native\.md$/);
  await expect(evidence.getByRole('link', { name: /CI/ })).toHaveAttribute('href', /actions\/workflows\/ci\.yml$/);

  const borrower = page.getByTestId('borrower-panel');
  await borrower.getByRole('textbox').first().fill('100');
  await expect(borrower.getByRole('button')).toBeDisabled();

  await page.getByRole('button', { name: 'Liquidator' }).click();
  await expect(page.getByTestId('liquidator-panel')).toContainText('never learn which account');
  await expect(page.getByRole('button', { name: /Liquidate/ })).toBeDisabled();

  // Regression: the old UI showed fabricated tickets, commitments and a zkVerify inspector.
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/zkVerify|commitment|0x10014B75|VERIFIED \(PASS\)/i);
});

test('testnet demo states its trust assumptions and offers a faucet', async ({ page }) => {
  await page.goto('http://localhost:5175/');
  await expect(page.getByTestId('config-banner')).toHaveCount(0);
  const banner = page.getByTestId('demo-banner');
  await expect(banner).toContainText('without AWS Nitro attestation');
  await expect(banner).toContainText('Test tokens only');
  await expect(banner.getByRole('link', { name: /ADR-001/ })).toBeVisible();

  // Faucet needs a connected wallet.
  const faucet = page.getByTestId('faucet-panel');
  await expect(faucet.getByRole('button', { name: 'Get test USDC' })).toBeDisabled();
  await expect(faucet.getByRole('button', { name: 'Get test ZEN' })).toBeDisabled();

  // The trust panel must not claim Nitro attestation for the demo operator.
  const trust = page.getByTestId('enclave-panel');
  await expect(trust).toContainText('operated by the Aegis team without Nitro attestation');
  await expect(trust).not.toContainText('Nitro attestation, PCR0');
});

test('without the demo flags there is no faucet and the production trust model is shown', async ({ page }) => {
  await page.goto('http://localhost:5174/');
  await expect(page.getByTestId('demo-banner')).toHaveCount(0);
  await expect(page.getByTestId('faucet-panel')).toHaveCount(0);
  await expect(page.getByTestId('enclave-panel')).toContainText('Nitro attestation, PCR0');
});

test('with configuration but no wallet, connecting reports the missing wallet', async ({ page }) => {
  await page.goto('http://localhost:5174/');
  await expect(page.getByTestId('config-banner')).toHaveCount(0);
  await expect(page.getByText('Test network')).toBeVisible();
  await expect(page.getByTestId('enclave-panel')).toContainText('0x1111111111111111111111111111111111111111');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByRole('status')).toContainText('No browser wallet found');
  // Still no account, actions still disabled.
  await expect(page.getByTestId('borrower-panel').getByRole('button')).toBeDisabled();
});
