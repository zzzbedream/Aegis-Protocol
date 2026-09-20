import { test, expect } from '@playwright/test';

test.describe('Aegis Protocol - Institutional E2E Flow on Horizen L3', () => {

  test('Complete Institutional Flow: PureFi AML, Blinding, Confidential Deposit & Blind Liquidation', async ({ page }) => {
    // 1. Navigate to Aegis Protocol Dashboard
    await page.goto('/');

    // Verify Title and Network Badge
    await expect(page).toHaveTitle(/Aegis Protocol/);
    const networkBadge = page.locator('.badge-info', { hasText: 'Horizen L3 Rollup (Base OP Stack)' });
    await expect(networkBadge).toBeVisible();

    // 2. Verify PureFi AML Compliance Status
    const amlBadge = page.locator('.badge-success', { hasText: 'VERIFIED (PASS)' });
    await expect(amlBadge).toBeVisible();
    await expect(page.locator('text=Rule 43: Tier 1 Institutional Clearance')).toBeVisible();

    // 3. Test Client-Side Blinding & Confidential Deposit
    const depositAmountInput = page.locator('input[type="number"]').first();
    await depositAmountInput.fill('2000');

    // Verify dynamic client-side blind commitment is computed
    const commitmentDisplay = page.locator('[data-testid="blind-commitment"]');
    await expect(commitmentDisplay).toBeVisible();
    const commitmentText = await commitmentDisplay.innerText();
    expect(commitmentText.startsWith('0x')).toBeTruthy();
    expect(commitmentText.length).toBe(66); // 32 bytes in hex with 0x prefix

    // Click Deposit with PureFi AML Clearance
    const depositButton = page.locator('button', { hasText: 'Deposit Confidentially with PureFi AML Clearance' });
    await depositButton.click();

    // Wait for confirmation notification
    await expect(page.locator('text=Confidential Deposit Confirmed!')).toBeVisible({ timeout: 5000 });

    // 4. Verify Confidential Health Factor Gauge
    await expect(page.locator('text=● SAFE FROM LIQUIDATION')).toBeVisible();

    // 5. Test Blind Liquidator Role & Zero Identity Leakage
    const liquidatorTab = page.locator('button', { hasText: 'Blind Liquidator' });
    await liquidatorTab.click();

    await expect(page.locator('text=Institutional Blind Liquidation Console')).toBeVisible();
    await expect(page.locator('text=(Borrower Identity: 🔒 Blinded)').first()).toBeVisible();

    // Liquidate subcollateralized ticket
    const liquidateButton = page.locator('button', { hasText: 'Liquidate Blind' }).first();
    await liquidateButton.click();

    await expect(page.locator('text=Blind Liquidation executed!')).toBeVisible({ timeout: 5000 });

    // 6. Verify Vela TEE & zkVerify Cryptographic Inspector
    await expect(page.locator('text=Vela TEE Enclave & zkVerify Cryptographic Inspector')).toBeVisible();
    await expect(page.locator('text=Hardware-rooted key inside AWS Nitro Enclave')).toBeVisible();
    await expect(page.locator('text=verifyProofAggregation (Merkle Root verification)')).toBeVisible();
  });

});
